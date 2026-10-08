/**
 * Fee regression baseline for existing brand↔creator deals.
 *
 * Experiences add a margin calculation on a separate path. This proves the
 * EXISTING fee maths — calculateFee and every rung of resolveDealFee's ladder —
 * is byte-identical before and after that work. The baseline was captured from
 * the code as it stood before any Experience code existed (2026-10-05).
 *
 * resolveDealFee runs against a stand-in client that answers exactly the
 * queries it makes, so no database is touched.
 *
 * Run from the repo root (react-server: deal-fee.ts imports 'server-only'):
 *   NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-fee-golden.ts
 * Re-baseline ONLY on a deliberate fee change, never to make a diff go away:
 *   ... scripts/test-fee-golden.ts --write
 */

import * as fs from 'fs'
import * as path from 'path'
import { calculateFee } from '../apps/web/lib/fee'
import { resolveDealFee } from '../apps/web/lib/deal-fee'

const GOLDEN = path.resolve(__dirname, 'fee-golden.json')

/** Answers the three queries resolveDealFee makes, from a scenario. */
function stub(s: { pairRate?: number; origin?: string; pairDeals?: number }) {
  const q = (table: string) => {
    const chain: any = {
      select: () => chain, eq: () => chain, not: () => chain,
      maybeSingle: async () => ({
        data: table === 'brand_creator_rates' ? (s.pairRate === undefined ? null : { fee_pct: s.pairRate })
            : table === 'brand_creator_origin' ? (s.origin ? { origin: s.origin } : null) : null,
      }),
      then: (resolve: (v: unknown) => void) => resolve({ count: s.pairDeals ?? 0 }),
    }
    return chain
  }
  return { from: q }
}

async function compute() {
  const out: Record<string, unknown> = {}

  const bases = [0, 1, 99, 100, 333, 1_000_000, 2_500_050, 99_999_999]
  const pcts = [0, 10, 12.5, 15, 20, 30, 33.3]
  for (const b of bases) for (const p of pcts) for (const m of ['on_top', 'deducted'] as const) {
    out[`calc:${b}:${p}:${m}`] = calculateFee(b, p, m)
  }

  const scenarios: Record<string, { s: Parameters<typeof stub>[0]; brandPct: number; mode: 'on_top' | 'deducted'; track: 'deals' | 'growth' }> = {
    standard_deducted:           { s: {}, brandPct: 15, mode: 'deducted', track: 'deals' },
    standard_on_top:             { s: {}, brandPct: 15, mode: 'on_top', track: 'deals' },
    custom_brand_rate:           { s: {}, brandPct: 12, mode: 'deducted', track: 'deals' },
    ops_pair_rate:               { s: { pairRate: 8 }, brandPct: 15, mode: 'on_top', track: 'deals' },
    ops_pair_rate_zero:          { s: { pairRate: 0 }, brandPct: 15, mode: 'deducted', track: 'deals' },
    ops_pair_rate_beats_growth:  { s: { pairRate: 10 }, brandPct: 15, mode: 'on_top', track: 'growth' },
    storefront_first_deal:       { s: { origin: 'storefront', pairDeals: 0 }, brandPct: 15, mode: 'deducted', track: 'deals' },
    storefront_not_first:        { s: { origin: 'storefront', pairDeals: 2 }, brandPct: 15, mode: 'deducted', track: 'deals' },
    guapd_origin:                { s: { origin: 'guapd' }, brandPct: 15, mode: 'deducted', track: 'deals' },
    growth_track:                { s: {}, brandPct: 15, mode: 'on_top', track: 'growth' },
    growth_track_deducted_brand: { s: {}, brandPct: 15, mode: 'deducted', track: 'growth' },
  }
  for (const [name, sc] of Object.entries(scenarios)) {
    out[`resolve:${name}`] = await resolveDealFee(stub(sc.s), 'brand', 'creator', sc.brandPct, sc.mode, sc.track)
  }
  return out
}

async function main() {
  const now = JSON.stringify(await compute(), null, 2) + '\n'
  if (process.argv.includes('--write')) {
    fs.writeFileSync(GOLDEN, now)
    console.log(`Baseline written: ${Object.keys(JSON.parse(now)).length} cases → ${GOLDEN}`)
    return
  }
  const was = fs.readFileSync(GOLDEN, 'utf8')
  if (was === now) {
    console.log(`✅ Fee maths byte-identical to baseline (${Object.keys(JSON.parse(now)).length} cases)`)
    return
  }
  const a = JSON.parse(was), b = JSON.parse(now)
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log(`❌ ${k}\n   was ${JSON.stringify(a[k])}\n   now ${JSON.stringify(b[k])}`)
  }
  process.exitCode = 1
}

main()
