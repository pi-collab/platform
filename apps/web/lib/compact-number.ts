/**
 * Short form for a large count: 1.2M, 12.4K, 940.
 *
 * Shared rather than copied because the brand dashboard and the creator
 * dashboard now display the SAME underlying figures — reach and interactions
 * summed across the same delivered posts. Two private copies of this drifting
 * apart would show a brand and a creator different numbers for one post, and
 * the disagreement would be in the rounding rather than anywhere either of
 * them could see.
 */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) { const v = n / 1_000_000; return `${v % 1 === 0 ? v : v.toFixed(1)}M` }
  if (n >= 1_000) { const v = n / 1_000; return `${v % 1 === 0 ? v : v.toFixed(1)}K` }
  return String(n)
}
