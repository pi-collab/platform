'use client'

/**
 * A Message control that opens the chat panel already on the page.
 *
 * The deal pages carried Message buttons that navigated to the inbox, while
 * DealThread — a LinkedIn-style panel, complete with realtime and a composer —
 * sat imported and never rendered. So pressing Message left the deal to find a
 * conversation that could have opened in place.
 *
 * A custom event rather than shared state: the button and the panel sit in
 * different subtrees of a server-rendered page, and threading a context through
 * that to carry one boolean would be more machinery than the job needs.
 */
export const OPEN_DEAL_CHAT = 'guapd:open-deal-chat'

export default function OpenDealChat({
  children,
  style,
  className,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_DEAL_CHAT))}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', ...style }}
    >
      {children}
    </button>
  )
}
