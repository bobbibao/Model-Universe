---
name: add-ad-platform
description: Add an advertising platform integration (a client behind the AdPlatformClient interface, its fake, mapping tests and its capability) in the web app. Use when ads should run on a new platform.
---

Platforms live only in the web (`apps/web-ecommerce/src/core/server/services/marketing/platforms/`); the agent sees a
capability and the Agent API, never a token (`tests/architecture/test_no_platform_secrets.py`).

1. **Client**: `<Name>AdsClient.ts` implementing `AdPlatformClient` from `types.ts`:
   - `createPaused(NewAd)` creates everything delivering-ready but paused at the top level, and returns the platform's
     campaign id as `externalId` plus the ids below it in `platformData` (needed for budget and bidding changes);
   - `activate`, `pause`, `setDailyBudget`, `setObjective` (return a replacement `PlatformAd` when the platform cannot
     switch in place), `insights(ad, since, until)` as daily rows in whole VND;
   - validate everything you can before the first call, so a refusal leaves nothing behind;
   - map failures to `PlatformError` (`retryable` for rate limits, 5xx and transient errors).
2. **Wiring** in `platforms/index.ts`: the mode variable `<NAME>_ADS_MODE` (`fake` default), the required credentials in
   `REQUIRED` (so `assertMarketingConfig` stops a live server without them), and the case in `liveAdClient`.
   `FakeAdPlatform` already serves any platform name.
3. **Capability** `ads_<name>`: `CAPABILITIES` and the autonomy default (`shadow`) in `AgentSettingDefinitions.ts`,
   `AD_PLATFORMS` / `AD_CAPABILITY` in `agent/AgentLimits.ts`, the platform enum in the contract, and the agent's
   `domain/capabilities.py`, `domain/growth/policies.py` and `policies/tiers.py` (a platform's first campaign is high
   risk). Add limit vectors for it.
4. **Conversions** (if the platform has a server events API): a payload builder and sender in
   `marketing/ConversionService.ts`, gated by its browser tag id and `CONVERSIONS_MODE`.
5. **Tests**: `tests/unit/platform-mapping.<name>.test.ts` with nock and `nock.disableNetConnect()` (or `jest.mock` of
   the library for gRPC clients, like Google); no live call in tests. Extend `tests/unit/marketing-config.test.ts`.
6. **Docs**: the go-live steps in `docs/MARKETING_LIVE_CHECKLIST.md`, the variables in both `.env.example` files and
   the web service of `infra/docker-compose.yml`, and the row in `docs/GROWTH_AGENT.md` section 3.
7. Run `yarn lint && yarn type-check && yarn test` and `python scripts/gate.py --phase 6`.
