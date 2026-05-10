// Stablecoin Business OS — API Server
//
// REST API for stablecoin invoicing, payroll, subscriptions, and
// transaction utilities. v0.2.0 adds API-key authentication, schema
// validation (zod), and per-route rate limiting.
//
// Auth model:
//   - POST /api/businesses     unauthenticated (signup); returns a one-
//                              time-visible API key in the response.
//   - GET  /api/health         unauthenticated.
//   - /api/wallet/...          unauthenticated utility routes
//                              (Solana RPC passthrough), rate-limited.
//   - everything else          requires X-API-Key header that owns the
//                              :id business in the path.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb } from '../services/database.js';
import { validate } from '../middleware/validate.js';
import { requireBusinessAuth, requireOwnership } from '../middleware/auth.js';
import {
  signupLimiter,
  publicLimiter,
  authedLimiter,
} from '../middleware/rateLimit.js';
import * as schemas from '../schemas/index.js';

let db;
let businessOps, solanaOps, aiOps;

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '256kb' }));

// ============ Health ============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Stablecoin Business OS',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
  });
});

// ============ Businesses ============

// Signup: unauthenticated, rate-limited. Returns the API key ONCE.
app.post(
  '/api/businesses',
  signupLimiter,
  validate(schemas.createBusinessSchema),
  (req, res) => {
    try {
      const business = businessOps.createBusiness(req.validated);
      res.status(201).json({
        ...business,
        _meta: {
          message:
            'Store the apiKey now — it will not be shown again. ' +
            'Send it in the X-API-Key header on subsequent requests.',
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Whoami: returns the business owning the provided API key.
app.get('/api/businesses/me', authedLimiter, (req, res) => {
  const auth = requireBusinessAuth(businessOps);
  auth(req, res, () => res.json(req.business));
});

app.get(
  '/api/businesses/:id',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  (req, res) => res.json(req.business)
);

app.get(
  '/api/businesses/:id/dashboard',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  (req, res) => {
    try {
      res.json(businessOps.getDashboardStats(req.params.id));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============ Invoices ============

app.post(
  '/api/businesses/:id/invoices',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  validate(schemas.createInvoiceSchema),
  (req, res) => {
    try {
      const invoice = businessOps.createInvoice({
        businessId: req.params.id,
        ...req.validated,
      });
      res.status(201).json(invoice);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  '/api/businesses/:id/invoices',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  (req, res) => {
    try {
      res.json(businessOps.listInvoices(req.params.id));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  '/api/invoices/:id',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  (req, res, next) =>
    requireOwnership(businessOps, businessOps.getInvoice)(req, res, next),
  (req, res) => res.json(req.resource)
);

app.post(
  '/api/invoices/:id/pay',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  (req, res, next) =>
    requireOwnership(businessOps, businessOps.getInvoice)(req, res, next),
  validate(schemas.payInvoiceSchema),
  (req, res) => {
    try {
      const { txSignature } = req.validated;
      const invoice = businessOps.updateInvoiceStatus(
        req.params.id,
        'paid',
        txSignature
      );
      businessOps.recordTransaction({
        businessId: invoice.business_id,
        type: 'payment_received',
        amountUsdc: invoice.amount_usdc,
        counterparty: invoice.client_name,
        txSignature,
        referenceType: 'invoice',
        referenceId: invoice.id,
      });
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============ Payouts (Payroll) ============

app.post(
  '/api/businesses/:id/payouts',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  validate(schemas.createPayoutSchema),
  (req, res) => {
    try {
      const { recipientWallet } = req.validated;
      if (!solanaOps.isValidWalletAddress(recipientWallet)) {
        return res
          .status(400)
          .json({ error: 'Invalid Solana wallet address' });
      }
      const payout = businessOps.createPayout({
        businessId: req.params.id,
        ...req.validated,
      });
      res.status(201).json(payout);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  '/api/businesses/:id/payouts',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  (req, res) => {
    try {
      res.json(businessOps.listPayouts(req.params.id));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/payouts/:id/process',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  (req, res, next) =>
    requireOwnership(businessOps, businessOps.getPayout)(req, res, next),
  validate(schemas.processPayoutSchema),
  (req, res) => {
    try {
      const { txSignature } = req.validated;
      const status = txSignature ? 'completed' : 'processing';
      const payout = businessOps.updatePayoutStatus(
        req.params.id,
        status,
        txSignature
      );
      if (txSignature) {
        businessOps.recordTransaction({
          businessId: payout.business_id,
          type: 'payout_sent',
          amountUsdc: payout.amount_usdc,
          counterparty: payout.recipient_name,
          txSignature,
          referenceType: 'payout',
          referenceId: payout.id,
        });
      }
      res.json(payout);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============ Subscriptions ============

app.post(
  '/api/businesses/:id/subscriptions',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  validate(schemas.createSubscriptionSchema),
  (req, res) => {
    try {
      const subscription = businessOps.createSubscription({
        businessId: req.params.id,
        ...req.validated,
      });
      res.status(201).json(subscription);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  '/api/businesses/:id/subscriptions',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  (req, res) => {
    try {
      res.json(businessOps.listSubscriptions(req.params.id));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============ Transactions ============

app.get(
  '/api/businesses/:id/transactions',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 500);
      res.json(businessOps.listTransactions(req.params.id, limit));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============ Solana Utility Routes (public, rate-limited) ============

app.get('/api/wallet/:address/balance', publicLimiter, async (req, res) => {
  try {
    if (!solanaOps.isValidWalletAddress(req.params.address)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }
    const [usdc, sol] = await Promise.all([
      solanaOps.getUsdcBalance(req.params.address),
      solanaOps.getSolBalance(req.params.address),
    ]);
    res.json({ address: req.params.address, usdc, sol });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post(
  '/api/transfer/prepare',
  publicLimiter,
  validate(schemas.prepareTransferSchema),
  async (req, res) => {
    try {
      const { sender, recipient, amountUsdc } = req.validated;
      const transaction = await solanaOps.createUsdcTransfer(
        sender,
        recipient,
        amountUsdc
      );
      res.json({
        message: 'Transaction prepared. Sign and send with your wallet.',
        transaction: transaction
          .serialize({ requireAllSignatures: false })
          .toString('base64'),
        sender,
        recipient,
        amountUsdc,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/transaction/verify',
  publicLimiter,
  validate(schemas.verifyTransactionSchema),
  async (req, res) => {
    try {
      const result = await solanaOps.verifyTransaction(
        req.validated.txSignature
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  '/api/wallet/:address/transactions',
  publicLimiter,
  async (req, res) => {
    try {
      if (!solanaOps.isValidWalletAddress(req.params.address)) {
        return res
          .status(400)
          .json({ error: 'Invalid Solana wallet address' });
      }
      const limit = Math.min(parseInt(req.query.limit) || 10, 100);
      const transactions = await solanaOps.getRecentTransactions(
        req.params.address,
        limit
      );
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============ Forecasting / Insights (authenticated) ============

app.get(
  '/api/businesses/:id/ai/forecast',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  async (req, res) => {
    try {
      const months = Math.min(parseInt(req.query.months) || 3, 12);
      const forecast = await aiOps.generateCashflowForecast(
        req.params.id,
        months
      );
      res.json(forecast);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  '/api/businesses/:id/ai/health',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  async (req, res) => {
    try {
      const report = await aiOps.generateHealthReport(req.params.id);
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/ai/categorize',
  publicLimiter,
  validate(schemas.categorizeSchema),
  (req, res) => {
    try {
      const category = aiOps.categorizeTransaction(req.validated.description);
      res.json({ description: req.validated.description, category });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============ Bootstrap ============

export async function createApp() {
  db = await getDb();
  businessOps = await import('../services/database.js');
  solanaOps = await import('../solana/client.js');
  aiOps = await import('../ai/assistant.js');
  return app;
}

async function start() {
  try {
    await createApp();
    app.listen(PORT, () => {
      console.log(
        `Stablecoin Business OS v0.2.0 — http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start the server when run directly. Tests can import createApp().
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  start();
}
