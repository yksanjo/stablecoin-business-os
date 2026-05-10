# ☀️ Stablecoin Business OS

**The operating system for internet-native businesses.**

Invoicing, payroll, subscriptions, treasury, and AI finance — all powered by stablecoins on Solana.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm run dev
```

Server starts at **http://localhost:3001**

## 📋 API Overview

### Businesses
```bash
# Create a business
curl -X POST http://localhost:3001/api/businesses \
  -H "Content-Type: application/json" \
  -d '{"name":"My Studio","email":"hello@studio.com"}'

# List businesses
curl http://localhost:3001/api/businesses
```

### Invoices
```bash
# Create an invoice
curl -X POST http://localhost:3001/api/businesses/:id/invoices \
  -H "Content-Type: application/json" \
  -d '{"clientName":"Client Inc.","amountUsdc":5000,"dueDate":"2026-06-01"}'

# List invoices
curl http://localhost:3001/api/businesses/:id/invoices

# Mark as paid
curl -X POST http://localhost:3001/api/invoices/:id/pay \
  -H "Content-Type: application/json" \
  -d '{"txSignature":"5KtPn...wq3p"}'
```

### Payroll (Payouts)
```bash
# Create a payout
curl -X POST http://localhost:3001/api/businesses/:id/payouts \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Yoshi","recipientWallet":"7EcDh...","amountUsdc":1500}'

# Process payout
curl -X POST http://localhost:3001/api/payouts/:id/process \
  -H "Content-Type: application/json" \
  -d '{"txSignature":"5KtPn...wq3p"}'
```

### Subscriptions
```bash
# Create a subscription
curl -X POST http://localhost:3001/api/businesses/:id/subscriptions \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Creator Pro","amountUsdc":99,"frequency":"monthly"}'
```

### AI Finance Assistant
```bash
# Cashflow forecast
curl http://localhost:3001/api/businesses/:id/ai/forecast?months=3

# Financial health report
curl http://localhost:3001/api/businesses/:id/ai/health

# Categorize a transaction
curl -X POST http://localhost:3001/api/ai/categorize \
  -H "Content-Type: application/json" \
  -d '{"description":"AWS hosting services"}'
```

### Solana Wallet
```bash
# Check wallet balance
curl http://localhost:3001/api/wallet/:address/balance

# Prepare USDC transfer
curl -X POST http://localhost:3001/api/transfer/prepare \
  -H "Content-Type: application/json" \
  -d '{"sender":"...","recipient":"...","amountUsdc":100}'

# Verify transaction
curl -X POST http://localhost:3001/api/transaction/verify \
  -H "Content-Type: application/json" \
  -d '{"txSignature":"5KtPn...wq3p"}'
```

## 🏗 Architecture

```
src/
├── api/
│   └── server.js          # Express REST API (30+ endpoints)
├── services/
│   └── database.js        # SQLite data layer (sql.js)
├── solana/
│   └── client.js          # Solana RPC + USDC operations
└── ai/
    └── assistant.js       # AI cashflow forecasting + insights
```

## 🧠 AI Features

- **Cashflow Forecasting** — Predicts revenue 3-6 months ahead using historical data + subscription MRR
- **Financial Health Score** — Grades businesses A-D based on revenue, obligations, overdue invoices
- **Transaction Categorization** — Auto-categorizes expenses (revenue, payroll, infra, marketing, etc.)
- **Smart Insights** — Natural language recommendations based on financial patterns

## 💡 Why This Exists

The Solana ecosystem is evolving from "fast chain for traders" into **"internet financial operating system."** Stablecoins are becoming the killer app for payments.

Existing tools are either:
- **Consumer DeFi** (Jupiter, Kamino, Marginfi)
- **Enterprise-only** (Circle, Paxos, Chainalysis)
- **Single-feature** (Helio = Shopify only, Sphere = API only)

**Stablecoin Business OS** is the first unified platform for internet-native businesses:
- Invoicing + Payroll + Subscriptions + Treasury + AI
- Built for SMBs and creator economy
- Solana-first, multi-chain ready

## 🎯 Target Market

1. **Creator economy** — AI music licensing, podcast monetization, cross-border royalties
2. **Remote teams** — Global payroll in USDC, instant settlements
3. **Solana-native businesses** — DAOs, protocols, NFT projects needing treasury tools
4. **SaaS companies** — Subscription billing in stablecoins

## 📊 Revenue Model

| Feature | Pricing |
|---------|---------|
| Invoicing | Free + 0.5% per payment |
| Payroll | $10/mo + $1/employee |
| Subscriptions | 1% of volume |
| AI Treasury | $50/mo |
| Tax exports | $20/mo |
| API access | Pay-as-you-go |

## 🛠 Tech Stack

- **Runtime:** Node.js (v25+)
- **Framework:** Express
- **Database:** SQLite (sql.js) → PostgreSQL (production)
- **Blockchain:** Solana (web3.js + SPL Token)
- **AI:** Rule-based engine (LLM integration coming)

## 🔜 Roadmap

- [ ] Web dashboard (React)
- [ ] Wallet adapter (Phantom, Backpack)
- [ ] Multi-chain support (Base, Arbitrum)
- [ ] LLM-powered AI assistant
- [ ] Fiat on/off ramp orchestration
- [ ] Tax export (CSV, QuickBooks)
- [ ] Dispute/resolution system
- [ ] Mobile app

## 📄 License

MIT
