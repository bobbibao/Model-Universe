# ADR-0002: Read-only direct reads, all writes through the web app's API

**Decision:** Detect/Measure read through a read-only SQL view (`analytics` schema, `ci_reader`
role). Act writes ONLY through `web/api/agent/v1/*`, defined in
`packages/contracts/openapi/web-agent-api.yaml`.

**Why:** high-volume reads through an API are slow and expensive. Writing directly into the
web app's database would bypass its business rules, validation, audit trail and cache
invalidation.

**Consequence:** the web app must expose the Agent API and own idempotency for it.
