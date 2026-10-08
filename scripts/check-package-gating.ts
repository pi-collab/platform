/**
 * Fails if any app code READS creator_products without saying which pricing
 * type it wants.
 *
 * A creator's shoot day rate (pricing_type 'per_day', 0533) prices a Guapd
 * Experience creator leg and must never reach a brand: a brand that saw it
 * could work out Guapd's margin. The read policy hides it from other users,
 * but most app reads use the service role, which skips the policy. So every
 * read names its pricing_type: brand-facing and public reads filter to
 * 'per_deliverable'; the creator's own day-rate reads filter to 'per_day'.
 * A new read without the filter fails here instead of leaking quietly.
 *
 * Writes (insert / update / delete) are not reads and are not checked here;
 * the marketplace editors pin their updates to per_deliverable themselves.
 *
 * Run from the repo root:  ./node_modules/.bin/tsx scripts/check-package-gating.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../apps/web')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

let reads = 0
const failures: string[] = []
for (const file of walk(ROOT)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!/from\(\s*['"]creator_products['"]\s*\)/.test(line)) return
    // The query chain: this line plus the following lines that continue it.
    const chain = [line]
    for (let j = i + 1; j < lines.length && j < i + 25; j++) {
      const t = lines[j].trim()
      if (!t.startsWith('.') && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*')) break
      chain.push(lines[j])
    }
    const text = chain.join('\n')
    // A write that returns its rows (.update(...).select('id')) is still a write.
    if (!/\.select\(/.test(text) || /\.(insert|update|upsert|delete)\(/.test(text)) return
    reads++
    if (!/\.(eq|in)\(\s*['"]pricing_type['"]/.test(text)) {
      failures.push(`${path.relative(ROOT, file)}:${i + 1} reads creator_products without a pricing_type filter`)
    }
  })
}

// Also: no embedded read (creator_products(...) inside another select), which
// this line-based check could not see.
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8')
  const m = src.match(/select\([^)]*creator_products\s*\(/)
  if (m) failures.push(`${path.relative(ROOT, file)}: embeds creator_products in a select; read it directly with a pricing_type filter`)
}

if (failures.length) {
  console.error(`❌ ${failures.length} creator_products read(s) without a pricing_type filter:\n  ` + failures.join('\n  '))
  process.exit(1)
}
console.log(`✅ all ${reads} creator_products reads name their pricing_type`)
