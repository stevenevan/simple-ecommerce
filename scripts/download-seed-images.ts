// One-off: download real product photos from Unsplash CDN into public/seed-images/.
// Usage:  bun run scripts/download-seed-images.ts [--only-missing]
//
// Source: Unsplash (https://unsplash.com), Unsplash License — free use, no attribution required.
// CDN URLs are direct (no API key); per-slug photo IDs are pinned below for reproducibility.

import { existsSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SLUG_TO_PHOTO_ID: Record<string, string> = {
  'apparel-classic-tee-shirt': '1651761179569-4ba2aa054997',
  'apparel-linen-shirt': '1740711152088-88a009e877bb',
  'apparel-wool-sweater': '1574201635302-388dd92a4c3f',
  'apparel-denim-jacket': '1543076447-215ad9ba6923',
  'accessories-leather-belt': '1664286074176-5206ee5dc878',
  'accessories-canvas-tote': '1548863227-3af567fc3b27',
  'accessories-wool-beanie': '1648483092137-6e63796c8b06',
  'accessories-leather-wallet': '1627123424574-724758594e93',
  'home-ceramic-mug': '1495100497150-fe209c585f50',
  'home-linen-throw': '1598622444897-58985111f62b',
  'home-cast-iron-skillet': '1603038124597-2c5c207edf47',
  'home-walnut-cutting-board': '1666013942797-9daa4b8b3b4f',
  'books-on-writing-well': '1730372798571-0f8e9c7d84aa',
  'books-pragmatic-programmer': '1658708826253-9e4180272def',
  'books-design-of-everyday-things': '1622006816279-9281a5308e5d',
  'books-kitchen-confidential': '1461902492714-c655fb137f7b',
  'electronics-mechanical-keyboard': '1626958390898-162d3577f293',
  'electronics-wireless-mouse': '1660491083562-d91a64d6ea9c',
  'electronics-usb-c-hub': '1616578273461-3a99ce422de6',
  'electronics-desk-lamp': '1621447980929-6638614633c8',
}

const QUERY = 'w=800&q=80&fm=jpg&fit=crop&crop=entropy'
const MIN_BYTES = 5_000
const RETRY_DELAY_MS = 1_000

const onlyMissing = process.argv.includes('--only-missing')
const outDir = path.join(process.cwd(), 'public', 'seed-images')

async function fetchOnce(url: string): Promise<{ status: number; type: string; bytes: Uint8Array }> {
  const res = await fetch(url)
  const buf = new Uint8Array(await res.arrayBuffer())
  return { status: res.status, type: res.headers.get('content-type') ?? '', bytes: buf }
}

async function downloadOne(slug: string, id: string): Promise<number> {
  const url = `https://images.unsplash.com/photo-${id}?${QUERY}`
  let r = await fetchOnce(url)
  if ((r.status === 429 || r.status >= 500) && r.status !== 0) {
    await new Promise((res) => setTimeout(res, RETRY_DELAY_MS))
    r = await fetchOnce(url)
  }
  if (r.status !== 200) throw new Error(`${slug}: HTTP ${r.status}`)
  if (!r.type.startsWith('image/jpeg')) throw new Error(`${slug}: bad content-type ${r.type}`)
  if (r.bytes.byteLength < MIN_BYTES) throw new Error(`${slug}: too small (${r.bytes.byteLength}B)`)

  const outPath = path.join(outDir, `${slug}.jpg`)
  writeFileSync(outPath, r.bytes)
  return r.bytes.byteLength
}

async function main(): Promise<void> {
  const entries = Object.entries(SLUG_TO_PHOTO_ID)
  let written = 0
  let skipped = 0
  const failures: string[] = []

  for (const [slug, id] of entries) {
    const outPath = path.join(outDir, `${slug}.jpg`)
    if (onlyMissing && existsSync(outPath) && statSync(outPath).size > MIN_BYTES) {
      console.log(`skip   ${slug}`)
      skipped++
      continue
    }
    try {
      const bytes = await downloadOne(slug, id)
      console.log(`ok     ${slug} -> ${bytes}B`)
      written++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`FAIL   ${msg}`)
      failures.push(slug)
    }
  }

  console.log(`\nwritten=${written} skipped=${skipped} failed=${failures.length}`)
  if (failures.length > 0) {
    console.error(`failed slugs: ${failures.join(', ')}`)
    process.exit(1)
  }
}

await main()
