'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * A confirmation, in the product's own voice.
 *
 * ── Why not window.confirm ──────────────────────────────────────────────────
 * Because it is the browser's dialog, not ours: system type, a system title
 * bar naming the host, and two buttons called OK and Cancel. "OK" is the worst
 * possible label for an irreversible action — it answers a question the person
 * has to re-read the body to remember. A real dialog can put the action itself
 * on the button, so the last thing read before pressing is what pressing does.
 *
 * It also blocks the main thread, which means nothing behind it can show
 * pending state while it is open.
 *
 * ── Portalled, like the campaign-type chooser ───────────────────────────────
 * Any ancestor with a transform or its own z-index makes a fixed child stack
 * INSIDE it, so a dialog rendered where it is used can end up beneath a nav
 * bar however high its z-index goes. At document.body there is no ancestor
 * left to be trapped by.
 */
export default function ConfirmDialog({
  open, title, body, detail, confirmLabel, cancelLabel = 'Cancel',
  tone = 'default', busy = false, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  body: string
  /** Optional second line, e.g. what it will cost or who it reaches. */
  detail?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** 'danger' for anything destructive; 'default' is the neon primary. */
  tone?: 'default' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  /* Focus lands on the confirm button, and Escape cancels. A dialog you have
     to reach for with the mouse is a dialog that interrupts twice. */
  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal((
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10010,
        background: 'rgba(24,28,36,.4)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px 16px calc(16px + env(safe-area-inset-bottom))',
        animation: 'ctFadeIn .2s ease backwards',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        style={{
          width: 'min(460px, 100%)',
          background: '#FCFBF7', borderRadius: 22,
          boxShadow: '0 40px 80px -30px rgba(24,28,36,.5)',
          padding: '30px 30px 26px',
          animation: 'ctPopIn .26s cubic-bezier(.22,1,.36,1) backwards',
        }}
      >
        <h2 id="confirm-title" style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
          letterSpacing: '-0.02em', margin: 0, color: 'var(--ink)',
        }}>
          {title}
        </h2>

        <p style={{
          fontFamily: 'var(--font-ui)', fontSize: 13.5, lineHeight: 1.6,
          color: 'var(--ink-soft, #565C68)', margin: '10px 0 0',
        }}>
          {body}
        </p>

        {detail && (
          <div style={{
            marginTop: 16, padding: '12px 14px', borderRadius: 12,
            background: 'rgba(24,28,36,.035)',
            fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft, #565C68)',
          }}>
            {detail}
          </div>
        )}

        {/* Confirm first, and labelled with the action. The last thing read
            before pressing should be what pressing does. */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              height: 44, padding: '0 22px', borderRadius: 12, border: 'none',
              background: tone === 'danger' ? '#D2545A' : 'var(--neon, #E8FF66)',
              color: tone === 'danger' ? '#fff' : 'var(--ink)',
              fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 13,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              height: 44, padding: '0 20px', borderRadius: 12,
              background: 'transparent', border: '1px solid var(--hairline, #EAEAE3)',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--ink)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}
