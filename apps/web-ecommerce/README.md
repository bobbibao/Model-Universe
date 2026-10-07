# Clothing Shop (web-ecommerce)

E-commerce application: a customer storefront and an admin panel in a single Next.js 14 + Express application,
backed by PostgreSQL. See [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) for the business rules, architecture
patterns and feature-to-code map.

## Features

**Storefront** (`/`)
- Home with featured products. Shop with search, category, gender, brand, price and stock filters, sorting and pagination.
- Product detail with gallery, sizes, stock, and real rating distribution. Customers who received a product can review it.
- Cart kept in the browser and re-priced by the server. Carts containing sold-out, archived or deleted products are
  flagged and cannot be ordered.
- Coupons, cash-on-delivery checkout with shipping details, order history, and cancelling orders that are still being processed.
- Wishlist, profile (edit details, change password), and sign-up with an email one-time code.
- About and contact pages. Contact messages are stored for the admin.

**Admin** (`/admin`, ADMIN role only)
- Dashboard with KPIs, revenue and orders, inventory, customers and recent orders, plus bar, pie and line chart pages.
- Products (create wizard with image upload, edit, archive), categories, suppliers and stock import (goods receipts).
- Coupons, orders (status workflow `PROCESSING → SHIPPED → DELIVERED`, cancellation), customers (role and lock) and
  contact messages.
- Marketing (`/admin/marketing`): editable drafts with read-only Agent copy suggestions, Facebook posts (now or
  scheduled), Meta/Google/TikTok ads created paused, media upload, activation, pause and campaign end controls.
  Admin campaigns are separate from the Agent campaign list and its pause-all control. Paid ads share the shop's
  monthly marketing cap. `*_MODE=fake` simulates platform writes; use the existing live platform settings for real publishing.
  Restart both the web server and Agent Server after adding this feature: the web applies the draft-table migration,
  and the Agent Server loads the new `marketing_copy` graph from `langgraph.json` / `aegra.json`.

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 14 (App Router), React 18, Tailwind CSS (TailAdmin theme), ApexCharts, react-toastify |
| Server | Custom Express server (`server.ts`); decorator controllers in `src/app/api/*.Controller.ts` |
| Data | PostgreSQL with Sequelize / sequelize-typescript |
| Auth | Own JWT (`jose`) in an httpOnly cookie, bcrypt passwords, email OTP (`nodemailer`) |
| Uploads | `multer` to local disk, served under `/uploads` |

## Project layout

```
server.ts / apiRouter.ts           Express + Next.js bootstrap, controller auto-loading
src/app/<route>/page.tsx           Thin pages (StoreLayout for the storefront, DefaultLayout for /admin)
src/app/api/*.Controller.ts        REST controllers (@Controller / @Get ... / @ControllerModel)
src/core/server/services/          Business logic (one service per domain)
src/core/server/database/          DatabaseProvider, models (internal/ + client/) and seeders
src/core/server/middleware/        JWT authentication and role checks (paths in core/server/routes/Auth.Route.ts)
src/core/client/api/               Static API classes on the shared axios instance (Api.ts, endpoint.ts)
src/core/client/features/          Feature pages and components (shop, cart, account, product-management, ...)
src/components/                    Shared UI (layouts, header/sidebar, DataTable, Modal, charts, form fields)
src/shared/                        Providers, hooks, utils and types shared by client and server
src/middleware.ts                  Page guards for /admin and account pages
```

## Getting started

Requirements: Node.js 20+ (22 recommended), Yarn 4 (via `corepack enable`) and PostgreSQL 14+.

1. Install dependencies with `yarn install`.
2. Copy `.env.example` to `.env` and fill it in. At minimum set:
   - `DB_*`: the connection to an existing database.
   - `JWT_SECRET`: a long random string.
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`: the first admin account.
3. Create the tables and demo data with `yarn seed-dev`. This **drops and recreates all tables**. Wait for the
   `orders seeded` / `stock imports seeded` log lines, then stop it with Ctrl+C.
4. Start the development server with `yarn dev` (Turbopack) and open http://localhost:6050.
   Restart the running dev process after changing the dev command. If a dependency needs Webpack, use `yarn dev:webpack`.
   The first visit to a route still compiles it; the Webpack fallback retains visited routes for 30 minutes (up to 64 entries).

### Demo data (`yarn seed-dev`)

The seed creates:

- the admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- 20 customers: `customer1@example.com` … `customer20@example.com`, password `Customer@123`
- 18 categories, 5 suppliers, 124 products with reviews
- 6 coupons, one per state: `WELCOME10` and `SALE20` are usable
- 90 orders over the last 8 months
- 12 stock imports

`yarn seed-prod` only creates the admin account and the categories.

### Email

Sign-up sends a 6-digit code by email through `SMTP_*`. When `SMTP_HOST` is empty in development, the code is written
to the server log (`OTP for <email>: 123456`). In production, SMTP is required.

## Scripts

| Command | Purpose |
|---|---|
| `yarn dev` | Turbopack development server on port 6050 |
| `yarn dev:webpack` | Webpack development fallback on port 6050 |
| `yarn seed-dev` / `yarn seed-prod` | Drop, recreate and seed the tables (development / production data) |
| `yarn type-check` | TypeScript check of the web app and the server |
| `yarn lint` | ESLint (Next.js + typescript-eslint rules) |
| `yarn build` | Next.js production build + server compilation into `dist/.next` |
| `yarn start` | Run the production build (`node dist/.next/server.js`) |

There is no automated test suite. Changes are verified with type-check, lint and build, plus API and page smoke runs
against `yarn dev`.

## Environment variables

See [`.env.example`](./.env.example). The main groups are:

- **Database:** `DB_*`
- **Logging:** `LOGGER`, `LOG_LEVEL`
- **Auth:** `JWT_SECRET`, `JWT_EXPIRES_IN` (seconds), `COOKIE_SECURE`
- **Seeded admin:** `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- **Mail:** `SMTP_*`
- **Uploads:** `UPLOAD_DIR`, `UPLOAD_MAX_MB`

## Operational notes

- **Sessions:** the session cookie is `Secure` when `NODE_ENV=production`. Serve over HTTPS, or set
  `COOKIE_SECURE=false` for plain-HTTP test deployments.
- **Uploads:** uploaded product images are stored in `UPLOAD_DIR` (default `./uploads`, git-ignored). In Docker, mount
  it as a volume so images survive container restarts. Images removed from a product are deleted from disk; files
  uploaded for a form that was then abandoned are not cleaned up automatically.
- **Seed images:** product images are hot-linked from `images.asos-media.com`. If an image cannot be loaded, a
  placeholder is shown.
- **Development port:** `yarn dev` and `yarn start` stop with an error if the port is already in use.
