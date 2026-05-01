This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Hand-off

Demo creds: `demo@example.com` / `Demo1234!`.

Prereq: **Node 24** (`.nvmrc` provided; `nvm use` if available).

```bash
node --version          # v24.x.x
bun install
cp .env.example .env    # then set SESSION_SECRET (32+ chars)
bun run db:reset
bun dev
```

### Known limitations
- Single currency (USD).
- No real payment integration; `orders.status` defaults to `'confirmed'`.
- Stock race protection is a single-row `UPDATE … WHERE stock >= ?` inside a transaction (no two-phase reservation).
- Cart-drawer prices are advisory; the order is charged at the price at submit time (snapshotted into `order_items.price_cents_snapshot`).
- No email verification, no password reset.
- `/orders` is unpaginated (full history per request).
- DB layer is hybrid: Wk 7+8 helpers use Kysely; Wk 1–6 helpers still use raw `better-sqlite3` prepared statements. Backfill is a future follow-up.
- `e2e/` directory exists but is unused in this milestone.


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
# or
bun dev
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
