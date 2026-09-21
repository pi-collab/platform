/**
 * The demonstration rows a brand-new shopfront is pre-filled with, and how to
 * recognise one that has never been touched.
 *
 * ── Why the public page has to know about these ─────────────────────────────
 * They exist to show a creator what a filled showcase looks like: five
 * invented titles against invented figures. That is useful scaffolding in the
 * editor and a lie on a published page — and the published page is where they
 * ended up, because a creator who never edits them still presses Publish.
 *
 * On production this was not hypothetical: a live shopfront was showing
 * "1.2M views" on a card headed "Product review, Brand", in the same grid and
 * the same styling as figures Instagram actually reported. The page has spent
 * this whole feature being careful not to state a number nobody measured —
 * blanks instead of zeros, a verified mark set only from the snapshot — while
 * publishing five made-up ones at the top of the section.
 *
 * So the editor keeps showing them and the public page drops them.
 *
 * Shared rather than duplicated because the comparison below is exact: two
 * copies of this list would drift, the match would silently stop working, and
 * the samples would quietly start publishing again.
 */

export interface SampleComparableItem {
  title?: string
  type?: string
  brand?: string
  date?: string
  views?: string
  engagement?: string
  saves?: string
  igMediaId?: string
  embedUrl?: string
  thumbnailUrl?: string
}

export const SAMPLE_CONTENT_ITEMS: Required<Pick<SampleComparableItem,
  'title' | 'type' | 'brand' | 'date' | 'views' | 'engagement' | 'saves'>>[] = [
  { title: 'Product review', type: 'Reel', brand: 'Brand', date: 'Jul 2026', views: '1.2M', engagement: '7.5%', saves: '28K' },
  { title: 'Day in my life', type: 'Reel', brand: 'Brand', date: 'Jun 2026', views: '800K', engagement: '6.2%', saves: '15K' },
  { title: 'Tutorial', type: 'Reel', brand: 'Brand', date: 'Jun 2026', views: '650K', engagement: '8.1%', saves: '32K' },
  { title: 'Unboxing', type: 'Story', brand: 'Brand', date: 'May 2026', views: '400K', engagement: '5.8%', saves: '10K' },
  { title: 'Get ready with me', type: 'Reel', brand: 'Brand', date: 'May 2026', views: '900K', engagement: '7.2%', saves: '22K' },
]

/**
 * An untouched demo row, still exactly as it was seeded.
 *
 * Compared field by field rather than by title alone: a creator who wrote
 * their own piece and happened to call it "Tutorial" owns that row, and it
 * must neither be displaced in the editor nor hidden from their page. Any
 * edit at all fails this check, which is the safe direction to fail in — the
 * cost of a false negative is one demo row published, the cost of a false
 * positive is a creator's real work vanishing from their shopfront.
 */
export function isSampleItem(item: SampleComparableItem): boolean {
  if (item.igMediaId || item.embedUrl || item.thumbnailUrl) return false
  return SAMPLE_CONTENT_ITEMS.some(s =>
    s.title === item.title && s.type === item.type && s.brand === item.brand
    && s.date === item.date && s.views === item.views
    && s.engagement === item.engagement && s.saves === item.saves)
}
