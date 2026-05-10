// Database service for Stablecoin Business OS
// Uses sql.js (SQLite compiled to WebAssembly) for local development
// Designed to swap to PostgreSQL for production

import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../data/business-os.db');

let db = null;
let SQL = null;

export async function getDb() {
  if (db) return db;

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize sql.js
  SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  initializeSchema();
  saveDatabase();
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function initializeSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      wallet_address TEXT,
      api_key_hash TEXT UNIQUE,
      api_key_prefix TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_businesses_api_key_hash
      ON businesses(api_key_hash);

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_email TEXT,
      description TEXT,
      amount_usdc REAL NOT NULL,
      amount_fiat REAL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
      payment_tx_signature TEXT,
      due_date TEXT,
      paid_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_wallet TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
      tx_signature TEXT,
      processed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_wallet TEXT,
      amount_usdc REAL NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'cancelled', 'expired')),
      next_billing_at TEXT,
      last_billed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('payment_received', 'payout_sent', 'subscription', 'conversion', 'fee')),
      amount_usdc REAL NOT NULL,
      counterparty TEXT,
      tx_signature TEXT,
      reference_type TEXT,
      reference_id TEXT,
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS ai_insights (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );
  `);
}

// Helper: convert sql.js result to array of objects
function rowsToObjects(stmt) {
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  return results;
}

function firstRow(stmt) {
  const results = rowsToObjects(stmt);
  return results.length > 0 ? results[0] : null;
}

// ============ Business Operations ============

// API keys are stored as sha256 hashes. We keep a 12-char public prefix
// (`sbk_xxxxxxxx`) so users can identify which key they're looking at
// in logs, without exposing the secret.

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey() {
  // 32 bytes → 64 hex chars, plus a brand prefix.
  const secret = crypto.randomBytes(32).toString('hex');
  const key = `sbk_${secret}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) };
}

// createBusiness returns the business plus a one-time-visible apiKey.
// The plaintext is only returned here; only the hash is persisted.
export function createBusiness({ name, email, walletAddress }) {
  const id = crypto.randomUUID();
  const { key, hash, prefix } = generateApiKey();
  db.run(
    `INSERT INTO businesses (id, name, email, wallet_address, api_key_hash, api_key_prefix)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, email, walletAddress || null, hash, prefix]
  );
  saveDatabase();
  const business = getBusiness(id);
  return { ...business, apiKey: key };
}

export function getBusiness(id) {
  const stmt = db.prepare(
    `SELECT id, name, email, wallet_address, api_key_prefix, created_at, updated_at
     FROM businesses WHERE id = ?`
  );
  stmt.bind([id]);
  return firstRow(stmt);
}

export function getBusinessByApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return null;
  const hash = hashApiKey(apiKey);
  const stmt = db.prepare(
    `SELECT id, name, email, wallet_address, api_key_prefix, created_at, updated_at
     FROM businesses WHERE api_key_hash = ?`
  );
  stmt.bind([hash]);
  return firstRow(stmt);
}

export function listBusinesses() {
  const stmt = db.prepare(
    `SELECT id, name, email, wallet_address, api_key_prefix, created_at, updated_at
     FROM businesses ORDER BY created_at DESC`
  );
  stmt.bind([]);
  return rowsToObjects(stmt);
}

// ============ Invoice Operations ============

export function createInvoice({ businessId, clientName, clientEmail, description, amountUsdc, dueDate }) {
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO invoices (id, business_id, client_name, client_email, description, amount_usdc, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, businessId, clientName, clientEmail, description, amountUsdc, dueDate || null]
  );
  saveDatabase();
  return getInvoice(id);
}

export function getInvoice(id) {
  const stmt = db.prepare('SELECT * FROM invoices WHERE id = ?');
  stmt.bind([id]);
  return firstRow(stmt);
}

export function listInvoices(businessId) {
  const stmt = db.prepare('SELECT * FROM invoices WHERE business_id = ? ORDER BY created_at DESC');
  stmt.bind([businessId]);
  return rowsToObjects(stmt);
}

export function updateInvoiceStatus(id, status, txSignature) {
  db.run(
    `UPDATE invoices SET status = ?, payment_tx_signature = ?, paid_at = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [status, txSignature || null, status === 'paid' ? new Date().toISOString() : null, id]
  );
  saveDatabase();
  return getInvoice(id);
}

// ============ Payout Operations ============

export function createPayout({ businessId, recipientName, recipientWallet, amountUsdc, description }) {
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO payouts (id, business_id, recipient_name, recipient_wallet, amount_usdc, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, businessId, recipientName, recipientWallet, amountUsdc, description || null]
  );
  saveDatabase();
  return getPayout(id);
}

export function getPayout(id) {
  const stmt = db.prepare('SELECT * FROM payouts WHERE id = ?');
  stmt.bind([id]);
  return firstRow(stmt);
}

export function listPayouts(businessId) {
  const stmt = db.prepare('SELECT * FROM payouts WHERE business_id = ? ORDER BY created_at DESC');
  stmt.bind([businessId]);
  return rowsToObjects(stmt);
}

export function updatePayoutStatus(id, status, txSignature) {
  db.run(
    `UPDATE payouts SET status = ?, tx_signature = ?, processed_at = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [status, txSignature || null, status === 'completed' ? new Date().toISOString() : null, id]
  );
  saveDatabase();
  return getPayout(id);
}

// ============ Subscription Operations ============

export function createSubscription({ businessId, customerName, customerWallet, amountUsdc, frequency }) {
  const id = crypto.randomUUID();
  const nextBilling = calculateNextBilling(frequency);
  db.run(
    `INSERT INTO subscriptions (id, business_id, customer_name, customer_wallet, amount_usdc, frequency, next_billing_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, businessId, customerName, customerWallet, amountUsdc, frequency, nextBilling]
  );
  saveDatabase();
  return getSubscription(id);
}

export function getSubscription(id) {
  const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
  stmt.bind([id]);
  return firstRow(stmt);
}

export function listSubscriptions(businessId) {
  const stmt = db.prepare('SELECT * FROM subscriptions WHERE business_id = ? ORDER BY created_at DESC');
  stmt.bind([businessId]);
  return rowsToObjects(stmt);
}

function calculateNextBilling(frequency) {
  const now = new Date();
  switch (frequency) {
    case 'daily': return new Date(now.setDate(now.getDate() + 1)).toISOString();
    case 'weekly': return new Date(now.setDate(now.getDate() + 7)).toISOString();
    case 'monthly': return new Date(now.setMonth(now.getMonth() + 1)).toISOString();
    case 'yearly': return new Date(now.setFullYear(now.getFullYear() + 1)).toISOString();
    default: return new Date(now.setMonth(now.getMonth() + 1)).toISOString();
  }
}

// ============ Transaction Ledger ============

export function recordTransaction({ businessId, type, amountUsdc, counterparty, txSignature, referenceType, referenceId }) {
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO transactions (id, business_id, type, amount_usdc, counterparty, tx_signature, reference_type, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, businessId, type, amountUsdc, counterparty, txSignature, referenceType, referenceId]
  );
  saveDatabase();
  return getTransaction(id);
}

export function getTransaction(id) {
  const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
  stmt.bind([id]);
  return firstRow(stmt);
}

export function listTransactions(businessId, limit = 50) {
  const stmt = db.prepare(
    'SELECT * FROM transactions WHERE business_id = ? ORDER BY created_at DESC LIMIT ?'
  );
  stmt.bind([businessId, limit]);
  return rowsToObjects(stmt);
}

// ============ Dashboard Stats ============

export function getDashboardStats(businessId) {
  const totalRevenueStmt = db.prepare(
    `SELECT COALESCE(SUM(amount_usdc), 0) as total FROM invoices WHERE business_id = ? AND status = 'paid'`
  );
  totalRevenueStmt.bind([businessId]);
  const totalRevenue = firstRow(totalRevenueStmt);

  const pendingPayoutsStmt = db.prepare(
    `SELECT COALESCE(SUM(amount_usdc), 0) as total FROM payouts WHERE business_id = ? AND status = 'pending'`
  );
  pendingPayoutsStmt.bind([businessId]);
  const pendingPayouts = firstRow(pendingPayoutsStmt);

  const activeSubsStmt = db.prepare(
    `SELECT COUNT(*) as count FROM subscriptions WHERE business_id = ? AND status = 'active'`
  );
  activeSubsStmt.bind([businessId]);
  const activeSubscriptions = firstRow(activeSubsStmt);

  const mrrStmt = db.prepare(
    `SELECT COALESCE(SUM(amount_usdc), 0) as total FROM subscriptions WHERE business_id = ? AND status = 'active' AND frequency = 'monthly'`
  );
  mrrStmt.bind([businessId]);
  const monthlyRecurring = firstRow(mrrStmt);

  const pendingInvoicesStmt = db.prepare(
    `SELECT COUNT(*) as count FROM invoices WHERE business_id = ? AND status = 'sent'`
  );
  pendingInvoicesStmt.bind([businessId]);
  const pendingInvoices = firstRow(pendingInvoicesStmt);

  return {
    totalRevenue: totalRevenue.total,
    pendingPayouts: pendingPayouts.total,
    activeSubscriptions: activeSubscriptions.count,
    monthlyRecurringRevenue: monthlyRecurring.total,
    pendingInvoices: pendingInvoices.count,
  };
}
