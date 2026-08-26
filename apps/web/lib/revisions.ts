/**
 * What a deal's revision terms actually mean.
 *
 * `revision_limit` is `int not null default 1`, so there is no null to express
 * "no terms were agreed". Two different situations therefore both arrive as 0:
 *
 *   limit 0, per-extra > 0   The creator DOES price revisions and includes none.
 *                            Every revision is chargeable. A real term.
 *
 *   limit 0, per-extra 0     The creator never set revision terms at all. The
 *                            overage maths already makes this free —
 *                            max(0, used - 0) x 0 is 0 no matter how many are
 *                            requested — so it is unlimited and free in
 *                            practice. It was only ever DISPLAYED as
 *                            "0 included", which reads as a limit being broken
 *                            on the first revision and warns both parties about
 *                            terms nobody agreed.
 *
 * Deriving it here rather than at each display site means the brand's screen,
 * the creator's screen and the offer card cannot describe the same deal
 * differently.
 */

export interface RevisionTerms {
  /** No limit was agreed: any number of revisions, none chargeable. */
  unlimited: boolean
  /** Included revisions. Meaningless when `unlimited`. */
  limit: number
  perExtraPaise: number
}

export function revisionTerms(
  limit: number | null | undefined,
  perExtraPaise: number | null | undefined,
): RevisionTerms {
  const l = limit ?? 0
  const p = perExtraPaise ?? 0
  return { unlimited: l === 0 && p === 0, limit: l, perExtraPaise: p }
}

/** How the terms read to a person, on either side of the deal. */
export function revisionLabel(t: RevisionTerms): string {
  if (t.unlimited) return 'Unlimited'
  if (t.limit === 0) return 'Chargeable from the first'
  return `${t.limit} included`
}

/**
 * Is this revision beyond what was agreed?
 *
 * False whenever no terms were agreed — warning someone for exceeding a limit
 * that does not exist is how a warning stops meaning anything.
 */
export function isOverLimit(t: RevisionTerms, revisionsUsed: number): boolean {
  if (t.unlimited) return false
  return revisionsUsed >= t.limit
}

/** Chargeable overage in paise. Zero when no terms were agreed. */
export function overagePaise(t: RevisionTerms, revisionsUsed: number): number {
  if (t.unlimited) return 0
  return Math.max(0, revisionsUsed - t.limit) * t.perExtraPaise
}
