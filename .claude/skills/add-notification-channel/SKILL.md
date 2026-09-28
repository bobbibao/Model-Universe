---
name: add-notification-channel
description: Add a new way to notify humans (a new messaging platform, SMS, Slack, etc.) so questions and results reach people outside the web app. Use when asked to add a notification channel or integrate a messaging platform.
---

1. Add a value to `ChannelType` in `domain/models/notification.py` if it's genuinely new.
2. Create `apps/agent-service/src/ci_agent/infrastructure/notifications/<name>.py` implementing
   `NotificationChannelPort` (`application/ports/notifications.py`): a `channel` class attribute
   and a `send(notification, recipient) -> DeliveryResult` method. Never raise for expected
   failures (missing handle, API error) - return `DeliveryResult(False, "...")`; the dispatcher
   retries and falls back to email.
3. Look at `infrastructure/notifications/telegram.py` for the pattern: build the payload in a
   small testable function, keep the actual HTTP call thin, use `JsonHttpClient` (see
   `infrastructure/http/client.py`) so tests can inject `infrastructure/http/recording.py`.
4. If the platform can reply (buttons, quick replies), add a webhook handler in
   `interfaces/webhooks/<name>.py` that resolves the sender via
   `RecipientDirectoryPort.resolve_identity` and calls `SubmitAnswer` - follow
   `interfaces/webhooks/telegram.py`.
5. Register the channel in `bootstrap/container.py` (only when its config is present) and in
   `bootstrap/demo.py` for local testing.
6. Add a recipient with a handle for this channel in `bootstrap/demo.py::DEMO_USERS`, and a test
   under `tests/unit/infrastructure/` asserting the payload shape and that missing-handle/failure
   cases return `DeliveryResult(False, ...)` rather than raising.
7. Document setup (API keys, webhook URL, verification) in `docs/NOTIFICATIONS.md`.
