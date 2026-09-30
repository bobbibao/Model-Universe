# Notifications

`NotificationDispatcher` (`application/services/notification_dispatcher.py`) routes by
severity: `low` -> web inbox only, `medium` -> web + the recipient's first preferred external
channel, `high`/`critical` (and every decision question) -> web + all preferred external
channels, with an automatic email fallback if every external channel fails. Every attempt is
logged (`NotificationLogPort`) whether it succeeded or not.

## Recipients

Approvers are the web app's **active admins** (ROADMAP T-08): the agent reads the `analytics.ci_recipients` view
(id and name only) through the read-only `SHOP_READ_DSN`, and every web ADMIN approves as `owner`, as in the web
console. Deactivating an admin in the web stops their questions within a minute (the list is cached 60 s).

`RECIPIENTS_FILE` (optional) adds what the web does not hold, keyed by the **web user id**: channel handles and
preferred channels. An admin without an entry gets the web inbox only, so nobody is messaged on Telegram or by
email without being listed here. Entries whose user id is not an active web admin are ignored (logged once):

```json
[{"user_id": "1", "handles": {"telegram": "<chat id>"}, "preferred_channels": ["telegram"]}]
```

When the view cannot be read (shop database down, web app not started yet), the file alone is used, as before T-08.
`RECIPIENT_SOURCE=file` always uses the file alone (then `role` and `name` in the file apply). With
`SHOP_READ_ADAPTER=fake` (development) the file is used.

## Web (in-app)

`infrastructure/notifications/web_inbox.py` publishes a `notification.created` domain event.
The web app stores it (`ci_notification`) and lists it on the CI Console inbox.

## Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather), get `TELEGRAM_BOT_TOKEN`.
2. Set the webhook: `POST https://api.telegram.org/bot<token>/setWebhook` with
   `url=<agent-service>/webhooks/telegram` and a `secret_token` matching
   `TELEGRAM_WEBHOOK_SECRET`. The secret is mandatory: without it the webhook refuses every update.
3. Get each approver's numeric chat id (they can message the bot once; log the `from.id` your
   webhook receives) and put it in the recipient directory
   (`handles.telegram`, see `infrastructure/notifications/directory.py`).
4. Approval buttons are Telegram inline keyboards; taps hit `interfaces/webhooks/telegram.py`.
5. The "Open dashboard" button is only added when `WEB_BASE_URL` is a public address (Telegram
   validates button URLs; a localhost link would make the whole message fail).

## Zalo Official Account

**The exact API shape in `infrastructure/notifications/zalo.py` is unverified** - written from
memory, not confirmed against current Zalo OA docs. Before relying on it: check the current
endpoint/version, payload shape, access-token refresh flow and any messaging-window
restriction (Zalo OA typically only allows free-form messages within a window after the user
last messaged the OA). See `docs/ROADMAP.md` T-05. Because Zalo's structured replies are
limited, this channel sends a signed link to the web approval page rather than relying on
buttons.

## Email

Uses SMTP directly (`infrastructure/notifications/email_smtp.py`) so it needs no third-party
account beyond an SMTP server (e.g. your company's, or a provider like SendGrid/SES's SMTP
endpoint). Approval links carry an HMAC-signed, time-limited token
(`infrastructure/system/signer.py`) so a manager can approve from a phone without logging in.

## Adding a channel

See `.claude/skills/add-notification-channel/SKILL.md`.
