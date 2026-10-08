/**
 * Fails if app code reads margin / P&L data anywhere except the allowed modules.
 *
 * The P&L is gated by experience_pnl() checking the CALLER's financial flag in
 * Postgres. The service role can still read the raw tables (the stated limit),
 * so this check makes a new service-role read of P&L data a deliberate,
 * reviewed exception instead of a quiet leak. Run in CI and before release.
 *
 * Run from the repo root:  ./node_modules/.bin/tsx scripts/check-pnl-isolation.ts
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../apps/web')

/** pattern → the only files allowed to contain it */
const RULES: { what: string; pattern: RegExp; allowed: string[] }[] = [
  { what: 'reads the P&L snapshot table', pattern: /experience_pnl_snapshots/, allowed: [] },
  { what: 'calls the internal P&L calculation', pattern: /compute_experience_pnl/, allowed: [] },
  { what: 'calls the P&L / payouts database functions', pattern: /rpc\(\s*['"]experience_(pnl|payouts)['"]/, allowed: ['lib/experience-pnl-server.ts'] },
  { what: 'calls the staff console database functions', pattern: /rpc\(\s*['"]experience_console_[a-z_]+['"]/, allowed: ['lib/experience-console-server.ts'] },
  { what: 'computes margin in app code', pattern: /\bexperienceMargin\s*\(/, allowed: ['lib/experience-money.ts'] },
  { what: 'reads or writes staff access', pattern: /from\(\s*['"]staff_access['"]\s*\)/, allowed: ['lib/staff-access-server.ts'] },
  // PnlPanel is the one reviewed exception: it DISPLAYS the figures experience_pnl() returned to a financial caller.
  { what: 'handles margin figures', pattern: /guapd_margin|platform_fee_kept|guapdMarginPaise|platformFeeKeptPaise/, allowed: ['lib/experience-pnl-server.ts', 'lib/experience-money.ts', 'app/experiences-admin/[id]/PnlPanel.tsx'] },
  // 0537: costs and the stored margin are reached only through database functions.
  { what: 'reads cost lines directly', pattern: /from\(\s*['"]experience_cost_lines['"]\s*\)/, allowed: [] },
  { what: 'asks for financial access outside the P&L module', pattern: /has_experience_access['"]\s*,\s*\{\s*p_kind:\s*['"]financial/, allowed: ['lib/experience-pnl-server.ts'] },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p)
  }
  return out
}

let violations = 0
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file)
  const src = fs.readFileSync(file, 'utf8')
  for (const r of RULES) {
    if (r.pattern.test(src) && !r.allowed.includes(rel)) {
      violations++
      console.log(`❌ ${rel} ${r.what} (allowed only in: ${r.allowed.join(', ') || 'nowhere in app code'})`)
    }
  }
}
console.log(violations ? `\n${violations} P&L isolation violation(s)` : '✅ P&L isolation: no app code reads margin outside the gated modules')
if (violations) process.exitCode = 1
