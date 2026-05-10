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
