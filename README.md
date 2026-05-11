# Stablecoin Business OS

Open-source toolkit for stablecoin-native business operations on Solana
— invoicing, payroll, subscriptions, transaction utilities, and a
statistical cashflow forecaster, all denominated in USDC.

Built by **Yoshi Kondo** ([@yksanjo](https://github.com/yksanjo)) with
AI pair-programming assistance from **[Claude](https://claude.ai)** by
Anthropic.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)
![Solana](https://img.shields.io/badge/Solana-Web3.js-9945FF?logo=solana)
![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Tests](https://img.shields.io/badge/tests-29%20passing-brightgreen)

---

## What's new in v0.3.0

**Delegated subscription billing.** v0.2 stored subscription
schedules but had no on-chain pull mechanism — each billing cycle
required the business to reissue an invoice. v0.3 closes that gap
using the existing SPL Token primitives:

1. Customer signs an SPL Token `Approve` granting the business an
   allowance up to N × subscription amount.
2. On each cycle, the business signs a delegated `TransferChecked`
   that pulls one period's worth, drawing down the allowance.
3. Customer can revoke at any time with `Revoke()`.

No new on-chain program required — this uses Solana's
battle-tested SPL Token delegation. The biller process (cron that
calls `/charge/prepare` on each cycle) is the business's
responsibility; the API exposes the building block.

**Honest caveat:** this code constructs the correct Solana
transactions and is unit-tested offline, but has not yet been
validated against a live RPC. Run a devnet round-trip before
relying on it in production.

## What's new in v0.2.0

- **API-key authentication** on every business-owned resource. Signup
  returns a one-time-visible key; the key's SHA-256 hash is stored
  server-side, the plaintext is never persisted.
- **Per-request schema validation** with zod. Every body-taking
  endpoint has a typed schema and returns structured `400`s on bad
  input.
- **Rate limiting** across three tiers (signup, public utilities,
  authenticated). Authenticated routes are keyed by API key rather
  than IP.
- **21 tests** covering auth, validation, and database layers.
  `npm test` runs them via the built-in `node --test` runner.

## What this is

A reference implementation showing how to build a USDC-native business
back-office on Solana. The whole stack runs in a single Node process
against a SQLite-via-WebAssembly database, so you can start it
locally in seconds and inspect every layer.

**Use this as:** a starting point for a self-hosted deployment, a
reference for how the pieces (Solana RPC, invoice/payout state,
forecasting) fit together, or a portfolio/showcase artifact.

**Don't use this as:** a turnkey hosted product. The README documents
what's production-ready and what isn't.

## Status

| Item | Status |
|---|---|
| API-key authentication | ✅ v0.2.0 |
| Input validation (zod) | ✅ v0.2.0 |
| Rate limiting | ✅ v0.2.0 |
| Test coverage | ✅ 21 tests, auth + validation + db |
| Persistent storage | ⚠️ SQLite via sql.js — durable to disk, single-process |
| Multi-tenant isolation | ✅ per API-key ownership checks on every resource |
| KYC / AML / OFAC | ❌ not implemented |
| Production deployment | ⚠️ MVP — see "Production gaps" |

## Quick start

```bash
git clone https://github.com/yksanjo/stablecoin-business-os.git
cd stablecoin-business-os
npm install
npm run dev
# Server: http://localhost:3001
```

Sign up and grab an API key (the key is shown **once**):

```bash
curl -X POST http://localhost:3001/api/businesses \
  -H "Content-Type: application/json" \
  -d '{"name":"My Studio","email":"hello@studio.com"}'

# Response includes "apiKey": "sbk_..." — store it.
```

Use the key on subsequent requests:

```bash
curl http://localhost:3001/api/businesses/me \
  -H "X-API-Key: sbk_..."
```

## Authentication

The auth model is straightforward:

- **Public, unauthenticated:** `GET /api/health`, `POST /api/businesses`
  (signup), and the Solana utility routes (`/api/wallet/...`,
  `/api/transfer/prepare`, `/api/transaction/verify`,
  `/api/ai/categorize`). All are rate-limited.
- **Authenticated (X-API-Key header):** every other route. The key
  is matched against the `:id` business in the URL; mismatches
  return `403`.
- **Sub-resource ownership:** `GET /api/invoices/:id` and the payout-
  process route additionally verify the resource's `business_id`
  matches the API key's business.

API keys are 32-byte secrets formatted as `sbk_<64-hex>`. Only the
SHA-256 hash and a 12-char public prefix (for log identification)
are stored. Lose the key and you lose access — there is no
"recover by email" in v0.2.

## Rate limits

| Tier | Window | Limit |
|---|---|---|
| Signup (`POST /api/businesses`) | 15 min | 5 / IP |
| Public utilities (`/api/wallet/*`, `/api/transfer/*`, etc.) | 1 min | 60 / IP |
| Authenticated routes | 1 min | 300 / API key |

Limits are enforced by `express-rate-limit` and respond with
standard `RateLimit-*` headers.

## API surface

```
# Auth & signup
POST   /api/businesses                    (signup → returns apiKey once)

# Authenticated
GET    /api/businesses/me                 (whoami)
GET    /api/businesses/:id                (must own)
GET    /api/businesses/:id/dashboard
POST   /api/businesses/:id/invoices
GET    /api/businesses/:id/invoices
GET    /api/invoices/:id                  (ownership-checked)
POST   /api/invoices/:id/pay              (records on-chain tx)
POST   /api/businesses/:id/payouts
GET    /api/businesses/:id/payouts
POST   /api/payouts/:id/process           (ownership-checked)
POST   /api/businesses/:id/subscriptions
GET    /api/businesses/:id/subscriptions
GET    /api/businesses/:id/transactions
GET    /api/businesses/:id/ai/forecast
GET    /api/businesses/:id/ai/health

# Subscription delegated billing (v0.3.0)
POST   /api/subscriptions/:id/authorize/prepare    (returns Approve tx)
POST   /api/subscriptions/:id/authorize/confirm    (record tx signature)
GET    /api/subscriptions/:id/authorization        (state + on-chain)
POST   /api/subscriptions/:id/charge/prepare       (returns Transfer tx)
POST   /api/subscriptions/:id/charge/record        (record + decrement allowance)
GET    /api/subscriptions/:id/authorize/revoke     (returns Revoke tx)

# Public (rate-limited)
GET    /api/health
GET    /api/wallet/:address/balance       (Solana RPC)
GET    /api/wallet/:address/transactions
POST   /api/transfer/prepare              (returns unsigned tx)
POST   /api/transaction/verify
POST   /api/ai/categorize                 (heuristic classifier)
```

Full route source: `src/api/server.js`.

## Architecture

```
src/
├── api/server.js          # Express app + route wiring
├── middleware/
│   ├── auth.js            # requireBusinessAuth, requireOwnership
│   ├── validate.js        # zod-backed body validation
│   └── rateLimit.js       # 3-tier express-rate-limit
├── schemas/index.js       # zod schemas (one per body-taking route)
├── services/database.js   # sql.js — businesses, invoices, payouts,
│                          #          subscriptions, transactions
├── solana/
│   ├── client.js          # USDC balance, unsigned transfers,
│   │                      #          tx verification
│   └── subscriptions.js   # SPL Token Approve / TransferChecked /
│                          #          Revoke for delegated billing (v0.3)
├── ai/assistant.js        # statistical cashflow forecaster + health
└── __tests__/             # auth, validation, database tests
```

**Stack:** Node 18+, Express, `express-rate-limit`, `zod`, `sql.js`,
`@solana/web3.js`, `@solana/spl-token`.

## Honest scope

- **Statistical, not generative, "AI."** The cashflow forecaster is
  a SQL aggregate with a simple projection (subscriptions + pending
  invoices, less pending payouts). Earlier README copy called this an
  "AI Finance Assistant" — corrected.
- **Solana mainnet by default.** RPC defaults to
  `api.mainnet-beta.solana.com`. For testing, set `SOLANA_RPC_URL`
  to a devnet endpoint.
- **Custody:** non-custodial. `/api/transfer/prepare` returns an
  unsigned transaction. Signing is the caller's responsibility.
- **`trust_score` and `health` are heuristics**, not audits.

## Production gaps still open

- **KYC / AML / OFAC screening.** Required for any production payments
  product. Not implemented.
- **Audit logging.** No request audit trail.
- **Database scaling.** `sql.js` is single-process. For multi-worker
  production, swap to PostgreSQL — the SQL is portable.
- **API key rotation.** Currently keys are issued once at signup with
  no rotation endpoint. Adding rotate / revoke is straightforward.
- **Webhooks.** No outbound webhooks for invoice payment, payout
  completion, etc.
- **Frontend.** API only — no shipped dashboard.

## Running tests

```bash
npm test
```

Covers:
- Auth middleware (5 cases — missing key, unknown key, ownership
  mismatch, valid, no-`:id` route).
- Validation schemas (10 cases — bad email, zero/negative amounts,
  string coercion, date format, frequency enum, wallet length, tx
  signature length).
- Database layer (3 cases — signup returns one-time key, key lookup,
  hash is not exposed, uniqueness).
- Subscription tx construction (8 cases — base-unit conversion,
  Approve / Revoke / TransferChecked fee-payer correctness, invalid
  Solana address rejection). Tests use an injected blockhash so they
  stay offline; live-RPC validation is still required.

Tests use the built-in `node:test` runner (no Jest / Mocha
dependency).

## Self-hosting

Set the following env vars (see also `.env.example`):

```bash
PORT=3001
DATABASE_PATH=./data/business-os.db
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

For production:

1. Front the API with an HTTPS reverse proxy (Caddy, Nginx,
   Cloudflare Tunnel).
2. Set the `trust proxy` setting on Express if the proxy forwards
   `X-Forwarded-For` (rate-limiting depends on accurate client IPs).
3. Swap `sql.js` for PostgreSQL before scaling beyond one process.
4. Add the production gaps above (KYC, audit logs, webhooks) per
   your jurisdiction's requirements.

## Contributing

PRs welcome. Useful contributions:

- PostgreSQL adapter behind a feature flag.
- API key rotation / revocation.
- Webhook delivery (invoice paid, payout completed).
- A minimal dashboard.

## License

MIT. See `LICENSE`.

## Disclosures

This implementation was developed with AI pair-programming assistance
from [Claude](https://claude.ai) (Anthropic). All code has been
reviewed by the human author. No portion of this repository should be
considered production-ready or audited until the production gaps
listed above are closed.

Built by [@yksanjo](https://github.com/yksanjo).
