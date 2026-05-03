# Plan — Real Product Images

## Goal

Replace the 21 placeholder JPGs in `public/seed-images/` with real product photos so each product card / detail page shows a meaningful image. Images are downloaded once from the internet and committed locally; runtime stays same-origin (no `next.config.ts` remotePatterns change, `safeProductImage` invariant preserved).

## Current State

- `data/seed/products.json` — 20 products, each with `image_url: "/seed-images/<slug>.jpg"`.
- `public/seed-images/` — 20 product stub JPGs (~1.7K, 512×512, ffmpeg-encoded blank) + `missing.jpg` (21st stub, separate fallback) + `_placeholder.svg`.
- `scripts/` directory does **not** exist — must be created before writing the script.
- `lib/image.ts:safeProductImage` — rejects anything not starting with `/`. Local paths only.
- `lib/db/seed.ts:58-63` — falls back to `/seed-images/missing.jpg` if file missing on disk at seed time.
- Renderers: `app/ProductCard.tsx` (grid, 400×400), `app/products/[slug]/_components/ProductImage.tsx` (detail), `app/_components/CartDrawer.tsx`, `app/checkout/page.tsx`.

## Source

**Unsplash CDN direct URLs** (`images.unsplash.com/photo-<id>?w=800&q=80&fm=jpg&fit=crop`). No API key needed for the static CDN. Unsplash License permits free download + use, no attribution required (we'll still note source in script header). One curated photo ID per slug.

Alternatives considered:
- Picsum / LoremFlickr — random, not product-specific. Rejected.
- Pexels API — requires key. Rejected (no env var setup needed).
- Generated with diffusion model — out of scope, also less faithful.

## Changes

### 1. New file: `scripts/download-seed-images.ts`

One-off Bun script. Behavior:
- Reads `data/seed/products.json`.
- Embedded slug → Unsplash photo-id map (concrete IDs — see Curation step below).
- For each product, fetches `https://images.unsplash.com/photo-<id>?w=800&q=80&fm=jpg&fit=crop&crop=entropy`.
- Writes to `public/seed-images/<slug>.jpg` (overwrites existing stubs).
- Validates: HTTP 200, `content-type: image/jpeg`, body ≥ 5KB.
- Logs `slug → bytes` per file; exits non-zero on any failure.
- One retry with 1s delay on 429/5xx. No retry framework, no progress bar, no class abstraction — single flat async function.
- Flag `--only-missing` (parsed via `process.argv.includes('--only-missing')`, no arg-parser dep) skips slugs whose file already exists with size > 5KB.
- Does **not** touch `missing.jpg` or `_placeholder.svg`.

Embedded slug → photo-id map (curated, one entry per product):

| slug | search match |
|------|-------------|
| apparel-classic-tee-shirt | white tee on hanger |
| apparel-linen-shirt | linen button-up |
| apparel-wool-sweater | grey crew sweater |
| apparel-denim-jacket | denim jacket flatlay |
| accessories-leather-belt | brown leather belt |
| accessories-canvas-tote | canvas tote bag |
| accessories-wool-beanie | knit beanie |
| accessories-leather-wallet | bifold wallet |
| home-ceramic-mug | stoneware mug |
| home-linen-throw | linen blanket |
| home-cast-iron-skillet | cast iron pan |
| home-walnut-cutting-board | wood cutting board |
| books-on-writing-well | book cover stack |
| books-pragmatic-programmer | book cover stack |
| books-design-of-everyday-things | book cover stack |
| books-kitchen-confidential | book cover stack |
| electronics-mechanical-keyboard | mechanical keyboard |
| electronics-wireless-mouse | computer mouse |
| electronics-usb-c-hub | usb hub flatlay |
| electronics-desk-lamp | desk lamp |

(Photo IDs filled in during implementation — script header documents the source URL for each.)

### 2. New file: `public/seed-images/missing.jpg` (regenerate)

Not strictly required, but the existing `missing.jpg` is also a stub. Optional: replace with a small "image unavailable" graphic generated locally via a one-line `sharp` snippet, OR leave alone. Default: leave alone (out of scope — task is per-product images).

### 3. No code changes

- `safeProductImage`, `ProductCard`, `ProductImage`, `CartDrawer`, `checkout` — all already render `image_url` correctly.
- `next.config.ts` — no `remotePatterns` change (images stay same-origin).
- `data/seed/products.json` — `image_url` paths already correct, no edit.
- Re-running `bun run db:seed` is **not required** — DB rows already point at the right paths and the file-existence guard in `lib/db/seed.ts:58` will now find real files (not that it changes anything: paths matched before too).

### 4. `package.json` — optional script entry

Add `"images:download": "bun run scripts/download-seed-images.ts"` for discoverability. Acceptable per AGENTS.md (no convention against scripts/).

## Implementation Order

0. **Curation gate** — propose concrete `photo-<id>` values for all 20 slugs in chat (slug + 1-line description + URL). **Wait for user approval** before any code is written. Photo IDs are the most opinion-sensitive part; agent must not pick them silently.
1. `mkdir -p scripts`. Write `scripts/download-seed-images.ts` with the approved map.
2. Run `bun run scripts/download-seed-images.ts`. Verify all 20 product files written, each ≥ 5KB, all are real JPEGs (`file public/seed-images/<slug>.jpg`).
3. Add `images:download` script entry to `package.json`.
4. Clear stale optimizer cache: `rm -rf .next/cache/images` (so dev server doesn't serve old stub variants).
5. Run `bun run lint`, `bun run type:check`, `bun run test`. Expect green.
6. Hand off to user: report disk delta (`du -sh public/seed-images/`), list what was downloaded, ask user to start dev server / browser-verify before deciding whether to commit.
7. **Do not stage or commit** any file under `public/seed-images/` without explicit user instruction.

## Verification

Agent-executable (must pass before hand-off):
- [ ] All 20 product files ≥ 5KB:
  `ls -la public/seed-images/*.jpg | awk '$5 > 5000 && $NF !~ /missing\.jpg$/ {c++} END {print c}'` → expect `20`.
- [ ] Real JPEGs, not stubs: `file public/seed-images/apparel-denim-jacket.jpg` contains `JPEG image data` and reports dimensions ≠ 512×512 stub.
- [ ] `bun run lint && bun run type:check && bun run test` all pass.
- [ ] `missing.jpg` and `_placeholder.svg` unchanged: `ls -la public/seed-images/missing.jpg public/seed-images/_placeholder.svg` shows mtime predates this run.

User-verified (after hand-off):
- [ ] Dev server `/` grid: every card shows a distinct, on-topic image.
- [ ] Dev server `/products/apparel-denim-jacket`: detail image renders.
- [ ] Cart drawer thumbnail renders.
- [ ] No new browser console errors / 404s on `/seed-images/*`.

## Risks / Open Questions

- **Repo size**: 20 × ~80–150 KB ≈ 2–3 MB committed. Acceptable for a workshop repo; flag if concerning.
- **Unsplash rate limits**: CDN is static, no auth, but if 429s appear the script will retry once with backoff.
- **Image fit**: cards use `object-cover` at 1:1, so 800×800 crop with `fit=crop&crop=entropy` will look fine. Detail page uses same.
- **License**: Unsplash License permits use without attribution. Script header documents source per slug for traceability.
- **Determinism / mirror access**: Unsplash CDN may rotate URLs. Photo IDs are stable. If a fetch fails years later, `--only-missing` rerun won't help; out of scope to mirror.

## Out of Scope (hard boundaries — must not modify)

- `lib/image.ts`, `next.config.ts`, `data/seed/products.json`, `missing.jpg`, `_placeholder.svg`, any renderer (`ProductCard.tsx`, `ProductImage.tsx`, `CartDrawer.tsx`, `checkout/page.tsx`).
- Image optimization beyond Unsplash's `?w=800&q=80` URL params — no `sharp` or any new dependency.
- Adding `next/image` `remotePatterns`.
- Re-seeding DB / running migrations.
- `bun install` / package additions (per existing memory feedback).
- Staging or committing downloaded images. Defer to user.

## Review Trail

### Metis Plan Consultant
- [x] Curation gate added — Step 0 requires user approval of photo IDs before any code is written.
- [x] `mkdir scripts` made explicit (Step 1).
- [x] `.next/cache/images` clear added (Step 4) to defeat stale optimizer cache.
- [x] Verification count fixed: 20 product files, not 21; `missing.jpg` excluded.
- [x] `--only-missing` flag uses `process.argv.includes`; no arg-parser dep.
- [x] Hard-boundary list explicit (Out of Scope); no commit without user instruction.
- [x] No new packages, no `sharp`, no retry framework, no abstractions.
- [x] Visual verification reframed as user-side, not agent-side.
- [x] `21 stub JPGs` corrected to `20 product stubs + missing.jpg`.
- [x] Skipped (deferred to chat): user approval gate for repo-size impact — explicit in Step 6 pre-commit handoff.
- [x] Skipped: 800×800 vs optimizer-resize — Unsplash `?w=800` source is fine; `next/image` resizes per render width.

### Momus Plan Reviewer
- [x] **OKAY** — all paths verified, all commands runnable, slug list matches `data/seed/products.json` 1:1, "no code changes" claim accurate, awk one-liner portable on macOS BSD, no contradictions, Step 0 concretely blocks on user approval.
- [x] Optional polish noted (use `grep -v 512x512` to make `file` check boolean) — not blocking, left as-is.
