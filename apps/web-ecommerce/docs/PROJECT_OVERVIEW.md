# Project overview: Clothing Shop (web-ecommerce)

Quick-reference map for anyone picking this project up: fixed rules, architecture patterns, where each feature
lives, and known trade-offs. Setup details are in [`README.md`](./README.md).

## 1. System

A Vietnamese e-commerce app in one Next.js 14 + Express process, backed by PostgreSQL:

- **Storefront** at `/`: browse, cart, cash-on-delivery checkout, order history, wishlist, reviews, profile.
- **Admin panel** at `/admin/*` (ADMIN role only): dashboard and charts, products, categories, suppliers, stock
  imports, coupons, orders, customers, contact messages, and the **agent console** (`/admin/agent/*`) where
  admins approve, edit, reject or question the shop agent's improvement proposals.
- **Agent API** at `/api/agent/v1/*`: writes from the shop agent (`apps/agent-service`) after a human approved
  them.

UI text is Vietnamese and money is whole VND (integers). Code, comments and docs are in English.

**Fixed business rules. Do not change these without a decision from the owner.**

| Rule | Where it is enforced |
|---|---|
| Checkout requires login. Guests can build a cart (localStorage) but not order. | `Auth.Route.ts` (`/orders`), cart page |
| Prices, totals and stock are always computed by the server from the DB, never taken from the client | `CartService.resolveLines`, `OrderService.placeOrder` |
| `total = subtotal − coupon discount`. Shipping is free and tax is 0 (both stored as 0). Coupons are percentage-only. | `OrderService`, `CouponService` |
| Returns: a customer may ask to return lines of a DELIVERED order within 30 days of `deliveredAt`, never more units than bought (minus other non-rejected requests), with a reason from a fixed list. An admin receives (condition and a VND refund per line, at most the amount paid) or rejects (note required) it, once. **Neither step changes stock or the order** (total, payment status); the refund is paid outside the system. Stock changes only when an admin explicitly clicks "Nhập lại kho" on a received line in `new`/`open_box` condition, once per line. | `ReturnService` |
| A product held back (`inventoryStatus` ≠ `available`) is released only by an admin on the product page ("Trạng thái kho") or by reverting the agent action that set it; the Agent API refuses to `restock` a held product (409). | `ProductService.validate`, `AgentActionService` |
| Payment is COD only. `paymentStatus` becomes PAID when the order is DELIVERED. | `OrderService.changeStatus` |
| Order flow is `PROCESSING → SHIPPED → DELIVERED`. Cancelling is only possible while PROCESSING (customer or admin) and restores stock, `sold` and the coupon use. | `OrderService.TRANSITIONS` |
| Deleting a product that is referenced by orders or stock imports sets it to **Discontinued** (`isArchived`, shown as "Tạm ngưng") instead of deleting it. Discontinued products are hidden from the storefront. | `ProductService.remove`, FK `RESTRICT` |
| A supplier with products or import history cannot be deleted; deactivate it. A coupon that has been used cannot be deleted; deactivate it. A category with products cannot be deleted. | `SupplierService`, `CouponService`, `CategoryService` |
| A cart line whose product was deleted or discontinued, is sold out, has a size that no longer exists, or exceeds stock is flagged and blocks checkout. Stock is per product, summed over sizes. | `CartService` statuses |
| Reviews: one per customer per product, only after a DELIVERED order that contains the product | `ReviewService.getEligibility` |
| Revenue excludes CANCELLED orders. Monthly figures use the `Asia/Ho_Chi_Minh` time zone. | `DashboardService` |
| A product's `price` is its list price. A running `product_discount` (highest wins) gives the `salePrice` shown on the storefront and charged in the cart and at checkout; the coupon then applies to that subtotal. | `ProductDiscountService` (used by `ProductService`, `CartService`, `OrderService`) |
| A product whose `inventoryStatus` is not `available` (quarantine, donation, recycling) is hidden from the storefront and blocks checkout, like a discontinued one. | `STOREFRONT_VISIBLE` / `isSellable` in `Product.Model.ts` |
| Every Agent API write is applied at most once per `Idempotency-Key` and can be reverted; a revert never overwrites a value an admin changed since. | `AgentActionService` |

## 2. Architecture rules to preserve

Extend these patterns; don't introduce parallel ones.

- **Server:**
  - `server.ts` mounts body/cookie parsers, the login rate limiter, `AuthenticationMiddleware` and `apiRouter` on `/api`, then JSON 404/error handlers, `/uploads` static, and finally Next.js (GET only).
  - `apiRouter.ts` auto-imports every `src/app/api/*.Controller.ts`.
- **Controllers:**
  - Each is a class with `@Controller('/prefix')`, `@ControllerModel('XModel')` and `@Get/@Post/@Put/@Delete`, extending `ApiBaseController`.
  - `this.requireService<XService>()` loads `core/server/services/XService.ts` by name (`XModel` → `XService`). A pseudo-model name (`AuthModel`, `DashboardModel`) is fine for a service that has no table.
  - Every handler is a `try/catch` that ends in `this.handleError(res, error, context)`.
  - Admin endpoints are separate controllers with an `/admin/...` prefix.
- **Responses:**
  - Exception: the machine-to-machine Agent API (`/api/agent/v1`) answers with flat JSON (`{ ref, detail }` /
    `{ error }`, English) as specified in `packages/contracts/openapi/web-agent-api.yaml`, not the envelope.
  - Mutations use `this.sendSuccess(res, data, 'Vietnamese message', status)`, which wraps the `ApiResponse` envelope; the client shows the toast automatically.
  - Reads use `res.json(...)`.
  - Lists use `parsePagination(req)` + `toPaginatedPayload(rows, count, page, perPage)`, which produces `{ payload: { data, pagination } }` with `page`/`per_page` query params.
- **Services:**
  - Business logic, one per domain, implementing `BaseServiceInterface`. They call Sequelize models directly (there is no repository layer).
  - Services compose other services with `new`.
  - Multi-row writes use `DatabaseProvider.getInstance().transaction(...)`, locking rows (`transaction.LOCK.UPDATE`, in id order) when stock or coupons change.
- **Errors and validation:**
  - Services throw `HttpError.badRequest(message, validationMessages[])`, `.notFound`, `.conflict`, `.forbidden`, ….
  - Validation is hand-written using `shared/server/utils/ValidationUtils.ts`. There is no schema library; keep it that way.
- **Models:**
  - `core/server/database/{internal,client}/models/X.Model.ts` (sequelize-typescript, explicit `tableName`, optional `static seedData()`). The two folders are only an organisational split; everything is in one database.
  - Register every model in `DatabaseProvider.models` **in dependency order**, and associations in `loadRelationships()`. Give `onDelete` on **both** sides, because a `belongsTo` default overrides `hasMany`.
  - **Database changes** (umzug, `src/core/server/database/migrations/`):
    - A seed run creates every table from its model with `sync()`. Migrations add what an existing database lacks and
      run on every server start (and with `yarn db:migrate`), after the models are loaded and before the analytics
      views.
    - **Every column is also declared on its model**, so a fresh seed creates it without the migration.
    - A new table: a migration that calls `Model.sync()` (`ensureTables`). A new column: `describeTable` then
      `addColumn` (`ensureColumns`). Reference data (settings defaults, the market calendar) is inserted with
      `ignoreDuplicates`, by the migration and by the seeder.
    - Every migration is idempotent. Append new ones to `MIGRATIONS` (`YYYY-MM-DD-NN-name`); never edit or reorder
      an applied one. They are recorded in `"SequelizeMeta"`, which `DROP_TABLES` also drops.
  - Every new model defines `static async seedData()` (a no-op or a deterministic seeder); a model without one gets
    random faker rows from the generic seeder.
  - `BIGINT` columns need a numeric getter.
- **Auth:**
  - Session JWT (`jose`, HS256) in the httpOnly `access_token` cookie. Helpers are in `shared/server/utils/JwtUtils.ts`; they are edge-safe and shared with `src/middleware.ts`.
  - `AuthenticationMiddleware` reloads the user on every API request and sets `req.user`.
  - Access rules are **path-prefix lists** in `core/server/routes/Auth.Route.ts` (`protectedRoutes`, `adminRoutes = ['/admin']`); add new protected prefixes there.
  - `src/middleware.ts` guards pages only; the API is the security boundary.
- **Client:**
  - Pages: `src/app/<route>/page.tsx` is a thin server component (metadata + `<StoreLayout>` or `<DefaultLayout>` + a feature page). There are no route groups or nested layouts.
  - Feature UI lives in `core/client/features/<feature>/{pages,components,hooks}` and is `'use client'`.
  - HTTP: a static `XApi` class in `core/client/api/X.ts` calls `Api.get/post/...`. URL builders go in `endpoint.ts` (`X_API` constants). Methods return data, or `undefined`/`false` on error; the interceptor already showed the toast.
  - Global state: React Context providers in `shared/client/providers` (`CurrentUserProvider`, `CartProvider`, `ToastProvider`), mounted in `app/layout.tsx`.
  - Shared types live in `src/shared/types/*.d.ts`.
- **Conventions:**
  - Server code uses **relative imports** for runtime values; `@/` is only safe in type imports, because ts-node has no path aliases.
  - Tailwind uses the TailAdmin tokens plus `brand-*` / `store-*` (the dark palette is the default).
  - Run Prettier **only on files you changed**.

**Shared abstractions (reuse these before adding new ones)**

| Abstraction | Location |
|---|---|
| `HttpError`, `JwtUtils`, `PasswordUtils`, `ValidationUtils`, `PaginationUtils` | `src/shared/server/utils/` |
| `requireService` / `sendSuccess` / `handleError` | `src/app/api/ApiBase.Controller.ts` |
| `req.user` typing | `src/shared/server/types/express.d.ts` |
| `LoginRateLimitMiddleware` | `src/core/server/middleware/` |
| `FileStorageService` (multer uploads, file cleanup) | `src/core/server/services/` |
| `DataTable`, `Modal`, `ConfirmModal`, `Stepper`, `TextField`, `SelectField` | `src/components/` |
| `StoreLayout`, `StoreHeader`, `StoreFooter`, `BrandLogo`, `UserAvatar`, `ProductImage`, `OrderStatusBadge` | `src/components/` |
| `ChartCard` (+ `ApexChart`), `BarChart`, `LineChart`, `DonutChart` | `src/components/Charts/` |
| `CurrentUserProvider`, `CartProvider` | `src/shared/client/providers/` |
| `toSlug` (Vietnamese-aware), `ChartUtils`, `NavigationUtils.getSafeRedirect` | `src/shared/client/utils/` |
| `formatVND` | `src/shared/server/utils/utils.ts` |

## 3. Feature → code map

Controllers are in `src/app/api/`, services in `src/core/server/services/`, models in `src/core/server/database/**/models/`.

| Feature | Main routes (page · API) | Controller → Service | Models |
|---|---|---|---|
| Auth & profile | `/auth/signin`, `/auth/signup`, `/user-profile` · `/api/auth/*`, `/api/users/me` | `Auth`, `User` → `AuthService`, `MailService`, `UserService` | `User`, `EmailVerification` |
| Customers (admin) | `/admin/customers` · `/api/admin/users` | `AdminUser` → `UserService` | `User` |
| Catalog (storefront) | `/`, `/shop`, `/search`, `/shop/product/[id]` · `/api/products`, `/api/categories` | `Product`, `Category` → `ProductService`, `ReviewService`, `CategoryService` | `Product`, `ProductImage`, `Category`, `Review` |
| Catalog (admin) | `/admin/products[/new\|/[id]]`, `/admin/categories`, `/admin/suppliers` · `/api/admin/{products,categories,suppliers,uploads}` | `AdminProduct`, `AdminCategory`, `AdminSupplier`, `AdminUpload` → same services + `SupplierService`, `FileStorageService` | + `Supplier` |
| Cart | `/cart` · `POST /api/cart/quote` | `Cart` → `CartService` (no table; cart lives in `CartProvider`/localStorage) | `Product` |
| Wishlist | `/wishlist` · `/api/wishlist` | `Wishlist` → `WishlistService` | `WishlistItem` |
| Coupons | cart page · `/api/coupons/:code/validate`; `/admin/coupons` · `/api/admin/coupons` | `Coupon`, `AdminCoupon` → `CouponService` | `Coupon` |
| Checkout & orders | `/cart`, `/thank-you`, `/order-history` · `/api/orders`; `/admin/orders[/[id]]` · `/api/admin/orders` | `Order`, `AdminOrder` → `OrderService` (+ `CartService`, `CouponService`) | `Order`, `OrderItem` |
| Reviews | product page · `/api/reviews` | `Review` → `ReviewService` | `Review` |
| Stock import | `/admin/stock` · `/api/admin/stock-imports` | `AdminStockImport` → `StockImportService` | `StockImport`, `StockImportItem` |
| Returns | `/order-history` (per delivered order) · `/api/returns/*`; `/admin/returns` · `/api/admin/returns` | `Return`, `AdminReturn` → `ReturnService` | `ReturnRequest`, `ReturnItem`, `Order.deliveredAt` |
| Analytics views (the agent reads) | `analytics.*` in the database, recreated at start (`database/analytics/AnalyticsViews.ts`); role `ci_reader` from `infra/sql/ci_reader.sql` | — | read-only views |
| Dashboard & charts | `/admin/dashboard`, `/admin/charts/{bar,pie,line}` · `/api/admin/dashboard/*` | `Dashboard` → `DashboardService` (raw SQL aggregates) | read-only |
| Contact | `/contact`, `/about`; `/admin/contacts` · `/api/contact`, `/api/admin/contacts` | `Contact`, `AdminContact` → `ContactMessageService` | `ContactMessage` |
| Agent console | `/admin/agent/{inbox,activity,impact,knowledge,tasks,settings,market}`, `/admin/agent/threads/[id]` (old `/admin/ci/*` links redirect) · `/api/admin/agent/server/*` (allowlisted gateway to the Agent Server: a 60 s actor token per request, SSE pass-through, approval grants minted on approve/edit), `/api/admin/agent/tasks` | `AdminAgent`, `AdminAgentTask` → `AgentGatewayService`, `AgentTaskService` | `AgentTask` (threads live in the Agent Server) |
| Agent settings | `/admin/agent/settings` · `/api/admin/agent/settings[/:key]` (kill switch, monthly goal, ad caps, autonomy per capability, brand approval, trend keywords; optimistic `version`, every change audited; the auto target and cap come from `analytics.growth_targets`) | `AdminAgentSetting` → `AgentSettingService` (`AgentSettingDefinitions.ts`: keys and defaults, pinned by `packages/contracts/test-vectors/agent-settings.json`) | `AgentSetting`, `AgentSettingAudit` |
| Market data | `/admin/agent/market` · `/api/admin/agent/market/{competitors,prices,prices/template,prices/import,campaigns,events,sources}` (manual entry, CSV import: all rows or none, with a per-row error report) | `AdminAgentMarket` → `MarketService` | `MarketCompetitor`, `MarketCompetitorPrice`, `MarketCompetitorCampaign`, `MarketTrendPoint`, `MarketEvent` (calendar from `seeders/data/events_vn.json`), `MarketSource` |
| Consent & tracking | storefront banner · `POST /api/consent` | `Consent` → `ConsentLogService` | `ConsentLog` (time and choice, no personal data) |
| Attribution | 30-day `attribution` cookie (last non-direct click: `utm_*`, `fbclid`/`gclid`/`ttclid`, landing path) set by `AttributionCapture`, stored on the order by `OrderService.placeOrder` | `Order` → `OrderService` | `Order` (`utm*`, `clickId`, `clickIdType`, `landingPath`) |
| Marketing (tables for the growth agent) | written by the Agent API from Phase 6 | — | `MarketingCampaign`, `MarketingPost`, `AdCampaign`, `AdMetricDaily`, `PostMetricDaily`, `MarketingBudgetPeriod`, `MarketingBudgetEntry`, `MarketingOutcome`, `MarketingAsset` |
| Agent API | `/api/agent/v1/*` (service token, `AgentServiceAuth.Middleware`); `POST /market/observations` records the agent's collectors (trends, competitor-site prices, source health) | `AgentApi` → `AgentActionService`, `MarketService` | `AgentAction`, `ProductDiscount`, `AgentTask`, `SopChecklistItem`, `Product` (`inventoryStatus`, `salesChannel`), market tables |

## 4. Key decisions, trade-offs and tech debt

**Decisions and trade-offs**
- **Auth is in-house JWT** (no third-party identity provider).
  - `GET /api/auth/me` is public and returns `{ user: null }` for guests.
  - Wrong credentials return 400, not 401, because the client treats 401 as "session expired" and redirects to sign-in.
  - Password hashes are hidden by a Sequelize `DefaultScope`; use `scope('withPassword')` when a hash is really needed.
  - Admins cannot change their own role or lock themselves out.
- **Login rate limit:** failed logins only, in memory per process. 5 per IP+email and 20 per IP within 15 minutes → 429. Behind a reverse proxy, configure Express `trust proxy`, otherwise every client shares one IP.
- **Email OTP:** without `SMTP_HOST` in development, the code is written to the server log instead of being emailed.
- **Images:**
  - Rendered with `next/image` `unoptimized` (`ProductImage`). The seed images are hot-linked from asos (their CDN refuses server-side fetches), and uploads are served by Express outside Next's loader.
  - Descriptions are plain text; HTML is never rendered.
- **Seed data:**
  - 124 demo products (`seeders/data/products.json`, prices in USD × 25,000).
  - Seeded orders and stock imports do not change the seeded stock or `sold`.
  - `DatabaseProvider` creates all tables first, then seeds them in order.
  - Deterministic: `SEED_NOW` (default: now), `SEED_RANDOM_SEED` (default 7) and `SEED_HISTORY_DAYS` (default 180)
    fix the synthetic history (weekday rhythm, Tết and sale days, a UTM and coupon mix, returns, competitor prices,
    trends). The same values give the same business rows. Products fall into tiers by a hash of their SKU (slow, new,
    popular, normal), which is what the agent's detectors find.
- **Consent and tracking tags:** the Meta Pixel, Google tag (with the Google Ads conversion) and TikTok Pixel load only
  after the visitor accepts marketing cookies (`consent` cookie, `v: 1`) and only when their `NEXT_PUBLIC_*` id is set
  and well formed. Events: `PageView`, `ViewContent`, `AddToCart`, and `Purchase` with `event_id` = the order id (for
  deduplication with the server-side events in Phase 6). Decree 13/2023 and the Personal Data Protection Law.
- **Coupons** have an optional minimum order (`minOrderVnd`), enforced at validation and checkout
  (`CouponService.assertCouponUsable(coupon, subtotal)`).
- **Dashboard API** uses one monthly-series endpoint and one distributions endpoint instead of one endpoint per chart.
- **UI kit:** TailAdmin/Tailwind only. The TailAdmin demo pages and the react-bootstrap starter kit were removed; don't re-add Bootstrap, GraphQL decorators or i18n libraries.

**Known tech debt and open items**
- The forgot-password flow is deferred (`email_verification.purpose = RESET_PASSWORD` is reserved).
- The contact form (`POST /api/contact`) has no rate limit. The login limiter is in-memory only; use a shared store if the app runs as multiple instances.
- There is no automatic cleanup of orphaned uploads (files uploaded for a form that was then abandoned).
- The compose stack (`infra/docker-compose.yml`) is validated with `docker compose config` and the e2e workflow; it has not been run on a Docker host from this repository yet.
- The root layout is a client component with a 500 ms loader gate, so pages render client-side only; SSR HTML shows the loader.

## 5. Ops basics

| Command | Notes |
|---|---|
| `yarn install` | Yarn 4 (`corepack enable`), Node 20+ |
| `yarn dev` | http://localhost:6050. Exits if the port is taken (check for a leftover dev server first). |
| `yarn seed-dev` | ⚠️ **Drops and recreates every table**, then seeds demo data. Stop it with Ctrl+C after the `Analytics views ready` log line (returns are seeded last: three products get a high return rate, and dead stock comes from products with old stock imports, so the agent's two live signals fire). |
| `yarn type-check` / `yarn lint` / `yarn build` | The quality gate used after every change. `build` writes to `dist/.next`, the same folder as dev, so don't build while dev is running. |
| `yarn start` | Runs the production build |
| `yarn test` / `yarn test:db` | Jest: unit tests (no database; gateway, grants, contract test vectors) / database tests on `TEST_DB_*` (a throwaway `*_test` database: they drop the tables) |
| `yarn seed-ci` | ⚠️ Drops and recreates every table, seeds the development data strictly (any error fails it), creates the views and exits. Used by the e2e stack (the image runs `node dist/.next/scripts/seed.js`) |
| `yarn db:migrate` | Applies the pending migrations and recreates the analytics views, then exits (non-zero on any error). The server does the same on start |
| `yarn e2e` | Playwright against a running stack; `--grep @demo` is the automated demo (`e2e/agent-demo.spec.ts`, writes to the shop: `E2E_ALLOW_WRITES=1`) |

**Required `.env`** (template: `.env.example`):
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (first admin, created by the seed)

Optional: `JWT_EXPIRES_IN`, `COOKIE_SECURE`, `SMTP_*`, `UPLOAD_DIR`, `UPLOAD_MAX_MB`, `LOGGER`, `LOG_LEVEL`,
`SEED_NOW`, `SEED_RANDOM_SEED`, `SEED_HISTORY_DAYS`.

Tracking tags (public, baked into the client build; each tag loads only when set and after consent):
`NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GOOGLE_TAG_ID`, `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL`,
`NEXT_PUBLIC_TIKTOK_PIXEL_ID`.

Shop agent integration (see `.env.example`): `AGENT_SERVER_URL`, `AGENT_API_TOKEN`, `AGENT_ACTOR_SECRET`,
`AGENT_APPROVAL_SECRET` (web only). Without them the Agent API answers 503 and the agent console shows an error
toast.

**Test accounts (after `yarn seed-dev`)**
- Admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.
- Customers: `customer1@example.com` … `customer20@example.com`, password `Customer@123`.
- Coupons: `WELCOME10` and `SALE20` are valid; `DON1TRIEU` (8 %) needs an order of at least 1.000.000 ₫. `SUMMER15` (expired), `BLACKFRIDAY30` (not started yet), `VIP50` (used up) and `FREESHIP5` (disabled) exist to test the error cases.
- Sign-up OTP: read it from the `yarn dev` log (`OTP for <email>: ……`) when SMTP is not configured.
