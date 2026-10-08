// Prints the SQL CASE arms mapping niche keys to canonical niches, generated from
// apps/web/lib/niches.ts. Used to build migration 0517; rerun it for the next list change.
// Run: node --experimental-strip-types scripts/gen-niche-sql.ts

import { readFileSync } from 'node:fs'
import { NICHES } from '../apps/web/lib/niches.ts'
const src = readFileSync(new URL('../apps/web/lib/niches.ts', import.meta.url), 'utf8')
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const aliasBlock = src.slice(src.indexOf('const NICHE_ALIASES'), src.indexOf('const LEGACY_SPLITS'))
const pairs = [...aliasBlock.matchAll(/([a-z0-9]+): '([^']+)'/g)].map(m => [m[1], m[2]])
const rows = new Map<string, string[]>()
for (const n of NICHES) rows.set(key(n), [n])
for (const [k, v] of pairs) if (!rows.has(k)) rows.set(k, [v])
rows.set('fashionbeauty', ['Fashion & Apparel', 'Beauty & Skincare'])
const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const lines = [...rows].map(([k, v]) => `    WHEN ${q(k)} THEN ARRAY[${v.map(q).join(', ')}]`)
console.log(lines.join('\n'))
