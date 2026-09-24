/**
 * "2 Reels · 1 Story" — what a deal is for, in the width of a card line.
 *
 * A deal's `deliverables` column is free text the brand typed, and an item's
 * `label` is a product name from PRODUCT_TYPES ("Instagram Reel", "Sponsored
 * Story", "YouTube Long form"). Either reads fine on a detail page and neither
 * survives a dashboard card: "Instagram Reel, Instagram Reel, Instagram Story"
 * truncates to "Instagram Reel, Instagra…", which tells a brand nothing it did
 * not already know.
 *
 * What the card has room for is the SHAPE of the work: how many of what. So
 * the platform prefix and the "Sponsored" are dropped — a brand looking at
 * their own deal knows which platform they bought — and the rest is counted.
 */

/** Longest match wins, so "YouTube Shorts" is not caught by "Short". */
const TYPE_WORDS: [RegExp, string][] = [
  [/static\/carousel|carousel/i, 'Carousel'],
  [/story series|story set|stories|story/i, 'Story'],
  [/reel/i, 'Reel'],
  [/shorts?/i, 'Short'],
  [/long form|dedicated video/i, 'Video'],
  [/integration/i, 'Integration'],
  [/thread/i, 'Thread'],
  [/newsletter/i, 'Mention'],
  [/podcast/i, 'Read'],
  [/blog/i, 'Blog'],
  [/live/i, 'Live'],
  [/video/i, 'Video'],
  [/post/i, 'Post'],
]

/** One product name reduced to the noun a brand would say out loud. */
export function shortDeliverableName(label: string): string {
  for (const [pattern, word] of TYPE_WORDS) {
    if (pattern.test(label)) return word
  }
  /* Unrecognised — a custom item. Its own name is the best we have, trimmed
     to something that fits rather than replaced with "Other", which would
     hide the one deliverable whose name was chosen deliberately. */
  const clean = label.replace(/^(instagram|youtube|tiktok|x\/twitter|linkedin|sponsored)\s+/i, '').trim()
  return clean || 'Deliverable'
}

function plural(word: string, n: number): string {
  if (n === 1) return word
  return word === 'Story' ? 'Stories' : `${word}s`
}

/**
 * Counts by type, most first: "2 Reels · 1 Story".
 *
 * `max` groups are listed and the rest collapses to "+N more", because three
 * groups is what fits and a line that wraps costs the card its shape.
 */
export function summariseDeliverables(labels: string[], max = 3): string {
  if (labels.length === 0) return ''

  const counts = new Map<string, number>()
  for (const label of labels) {
    const word = shortDeliverableName(label)
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }

  /* Most numerous first, ties alphabetical — so the same deal always reads the
     same way rather than in whatever order the rows came back. */
  const groups = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  const shown = groups.slice(0, max).map(([word, n]) => `${n} ${plural(word, n)}`)
  const hidden = groups.length - shown.length
  if (hidden > 0) shown.push(`+${hidden} more`)

  return shown.join(' · ')
}
