# Security Policy

## Status

This is a v0.2.0 reference implementation. It has not been audited.
See `README.md` for the current state of production gaps.

## Authentication model

- **API keys** are generated at signup (`POST /api/businesses`) and
  returned **once** in the response. The plaintext is never persisted
  — only a SHA-256 hash plus a 12-char identifier prefix.
- **Authorization:** every business-owned route verifies that the
  caller's API key owns the resource's `:id` (and, for sub-resources
  like invoices and payouts, that the resource's `business_id`
  matches).
- **Rate limits:** three tiers (signup, public, authenticated) via
  `express-rate-limit`. Authenticated routes are keyed by API key
  rather than IP.

## Reporting a vulnerability

Please report vulnerabilities privately rather than opening a public
issue.

- **Email:** yoshi@soundraw.co.jp
- **Subject line:** `[stablecoin-business-os] Security report`
- Please include a description of the issue, steps to reproduce, the
  commit hash you reviewed, and (optionally) how you'd like to be
  credited.

We will acknowledge receipt within 72 hours and provide initial triage
within 7 days. No paid bounty is offered; verified reports will be
credited in the changelog.

## Trust assumptions for delegated billing (v0.3.0)

The subscription delegation flow uses SPL Token `Approve` /
`TransferChecked` to enable pull billing. This has important trust
properties customers must understand:

- **The business's delegate key, once authorized, can transfer up
  to the entire approved allowance in a single transaction.** There
  is no on-chain enforcement of billing cadence, frequency, or
  per-cycle caps. A compromised or rogue business wallet can drain
  the full approved amount.
- **Customers should authorize only what they are prepared to lose
  to a billing dispute.** Recommended: approve one billing period
  at a time, or at most a small multiple.
- **Customers can revoke at any time** via the
  `/api/subscriptions/:id/authorize/revoke` endpoint or directly
  on-chain via a `Revoke` instruction on their USDC ATA.
- **The business's biller process (cron / scheduler) is out of
  scope for this codebase.** The API exposes the building blocks
  (`prepare` and `record` endpoints); orchestration is the
  business's responsibility.

For higher-trust patterns (PDA escrow with on-chain cadence
enforcement, smart-wallet session keys) see the v0.4+ roadmap in
the README.

## In scope

- Authentication and authorization bypasses in the API layer.
- API key handling — leakage, predictability, reuse, recovery.
- Input validation bypasses (zod schema gaps).
- Rate limit bypasses.
- SQL injection in `src/services/database.js`.
- Solana transaction construction bugs in `src/solana/client.js`
  that could result in wrong-recipient or wrong-amount transfers.

## Out of scope

- Issues that require physical access to a developer machine.
- Issues in the `@solana/web3.js`, `@solana/spl-token`, or
  `sql.js` dependencies (report those upstream).
- DoS via gigantic payloads (the JSON body limit is 256kb, but
  rate-limiting is the primary defense).

## Known limitations (documented, not eligible for credit)

- **No KYC / AML / OFAC screening.** Required for production payments
  products; explicitly out of scope for v0.2.
- **No audit logging.** No persistent request log today.
- **`sql.js` single-process.** Will not safely scale beyond one
  Node process; swap to PostgreSQL for production.
- **No API key rotation endpoint.** Lost keys cannot be rotated in
  v0.2.

Reports of *new* issues, or of bugs in functionality that *is*
implemented, are welcome.
