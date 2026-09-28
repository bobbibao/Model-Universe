# ADR-0006: Bounded autonomy, not all-or-nothing

**Decision:** `AutonomyPolicy` (`domain/policies/autonomy.py`) allows the agent to auto-approve
only options that are `risk == "low"`, under a cost ceiling, for signals of low/medium
severity. Everything else always asks a human. Auto-approved actions are still recorded,
audited, and notified to admins (`NotificationKind.AUTO_APPROVED`) - "autonomous" never means
"silent".

**Why:** the hackathon scenario (dead stock, returns) has genuinely low-stakes cases (a small
discount on a handful of SKUs) where asking every time trains people to rubber-stamp, which is
worse than not asking. But high-cost or high-severity cases must still get a real human look.

**Consequence:** `AskHuman` checks the policy before opening a question; `Learn` treats an
auto-approved case exactly like a human-approved one for case-memory purposes, tagged
`auto_approved=True` on the `Directive`.
