/**
 * Brand industry options — the single list, shared by signup and settings.
 *
 * Lives in a plain module rather than beside the server action that validates
 * it. A 'use server' file turns EVERY export into a server-action reference on
 * the client, so an array exported from one arrives in a client component as a
 * function proxy and throws the moment anything calls .map() on it.
 *
 * ── Contents ────────────────────────────────────────────────────────────────
 * The design's eleven, plus the four this product already used, per the
 * decision to keep both rather than replace one with the other.
 *
 * Two design entries were mapped rather than duplicated: "Finance" gives way to
 * 'BFSI/Fintech', which is the wedge's own language and is already stored on
 * live rows. 'EdTech' and 'Education' are BOTH kept — they are not the same
 * thing (a learning app is not a university), and 'EdTech' is live data.
 *
 * These strings ARE the value stored on brands.category. Renaming one does not
 * migrate existing rows, it strands them: the brand's saved value silently
 * stops matching any option and their category appears blank. Treat this as
 * data, not labels.
 *
 * Alphabetical, because a fourteen-item list is scanned rather than read.
 */
export const BRAND_CATEGORIES: string[] = [
  'Beauty & Fashion',
  'BFSI/Fintech',
  'D2C',
  'EdTech',
  'Education',
  'Entertainment & Media',
  'Food & Beverage',
  'Gaming',
  'Health & Wellness',
  'Home & Lifestyle',
  'Sports & Fitness',
  'Tech & Electronics',
  'Travel & Hospitality',
  'Other',
]
