import { ReactNode } from 'react'

/**
 * Inline form error — the house pattern from the auth designs
 * ("Creator Login Verify Error", "Creator Login - Paged Flow" et al).
 *
 * White card, hairline red border, circled-! glyph, 12.5px semibold red text.
 * Values transcribed from the design rather than approximated, so every auth
 * surface reports failure identically.
 *
 * Accepts children rather than a string so a message can carry a link — a
 * blocked signup needs a way to reach a human, not just a refusal.
 */
export default function FormError({ children }: { children: ReactNode }) {
  return (
    <div className="formerr" role="alert">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <span className="formerr__text">{children}</span>
    </div>
  )
}
