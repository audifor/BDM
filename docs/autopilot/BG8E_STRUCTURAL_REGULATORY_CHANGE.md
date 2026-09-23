# BG8E — Structural & Regulatory Change

BG8E adds the runtime domain for institutional structural changes, lifecycle
states, succession, regulatory orders, remediation plans and regulatory
licenses. Organizations remain historical identities: rename, relocation and
legal-form changes do not create an implicit replacement organization.

Ownership remains canonical in BG8B/BG8C. A `DIVESTMENT_REQUIRED` order can
prepare and preview a BG8B ownership transaction, use BG8D for hypothetical and
materialized conflict assessment, execute through the existing BG8B executor,
and only then be marked satisfied after a clear materialized assessment.

All BG8E collections are persisted additively in Save V4. Older V4 payloads
default them to empty collections. No World DB or Rust changes are required.
