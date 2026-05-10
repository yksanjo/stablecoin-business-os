# Security Policy

## Status

This is an MVP-stage reference implementation (v0.1.0). It has **not**
been audited and is **not** safe for production use without significant
hardening. See "Production gaps" in `README.md`.

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

## Known issues (acknowledged, not eligible for credit)

- **No authentication on API endpoints.** Every endpoint is open. This
  is documented in the README's "Production gaps" section.
- **No multi-tenant isolation.** Resources are accessed by path
  parameter without ownership checks.
- **In-memory database.** State is lost on restart.
- **No rate limiting.**
- **Minimal input validation.**

These are intentional v0.1.0 limitations, not bugs. Reports of *new*
issues, or of bugs in functionality that *is* implemented, are welcome.
