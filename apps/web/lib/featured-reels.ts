/**
 * How many pieces a creator's content showcase holds, and shows.
 *
 * ── One number, because it is one idea ──────────────────────────────────────
 * This used to be three: the editor stopped accepting new pieces at eight,
 * both renderers sliced to five, and the reel picker capped at six. A creator
 * could therefore add a seventh and an eighth piece, be told nothing, and have
 * them silently never appear on their own page.
 *
 * FIVE is the number, because five is what the shopfront has always shown.
 * The others were the ones out of step: the editor let a creator build a list
 * longer than their page would ever display.
 *
 * Instagram reels are ordinary showcase items now, so the reel cap and the
 * showcase cap are the same thing and share this constant. It has no
 * server-only import, so the editor, the picker, both renderers and the sync
 * all read the same value.
 */
export const MAX_SHOWCASE_ITEMS = 5

/** The reel-specific name, kept for the sync and its callers. Same number, by
 *  construction: a featured reel IS a showcase item. */
export const MAX_FEATURED_REELS = MAX_SHOWCASE_ITEMS
