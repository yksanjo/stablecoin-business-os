// Stablecoin Business OS — API Server
// Express-based REST API for stablecoin invoicing, payroll, and treasury

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb } from '../services/database.js';

// Import will be done after DB init
let db;
let businessOps, solanaOps, aiOps;

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ============ Health Check ============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Stablecoin Business OS',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// ============ Businesses ============

app.post('/api/businesses', (req, res) => {
  try {
    const { name, email, walletAddress } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    const business = businessOps.createBusiness({ name, email, walletAddress });
    res.status(201).json(business);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/businesses', (req, res) => {
  try {
    res.json(businessOps.listBusinesses());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/businesses/:id', (req, res) => {
  try {
    const business = businessOps.getBusiness(req.params.id);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    res.json(business);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Dashboard ============

app.get('/api/businesses/:id/dashboard', (req, res) => {
  try {
    const stats = businessOps.getDashboardStats(req.params.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Invoices ============

app.post('/api/businesses/:id/invoices', (req, res) => {
  try {
    const { clientName, clientEmail, description, amountUsdc, dueDate } = req.body;
    if (!clientName || !amountUsdc) {
      return res.status(400).json({ error: 'Client name and amount are required' });
    }
    const invoice = businessOps.createInvoice({
      businessId: req.params.id,
      clientName,
      clientEmail,
      description,
      amountUsdc: parseFloat(amountUsdc),
      dueDate,
    });
    res.status(201).json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/businesses/:id/invoices', (req, res) => {
  try {
    res.json(businessOps.listInvoices(req.params.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices/:id', (req, res) => {
  try {
    const invoice = businessOps.getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invoices/:id/pay', (req, res) => {
  try {
    const { txSignature } = req.body;
    if (!txSignature) {
      return res.status(400).json({ error: 'Transaction signature is required' });
    }
    const invoice = businessOps.updateInvoiceStatus(req.params.id, 'paid', txSignature);

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
});

// ============ Payouts (Payroll) ============

app.post('/api/businesses/:id/payouts', (req, res) => {
  try {
    const { recipientName, recipientWallet, amountUsdc, description } = req.body;
    if (!recipientName || !recipientWallet || !amountUsdc) {
      return res.status(400).json({ error: 'Recipient name, wallet, and amount are required' });
    }
    if (!solanaOps.isValidWalletAddress(recipientWallet)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }
    const payout = businessOps.createPayout({
      businessId: req.params.id,
      recipientName,
      recipientWallet,
      amountUsdc: parseFloat(amountUsdc),
      description,
    });
    res.status(201).json(payout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/businesses/:id/payouts', (req, res) => {
  try {
    res.json(businessOps.listPayouts(req.params.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payouts/:id/process', (req, res) => {
  try {
    const { txSignature } = req.body;
    const status = txSignature ? 'completed' : 'processing';
    const payout = businessOps.updatePayoutStatus(req.params.id, status, txSignature);

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
});

// ============ Subscriptions ============

app.post('/api/businesses/:id/subscriptions', (req, res) => {
  try {
    const { customerName, customerWallet, amountUsdc, frequency } = req.body;
    if (!customerName || !amountUsdc || !frequency) {
      return res.status(400).json({ error: 'Customer name, amount, and frequency are required' });
    }
    const validFrequencies = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ error: `Frequency must be one of: ${validFrequencies.join(', ')}` });
    }
    const subscription = businessOps.createSubscription({
      businessId: req.params.id,
      customerName,
      customerWallet,
      amountUsdc: parseFloat(amountUsdc),
      frequency,
    });
    res.status(201).json(subscription);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/businesses/:id/subscriptions', (req, res) => {
  try {
    res.json(businessOps.listSubscriptions(req.params.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Transactions ============

app.get('/api/businesses/:id/transactions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    res.json(businessOps.listTransactions(req.params.id, limit));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Solana Actions ============

app.get('/api/wallet/:address/balance', async (req, res) => {
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

app.post('/api/transfer/prepare', async (req, res) => {
  try {
    const { sender, recipient, amountUsdc } = req.body;
    if (!sender || !recipient || !amountUsdc) {
      return res.status(400).json({ error: 'Sender, recipient, and amount are required' });
    }
    if (!solanaOps.isValidWalletAddress(sender) || !solanaOps.isValidWalletAddress(recipient)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const transaction = await solanaOps.createUsdcTransfer(sender, recipient, parseFloat(amountUsdc));

    res.json({
      message: 'Transaction prepared. Sign and send with your wallet.',
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
      sender,
      recipient,
      amountUsdc: parseFloat(amountUsdc),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transaction/verify', async (req, res) => {
  try {
    const { txSignature } = req.body;
    if (!txSignature) {
      return res.status(400).json({ error: 'Transaction signature is required' });
    }
    const result = await solanaOps.verifyTransaction(txSignature);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wallet/:address/transactions', async (req, res) => {
  try {
    if (!solanaOps.isValidWalletAddress(req.params.address)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }
    const limit = parseInt(req.query.limit) || 10;
    const transactions = await solanaOps.getRecentTransactions(req.params.address, limit);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ AI Features ============

app.get('/api/businesses/:id/ai/forecast', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 3;
    const forecast = await aiOps.generateCashflowForecast(req.params.id, months);
    res.json(forecast);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/businesses/:id/ai/health', async (req, res) => {
  try {
    const report = await aiOps.generateHealthReport(req.params.id);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/categorize', (req, res) => {
  try {
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }
    const category = aiOps.categorizeTransaction(description);
    res.json({ description, category });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Initialize & Start ============

async function start() {
  try {
    // Initialize database
    db = await getDb();
    console.log('✓ Database initialized');

    // Lazy-load modules after DB is ready
    businessOps = await import('../services/database.js');
    solanaOps = await import('../solana/client.js');
    aiOps = await import('../ai/assistant.js');

    app.listen(PORT, () => {
      console.log(`
  ╔══════════════════════════════════════════╗
  ║  Stablecoin Business OS v0.1.0           ║
  ║  Running on http://localhost:${PORT}        ║
  ║  API: http://localhost:${PORT}/api          ║
  ║  Health: http://localhost:${PORT}/api/health ║
  ╚══════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
