# Stablecoin Business Toolkit

An open-source reference implementation of stablecoin-native business
operations on Solana: invoicing, payroll, recurring billing, balance and
transaction utilities, and a statistical cashflow forecaster — all
denominated in USDC.

This repository is a **technical reference and MVP**, not a hosted
product. It is suitable for engineering teams evaluating how to build a
USDC-native back-office layer, or as a starting point for a self-hosted
deployment.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-25+-339933?logo=node.js)](https://nodejs.org)
[![Solana](https://img.shields.io/badge/Solana-Web3.js-9945FF?logo=solana)](https://solana.com)

---

## Status

| Item | Status |
|---|---|
| Reference implementation | Complete (v0.1.0 MVP) |
| Persistent storage | In-memory SQLite (sql.js) — **not durable across restarts** |
| Authentication / multi-tenancy | **Not implemented** — API is unauthenticated |
| Rate limiting | **Not implemented** |
| Test coverage | **Not implemented** |
| Production deployment | **Not recommended** in current form |

See "Production gaps" below for the full list of what would need to be
built to take this to production.

## What's in scope

- **REST API** for businesses, invoices, payouts, and subscriptions.
- **Solana client** — USDC balance lookup, unsigned-transfer construction,
  transaction verification, address validation. Mainnet RPC by default.
- **Statistical cashflow forecaster** — backward-looking SQL aggregates
  with simple projection (subscriptions + pending invoices, less
  pending payouts). **Not an LLM.** Earlier copy in this repo described
  this as an "AI Finance Assistant"; it is statistical, not generative.
- **SQLite schema** (sql.js) for businesses, invoices, payouts,
  subscriptions, and transactions.

## What's out of scope

- **Custodial wallet operations.** This toolkit only constructs unsigned
  transactions. Signing and submission are the caller's responsibility.
- **KYC / AML / sanctions screening.** Required for any production
  payments product. Not implemented.
- **PCI / SOC 2 controls.** This is an MVP; production deployments must
  add the surrounding compliance layer.
- **Multi-tenant isolation.** Every API call trusts the caller's
  `businessId` path parameter. There is no authentication.
- **Settlement guarantees / chargeback handling.** USDC transfers are
  final on-chain; off-chain dispute mechanisms are not modeled here.

## Production gaps

Anything depending on this toolkit for real money must add at least:

1. **Authentication and authorization.** Every endpoint is currently
   open. Add per-business API keys or OAuth, and require ownership
   checks on every resource.
2. **Persistent database.** Replace `sql.js` (in-memory) with PostgreSQL
   or another durable store. The current setup loses all state on
   restart.
3. **Rate limiting and abuse controls.** No request limits, no input
   size limits.
4. **Input validation.** Body validation is minimal. Add a schema
   validator (Zod, AJV) on every endpoint.
5. **Transaction signing infrastructure.** Decide whether you're
   non-custodial (return unsigned txs to the user's wallet adapter,
   current behavior) or custodial (HSM, MPC, KMS-backed signer).
6. **KYC / AML / OFAC screening.** Mandatory in most jurisdictions for
   any cross-border or business-account flow.
7. **Audit logging.** No request audit trail today.
8. **Test coverage.** No tests in this repository.

## Architecture

```
src/
├── api/
│   └── server.js          # Express REST API
├── services/
│   └── database.js        # SQLite data layer (sql.js, in-memory)
├── solana/
│   └── client.js          # Solana RPC + USDC utilities
└── ai/
    └── assistant.js       # Statistical cashflow forecaster
```

**Stack:** Node.js 18+, Express, sql.js, `@solana/web3.js`,
`@solana/spl-token`.

## Build and run

```bash
git clone https://github.com/yksanjo/stablecoin-business-os.git
cd stablecoin-business-os
npm install
npm run dev
# Server listens on http://localhost:3001
```

Verify:

```bash
curl http://localhost:3001/api/health
```

## API surface

Selected endpoints (full list in `src/api/server.js`):

```bash
# Businesses
POST /api/businesses
GET  /api/businesses
GET  /api/businesses/:id
GET  /api/businesses/:id/dashboard

# Invoices
POST /api/businesses/:id/invoices
GET  /api/businesses/:id/invoices
POST /api/invoices/:id/pay        # records an on-chain tx signature

# Payouts
POST /api/businesses/:id/payouts

# Subscriptions
POST /api/businesses/:id/subscriptions

# Forecasting (statistical, not generative)
GET  /api/businesses/:id/ai/forecast?months=3
GET  /api/businesses/:id/ai/health

# Solana utilities
GET  /api/wallet/:address/balance
POST /api/transfer/prepare        # returns unsigned tx
```

## License

MIT. See `LICENSE`.

## Disclosures

This implementation was developed with assistance from AI coding tools.
No portion of this repository should be considered production-ready or
audited.
