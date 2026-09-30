---
name: add-ad-platform
description: Add an advertising platform integration (a client behind the AdPlatformClient interface, its fake, mapping tests and its capability) in the web app. Use when ads should run on a new platform.
---

Status: stub; finished in Phase 6.

1. `apps/web-ecommerce/src/core/server/services/marketing/platforms/<Name>AdsClient.ts` implementing `AdPlatformClient`;
   mode env `<NAME>_ADS_MODE=fake|live` (default fake); credentials are web-only env vars.
2. Capability `ads_<name>` in settings, tiers and the autonomy ramp.
3. Mapping tests with nock (`disableNetConnect`) or `jest.mock` for gRPC clients; no live calls in CI.
4. Add the platform's go-live steps to `docs/MARKETING_LIVE_CHECKLIST.md`.
