# Project overview: Clothing Shop (web-ecommerce)

Quick-reference map for anyone picking this project up: fixed rules, architecture patterns, where each feature
lives, and known trade-offs. Setup details are in [`README.md`](./README.md).

## 1. System

A Vietnamese e-commerce app in one Next.js 14 + Express process, backed by PostgreSQL:

- **Storefront** at `/`: browse, cart, cash-on-delivery checkout, order history, wishlist, reviews, profile.
- **Admin panel** at `/admin/*` (ADMIN role only): dashboard and charts, products, categories, suppliers, stock
  imports, coupons, orders, customers, contact messages, and the **CI Console** (`/admin/ci/*`) where admins
  approve, reject or question the CI agent's improvement proposals.
- **Agent API** at `/api/agent/v1/*`: writes from the CI agent service (`apps/agent-service`) after a human
  approved them.

UI text is Vietnamese and money is whole VND (integers). Code, comments and docs are in English.

**Fixed business rules. Do not change these without a decision from the owner.**

| Rule | Where it is enforced |
|---|---|
| Checkout requires login. Guests can build a cart (localStorage) but not order. | `Auth.Route.ts` (`/orders`), cart page |
| Prices, totals and stock are always computed by the server from the DB, never taken from the client | `CartService.resolveLines`, `OrderService.placeOrder` |
| `total = subtotal − coupon discount`. Shipping is free and tax is 0 (both stored as 0). Coupons are percentage-only. | `OrderService`, `CouponService` |
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
  - There are no schema migrations: tables are created by `sync()` during a seed run.
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
| Dashboard & charts | `/admin/dashboard`, `/admin/charts/{bar,pie,line}` · `/api/admin/dashboard/*` | `Dashboard` → `DashboardService` (raw SQL aggregates) | read-only |
| Contact | `/contact`, `/about`; `/admin/contacts` · `/api/contact`, `/api/admin/contacts` | `Contact`, `AdminContact` → `ContactMessageService` | `ContactMessage` |
| CI Console | `/admin/ci/improvements[/[id]]`, `/admin/ci/tasks`, `/admin/ci/impact`, `/admin/ci/cases` · `/api/admin/ci/*` (proxy to the agent service with a 60 s actor token) | `AdminCi`, `AdminAgentTask` → `CiConsoleService`, `CiEventService`, `AgentTaskService` | `CiNotification`, `CiEvent`, `AgentTask` |
| Agent API | `/api/agent/v1/*` (service token, `AgentServiceAuth.Middleware`); `/api/agent/v1/events` (HMAC signature) | `AgentApi`, `AgentEvents` → `AgentActionService`, `CiEventService` | `AgentAction`, `ProductDiscount`, `AgentTask`, `SopChecklistItem`, `Product` (`inventoryStatus`, `salesChannel`) |

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
- **Dashboard API** uses one monthly-series endpoint and one distributions endpoint instead of one endpoint per chart.
- **UI kit:** TailAdmin/Tailwind only. The TailAdmin demo pages and the react-bootstrap starter kit were removed; don't re-add Bootstrap, GraphQL decorators or i18n libraries.

**Known tech debt and open items**
- The forgot-password flow is deferred (`email_verification.purpose = RESET_PASSWORD` is reserved).
- The contact form (`POST /api/contact`) has no rate limit. The login limiter is in-memory only; use a shared store if the app runs as multiple instances.
- There is no automatic cleanup of orphaned uploads (files uploaded for a form that was then abandoned).
- The Dockerfile and docker-compose have not been updated or tested for the current app (for example, there is no volume for `UPLOAD_DIR`).
- There is no automated test suite. Verification has been type-check, lint and build, plus curl/page smoke runs.
- There are no DB migrations; schema changes are applied by re-seeding.
- The root layout is a client component with a 500 ms loader gate, so pages render client-side only; SSR HTML shows the loader.

## 5. Ops basics

| Command | Notes |
|---|---|
| `yarn install` | Yarn 4 (`corepack enable`), Node 20+ |
| `yarn dev` | http://localhost:6050. Exits if the port is taken (check for a leftover dev server first). |
| `yarn seed-dev` | ⚠️ **Drops and recreates every table**, then seeds demo data. Stop it with Ctrl+C after the `stock imports seeded` log line. |
| `yarn type-check` / `yarn lint` / `yarn build` | The quality gate used after every change. `build` writes to `dist/.next`, the same folder as dev, so don't build while dev is running. |
| `yarn start` | Runs the production build |

**Required `.env`** (template: `.env.example`):
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (first admin, created by the seed)

Optional: `JWT_EXPIRES_IN`, `COOKIE_SECURE`, `SMTP_*`, `UPLOAD_DIR`, `UPLOAD_MAX_MB`, `LOGGER`, `LOG_LEVEL`.

CI agent integration (see `.env.example`): `AGENT_SERVICE_URL`, `AGENT_API_TOKEN`, `AGENT_EVENTS_SECRET`,
`AGENT_ACTOR_SECRET`. Without them the Agent API answers 503 and the CI Console shows an error toast.

**Test accounts (after `yarn seed-dev`)**
- Admin: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.
- Customers: `customer1@example.com` … `customer20@example.com`, password `Customer@123`.
- Coupons: `WELCOME10` and `SALE20` are valid. `SUMMER15` (expired), `BLACKFRIDAY30` (not started yet), `VIP50` (used up) and `FREESHIP5` (disabled) exist to test the error cases.
- Sign-up OTP: read it from the `yarn dev` log (`OTP for <email>: ……`) when SMTP is not configured.
