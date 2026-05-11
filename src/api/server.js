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

// ============ Subscription Authorization (delegated billing) ============
// v0.3.0: SPL Token Approve + delegated TransferChecked.
// See src/solana/subscriptions.js for the on-chain model.

let subscriptionsOps;

// Returns an unsigned Approve transaction for the customer to sign.
app.post(
  '/api/subscriptions/:id/authorize/prepare',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  validate(schemas.authorizeSubscriptionSchema),
  async (req, res) => {
    try {
      const subscription = businessOps.getSubscription(req.params.id);
      if (!subscription || subscription.business_id !== req.business.id) {
        return res.status(404).json({ error: 'Subscription not found' });
      }
      const { customerWallet, delegateWallet, treasuryWallet, totalAuthorizedUsdc } =
        req.validated;

      const tx = await subscriptionsOps.prepareAuthorizationTx({
        customerAddress: customerWallet,
        delegateAddress: delegateWallet,
        totalAmountUsdc: totalAuthorizedUsdc,
      });

      const record = businessOps.createSubscriptionAuthorization({
        subscriptionId: req.params.id,
        customerWallet,
        delegateWallet,
        treasuryWallet,
        totalAuthorizedUsdc,
      });

      res.json({
        authorizationId: record.id,
        message:
          'Approve transaction ready. Customer must sign and submit, ' +
          'then call /confirm with the tx signature.',
        transaction: tx
          .serialize({ requireAllSignatures: false })
          .toString('base64'),
        delegate: delegateWallet,
        totalAuthorizedUsdc,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Customer (or business on their behalf) confirms the on-chain Approve
// tx landed. Marks the authorization active.
app.post(
  '/api/subscriptions/:id/authorize/confirm',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  validate(schemas.confirmAuthorizationSchema),
  async (req, res) => {
    try {
      const auth = businessOps.getAuthorizationForSubscription(req.params.id);
      if (!auth) {
        return res
          .status(404)
          .json({ error: 'No pending authorization for this subscription' });
      }
      const status = await solanaOps.verifyTransaction(req.validated.txSignature);
      if (!status.confirmed) {
        return res.status(400).json({
          error: 'Transaction not confirmed yet',
          status,
        });
      }
      const updated = businessOps.markAuthorizationActive(
        auth.id,
        req.validated.txSignature
      );
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Read the current authorization + on-chain state.
app.get(
  '/api/subscriptions/:id/authorization',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  async (req, res) => {
    try {
      const subscription = businessOps.getSubscription(req.params.id);
      if (!subscription || subscription.business_id !== req.business.id) {
        return res.status(404).json({ error: 'Subscription not found' });
      }
      const auth = businessOps.getAuthorizationForSubscription(req.params.id);
      if (!auth) {
        return res
          .status(404)
          .json({ error: 'No authorization for this subscription' });
      }
      const onChain = await subscriptionsOps.getAuthorizationState({
        customerAddress: auth.customer_wallet,
      });
      res.json({ ...auth, onChain });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Construct an unsigned charge transaction. The business signs it as
// the delegate and submits.
app.post(
  '/api/subscriptions/:id/charge/prepare',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  validate(schemas.chargeSubscriptionSchema),
  async (req, res) => {
    try {
      const auth = businessOps.getAuthorizationForSubscription(req.params.id);
      if (!auth || auth.status !== 'active') {
        return res
          .status(400)
          .json({ error: 'No active authorization for this subscription' });
      }
      if (req.validated.amountUsdc > auth.remaining_authorized_usdc) {
        return res.status(400).json({
          error: 'Charge exceeds remaining authorized amount',
          remainingAuthorizedUsdc: auth.remaining_authorized_usdc,
        });
      }

      const tx = await subscriptionsOps.prepareChargeTx({
        customerAddress: auth.customer_wallet,
        delegateAddress: auth.delegate_wallet,
        businessTreasuryAddress: auth.treasury_wallet,
        amountUsdc: req.validated.amountUsdc,
      });

      res.json({
        authorizationId: auth.id,
        message:
          'Charge transaction ready. Business (delegate) must sign and ' +
          'submit, then call /charge/record with the tx signature.',
        transaction: tx
          .serialize({ requireAllSignatures: false })
          .toString('base64'),
        amountUsdc: req.validated.amountUsdc,
        remainingAuthorizedUsdc: auth.remaining_authorized_usdc,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Record a completed charge against the authorization's remaining
// allowance.
app.post(
  '/api/subscriptions/:id/charge/record',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  validate(schemas.recordChargeSchema),
  async (req, res) => {
    try {
      const auth = businessOps.getAuthorizationForSubscription(req.params.id);
      if (!auth) {
        return res
          .status(404)
          .json({ error: 'No authorization for this subscription' });
      }
      const status = await solanaOps.verifyTransaction(req.validated.txSignature);
      if (!status.confirmed) {
        return res
          .status(400)
          .json({ error: 'Transaction not confirmed yet', status });
      }
      const updated = businessOps.recordCharge(
        auth.id,
        req.validated.amountUsdc,
        req.validated.txSignature
      );
      businessOps.recordTransaction({
        businessId: req.business.id,
        type: 'subscription',
        amountUsdc: req.validated.amountUsdc,
        counterparty: auth.customer_wallet,
        txSignature: req.validated.txSignature,
        referenceType: 'subscription',
        referenceId: req.params.id,
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Construct an unsigned Revoke tx the customer can sign to clear the
// delegate authority.
app.get(
  '/api/subscriptions/:id/authorize/revoke',
  authedLimiter,
  (req, res, next) => requireBusinessAuth(businessOps)(req, res, next),
  async (req, res) => {
    try {
      const auth = businessOps.getAuthorizationForSubscription(req.params.id);
      if (!auth) {
        return res
          .status(404)
          .json({ error: 'No authorization for this subscription' });
      }
      const tx = await subscriptionsOps.prepareRevokeTx({
        customerAddress: auth.customer_wallet,
      });
      res.json({
        authorizationId: auth.id,
        message:
          'Revoke transaction ready. Customer must sign and submit.',
        transaction: tx
          .serialize({ requireAllSignatures: false })
          .toString('base64'),
      });
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
  subscriptionsOps = await import('../solana/subscriptions.js');
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
