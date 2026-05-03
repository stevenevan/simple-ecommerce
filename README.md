This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Hand-off

Demo creds: `demo@example.com` / `Demo1234!`.

Prereq: **Node 24** (`.nvmrc` provided; `nvm use` if available).

```bash
node --version          # v24.x.x
npm install
cp .env.example .env    # then set SESSION_SECRET (32+ chars)
npm run db:reset
npm run dev
```

### Known limitations
- Single currency (USD).
- No real payment integration; `orders.status` defaults to `'confirmed'`.
- Stock race protection is a single-row `UPDATE … WHERE stock >= ?` inside a transaction (no two-phase reservation).
- Cart-drawer prices are advisory; the order is charged at the price at submit time (snapshotted into `order_items.price_cents_snapshot`).
- No email verification, no password reset.
- `/orders` is unpaginated (full history per request).

### Seed images

`npm run db:seed` falls back to `/seed-images/missing.jpg` for any product whose
image file is absent. Pull the real Unsplash photos with:

```bash
npm run images:download
```


## Tests

Two suites:

- **Vitest** (`npm test`) — unit tests in `tests/unit/` and in-process
  integration tests in `tests/integration/` (route handlers + Kysely against
  an in-memory SQLite via `SQLITE_PATH=:memory:`).
- **Playwright** (`npm run test:e2e`) — API-level specs in `tests/api/` and a
  browser happy-path in `tests/e2e/`. Covers money/crash paths: order creation,
  stock race, cart mutations, auth, IDOR. Run `npm run test:e2e:install` once
  to fetch Chromium. The runner uses a separate `data/test.db` plus a pinned
  test-only `SESSION_SECRET` and boots the dev server on port `3100`.

## Auth secret

Copy `.env.example` to `.env` and set `SESSION_SECRET` to ≥32 random chars before booting:

```bash
echo "SESSION_SECRET=$(openssl rand -base64 32)" > .env
```

Rotating `SESSION_SECRET` invalidates every existing session cookie (all users get logged out).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
