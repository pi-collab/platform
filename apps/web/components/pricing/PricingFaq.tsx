'use client'

import { useState } from 'react'

/**
 * The FAQ on both pricing pages, as an accordion.
 *
 * ── Why it collapses ────────────────────────────────────────────────────────
 * Four questions with all four answers open is a wall of prose under the thing
 * the reader actually came for. Collapsed, the four questions read as a list of
 * what can be asked, which is itself useful — someone who wants none of them
 * can see that in a glance instead of scrolling past the answers.
 *
 * The first is open by default rather than all closed: an accordion where
 * nothing is open looks like a nav bar and gives no clue what an answer looks
 * like. One open shows the shape.
 *
 * ── Independent, not one-at-a-time ──────────────────────────────────────────
 * Opening a second question does not shut the first. A reader comparing two
 * answers should not have to keep reopening one of them, and nothing here is
 * long enough for several open at once to be a problem.
 *
 * ── Same component, two skins ───────────────────────────────────────────────
 * The two pricing pages divide their items differently — the creator page rules
 * BETWEEN items, the brand page rules UNDER each — and their headings differ by
 * half a point. Rather than force one, those stay props, so this is one
 * behaviour in one place without either page being redrawn to suit the other.
 */
export default function PricingFaq({
  items,
  /* A token, not a number: both pricing pages scale their type down on a
     phone, and the FAQ has to come with them. Callers pass a var. */
  headingSize = 'var(--prc-faq-q, 16.5px)',
  headingTag: HeadingTag = 'h4',
  divider = 'top',
}: {
  items: [string, string][]
  headingSize?: string
  headingTag?: 'h3' | 'h4'
  /** 'top' rules between items; 'bottom' rules under each, including the last. */
  divider?: 'top' | 'bottom'
}) {
  const [open, setOpen] = useState<number[]>([0])
  const isOpen = (i: number) => open.includes(i)
  const toggle = (i: number) =>
    setOpen((prev) => (prev.includes(i) ? prev.filter((n) => n !== i) : [...prev, i]))

  const rule = '1px solid rgba(18,21,28,.08)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map(([q, a], i) => (
        <div
          key={q}
          style={{
            borderTop: divider === 'top' && i > 0 ? rule : undefined,
            borderBottom: divider === 'bottom' ? rule : undefined,
          }}
        >
          <button
            type="button"
            onClick={() => toggle(i)}
            aria-expanded={isOpen(i)}
            style={{
              width: '100%', border: 'none', background: 'none', font: 'inherit',
              color: 'inherit', textAlign: 'left', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 16, padding: 'var(--prc-faq-item, 22px) 0',
            }}
          >
            <HeadingTag style={{ margin: 0, flex: 1, minWidth: 0, fontSize: headingSize, fontWeight: 600, letterSpacing: '-0.005em', lineHeight: 1.45 }}>
              {q}
            </HeadingTag>
            <span
              aria-hidden="true"
              style={{
                width: 28, height: 28, borderRadius: '50%', background: '#F5F6F2',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transform: isOpen(i) ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>

          {/* The question's own padding already spaces it from the rule above,
              so the answer only needs the gap under itself.

              ── Why there is no narrow cap on the answer ──────────────────
              These were capped at 720-760px and then had a further 44px taken
              off the right to clear the chevron, which left under 700px — so a
              98-character answer broke onto a second line on a 1200px page
              with room to spare. The chevron sits on the QUESTION row, not
              beside the answer, so the answer never had to clear it.

              A cap still exists, because a line running the full width of a
              desktop is genuinely hard to read. It is just wide enough now
              that the answers written for this page fit the lines they were
              written for. */}
          {isOpen(i) && (
            <p style={{ margin: '-8px 0 var(--prc-faq-item, 22px)', fontSize: 'var(--prc-faq-a, 15px)', lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: 'var(--prc-faq-w, 880px)' }}>
              {a}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
