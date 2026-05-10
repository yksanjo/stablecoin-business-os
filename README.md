# ☀️ Stablecoin Business OS

**The open-source operating system for internet-native businesses.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-25+-339933?logo=node.js)](https://nodejs.org)
[![Solana](https://img.shields.io/badge/Solana-1.95-9945FF?logo=solana)](https://solana.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen)](CONTRIBUTING.md)
[![Twitter](https://img.shields.io/badge/Twitter-@yoshikondo-1DA1F2)](https://twitter.com/yoshikondo)

Invoicing, payroll, subscriptions, treasury, and AI finance — all powered by **USDC on Solana**.

> 🏗 **v0.1.0** — MVP stage. Ready for experimentation and contribution.

---

## 🎯 Why This Exists

The Solana ecosystem is evolving from *"fast chain for traders"* into **the internet's financial operating system.** Stablecoins are becoming the killer app for payments.

Existing tools are fragmented:
- **Consumer DeFi** — Jupiter, Kamino, Marginfi (trading/lending, not business ops)
- **Enterprise-only** — Circle, Paxos, Chainalysis (expensive, overkill for SMBs)
- **Single-feature** — Helio (Shopify only), Sphere (API only, no AI)

**Stablecoin Business OS** is the first unified, open-source platform for:
- Freelancers getting paid in USDC
- DAOs managing global payroll
- Creator studios invoicing clients
- Remote teams doing cross-border payments

---

## ✨ Features

### 💳 Invoicing
- Create invoices in USDC
- Send payment links to clients
- Track paid / overdue / draft status
- Record on-chain transaction signatures

### 💸 Payroll
- Pay team members in USDC
- Support for any Solana wallet
- Track pending and completed payouts
- Full transaction ledger

### 🔄 Subscriptions
- Recurring billing (daily, weekly, monthly, yearly)
- Automatic next-billing calculation
- Active / paused / cancelled status

### 🤖 AI Finance Assistant
- **Cashflow Forecasting** — Predict revenue 3-6 months ahead
- **Financial Health Score** — Grade your business A-D
- **Transaction Categorization** — Auto-sort expenses
- **Smart Insights** — Actionable recommendations

### ⛓️ Solana Integration
- Check USDC and SOL balances
- Prepare unsigned USDC transfers
- Verify on-chain transaction status
- Validate wallet addresses

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/yoshikondo/stablecoin-business-os.git
cd stablecoin-business-os

# Install dependencies
npm install

# Start the server
npm run dev
```

Server starts at **http://localhost:3001**

```bash
# Check it's alive
curl http://localhost:3001/api/health
```

---

## 📋 API Reference

### Businesses
```bash
# Create a business
curl -X POST http://localhost:3001/api/businesses \
  -H "Content-Type: application/json" \
  -d '{"name":"My Studio","email":"hello@studio.com"}'

# List all businesses
curl http://localhost:3001/api/businesses
```

### Invoices
```bash
# Create an invoice
curl -X POST http://localhost:3001/api/businesses/:id/invoices \
  -H "Content-Type: application/json" \
  -d '{"clientName":"Client Inc.","amountUsdc":5000,"dueDate":"2026-06-01"}'

# Mark as paid (with on-chain tx)
curl -X POST http://localhost:3001/api/invoices/:id/pay \
  -H "Content-Type: application/json" \
  -d '{"txSignature":"5KtPn...wq3p"}'
```

### Payroll
```bash
# Create a payout
curl -X POST http://localhost:3001/api/businesses/:id/payouts \
  -H "Content-Type: application/json" \
  -d '{"recipientName":"Yoshi","recipientWallet":"7EcDh...","amountUsdc":1500}'
```

### AI Finance
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

### Solana
```bash
# Check wallet balance
curl http://localhost:3001/api/wallet/:address/balance

# Prepare USDC transfer (returns unsigned tx)
curl -X POST http://localhost:3001/api/transfer/prepare \
  -H "Content-Type: application/json" \
  -d '{"sender":"...","recipient":"...","amountUsdc":100}'
```

---

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

**Stack:** Node.js 25+ · Express · SQLite (sql.js) · Solana Web3.js · SPL Token

---

## 📊 Competitive Landscape

| Company | Focus | Gap |
|---------|-------|-----|
| **Sphere** | Payments API | No AI, no payroll, no treasury |
| **Helio** | Shopify payments | Shopify-only, no subscriptions |
| **Circle** | Enterprise stablecoins | Expensive, not for SMBs |
| **Request Finance** | Multi-chain invoicing | Not Solana-first, no AI |
| **Bitwage** | Crypto payroll | Bitcoin-focused, not Solana |
| **⬅️ This project** | **Unified business OS** | **First to combine all + AI** |

[Full competitive research →](RESEARCH.md)

---

## 🎯 Target Audience

1. **Creator economy** — AI music licensing, podcast monetization, cross-border royalties
2. **Remote teams** — Global payroll in USDC, instant settlements
3. **Solana-native businesses** — DAOs, protocols, NFT projects
4. **SaaS companies** — Subscription billing in stablecoins

---

## 🛣 Roadmap

- [ ] **Web dashboard** — React frontend with charts
- [ ] **Wallet adapter** — Phantom, Backpack, Solflare
- [ ] **LLM-powered AI** — Natural language finance queries
- [ ] **Multi-chain** — Base, Arbitrum, Polygon
- [ ] **Fiat on/off ramps** — Jupiter, Circle API
- [ ] **Tax exports** — CSV, QuickBooks, CoinTracker
- [ ] **Dispute system** — Chargeback resolution for stablecoins
- [ ] **Mobile app** — React Native

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

Ideas for first PRs:
- Add a React dashboard
- Integrate Phantom wallet
- Add more AI insight types
- Write tests

---

## 📄 License

MIT © [Yoshi Kondo](https://github.com/yoshikondo)

---

## ⭐ Support

If this project is useful, **star the repo** and share it with Solana builders!

[![Twitter](https://img.shields.io/badge/Follow-@yoshikondo-1DA1F2?style=social)](https://twitter.com/yoshikondo)
