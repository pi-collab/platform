'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveContactEmail } from '@/app/creator/dashboard/contact-email-actions'
import { taskHeading, taskProgress, type CreatorTask } from '@/lib/creator-tasks'

/**
 * The one place we ask a creator to do something.
 *
 * ── What it replaced ────────────────────────────────────────────────────────
 * Three systems used to ask: a "Get started" checklist hand-written twice (once
 * in the mobile empty state, once in the desktop one), an Instagram banner that
 * only spoke when a connection BROKE, and an email prompt. They disagreed, and
 * two of them were invisible to most creators.
 *
 * ── Placed, not floated ─────────────────────────────────────────────────────
 * Built once in the dashboard route and passed to each rendering as a slot, so
 * it can sit after the overview and before "Do first" — where a creator reads
 * it as the next thing to do, rather than as a notice stacked above their own
 * name. It carries no outer padding: every layout it lands in has its own.
 *
 * ── Why it renders for everyone, not just the empty state ───────────────────
 * The checklist lived inside the empty-state designs, which render only while
 * `dealsEverCount === 0`. So it vanished at a creator's FIRST deal — taking
 * with it every task they had not finished, for the people furthest into the
 * product. A setup list should disappear when setup is done, not when work
 * arrives.
 *
 * ── Two modes ───────────────────────────────────────────────────────────────
 * "Get started" while any setup task is outstanding, with the progress bar.
 * "Recommended" once setup is behind them, carrying whatever we suggest next.
 * Same card, same place, so a creator learns one surface — and a future
 * recommendation is a line in lib/creator-tasks, not another banner.
 *
 * Renders nothing when there is nothing to say.
 */
export default function CreatorTaskCard({ tasks }: { tasks: CreatorTask[] }) {
  const router = useRouter()
  const p = taskProgress(tasks)

  const [collapsed, setCollapsed] = useState(false)

  // Read after mount: localStorage during render would not match the server's
  // HTML. Worst case the card opens and then folds a frame later, which is the
  // right way round — a task that briefly shows beats one wrongly hidden.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {
      // Blocked site data: it stays open. The card is foldable, not dismissible.
    }
  }, [])

  if (p.empty) return null

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch { /* fine — it reopens next load */ }
  }

  return (
    <section
          style={{
            borderRadius: 16,
            background: 'var(--card, #fff)',
            boxShadow: '0 1px 2px rgba(24,28,36,.05), 0 18px 40px -28px rgba(24,28,36,.28)',
            padding: '18px clamp(16px, 2.4vw, 24px)',
          }}
        >
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer',
              textAlign: 'left', color: 'inherit',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
                textTransform: 'uppercase', color: '#fff', background: 'var(--ink, #181C24)',
                borderRadius: 999, padding: '4px 12px',
              }}>
                {taskHeading(p)}
              </span>
              {/* The count is the honest headline while setup is unfinished;
                  a recommendation list has no denominator to count against. */}
              {!p.setupComplete && (
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700, color: 'var(--wg-500, #6B7280)' }}>
                  {p.setupDone} of {p.setupTotal} done
                </span>
              )}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 style={{ flexShrink: 0, transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform .2s' }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {!collapsed && (
            <>
              {!p.setupComplete && (
                <div
                  role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}
                  aria-label="Setup progress"
                  style={{ marginTop: 14, height: 6, borderRadius: 20, background: 'rgba(24,28,36,.08)', overflow: 'hidden' }}
                >
                  <div style={{ height: '100%', width: `${p.pct}%`, borderRadius: 20, background: 'var(--lime-400, #C9EB3C)', transition: 'width .35s cubic-bezier(.4,0,.2,1)' }} />
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                {p.visible.map((t, i) => (
                  <Row key={t.key} task={t} first={i === 0} onSaved={() => router.refresh()} />
                ))}
              </div>
            </>
          )}
    </section>
  )
}

const COLLAPSE_KEY = 'guapd.creatorTasks.collapsed'

function Row({ task, first, onSaved }: { task: CreatorTask; first: boolean; onSaved: () => void }) {
  const border = first ? undefined : '1px solid var(--hair, rgba(24,28,36,.08))'
  const [emailOpen, setEmailOpen] = useState(false)

  const inner = (
    <>
      <span style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: task.done ? 'rgba(22,101,52,.08)' : 'linear-gradient(135deg,#E9F7F0,#E7F1FC)',
      }}>
        <Icon k={task.key} done={task.done} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink, #181C24)' }}>
          {task.title}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--wg-500, #6B7280)', marginTop: 2 }}>
          {task.subtitle}
        </span>
      </span>
    </>
  )

  /* The email task answers itself rather than sending them to Settings for one
     field. But the input CANNOT share the row with the text: at 180px plus a
     Save button it left about 80px for the title on a phone, so "Add your
     email" came out one word per line and its subtitle broke mid-word.

     So the row looks exactly like every other row — icon, text, pill — and the
     field appears BENEATH it, full width, when the pill is pressed. */
  if (task.action === 'email' && !task.done) {
    return (
      <div style={{ padding: '14px 0', borderTop: border }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {inner}
          <button
            type="button"
            onClick={() => setEmailOpen((v) => !v)}
            aria-expanded={emailOpen}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              minWidth: 92, borderRadius: 999, padding: '9px 16px', flexShrink: 0,
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
              border: 'none', cursor: 'pointer',
              color: emailOpen ? 'var(--ink, #181C24)' : '#fff',
              background: emailOpen ? 'rgba(24,28,36,.06)' : 'var(--ink, #181C24)',
            }}
          >
            {emailOpen ? 'Cancel' : 'Set up'}
          </button>
        </div>
        {emailOpen && (
          <div style={{ marginTop: 12 }}>
            <EmailField onSaved={onSaved} />
          </div>
        )}
      </div>
    )
  }

  return (
    <Link href={task.href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: border, textDecoration: 'none' }}>
      {inner}
      <Pill done={task.done} />
    </Link>
  )
}

function Pill({ done }: { done: boolean }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    minWidth: 92, borderRadius: 999, padding: '9px 16px', flexShrink: 0,
    fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
  } as const

  // "Set up" against something already finished is worse than no checklist at
  // all, so the pill carries the state rather than the instruction.
  return done ? (
    <span style={{ ...base, color: '#166534', background: 'rgba(22,101,52,.08)' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      Done
    </span>
  ) : (
    <span style={{ ...base, color: '#fff', background: 'var(--ink, #181C24)' }}>Set up</span>
  )
}

function EmailField({ onSaved }: { onSaved: () => void }) {
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function submit() {
    if (pending || !email.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await saveContactEmail(email)
      if (!res.ok) {
        setError(res.message ?? 'Something went wrong.')
        return
      }
      // Confirmed here first: the refresh re-runs the server component, which
      // will now mark this task done — so the acknowledgement has to land
      // before the field is taken away.
      setSaved(true)
      setTimeout(onSaved, 1100)
    })
  }

  if (saved) {
    return <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700, color: '#166534', flexShrink: 0 }}>Saved</span>
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(null) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        placeholder="you@email.com"
        aria-label="Your email address"
        style={{
          /* flex:1 with minWidth:0, so it uses the row it now has to itself
             instead of forcing a fixed 180px against the text. */
          flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, fontSize: 14,
          border: error ? '1px solid #D2545A' : '1px solid rgba(24,28,36,.18)',
          background: '#fff', color: 'var(--ink, #181C24)',
        }}
      />
      <button
        type="button" onClick={submit} disabled={pending}
        style={{
          padding: '9px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: 'var(--ink, #181C24)', color: '#fff',
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5, opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      {error && <span style={{ fontSize: 12, fontWeight: 600, color: '#9B3030', width: '100%' }}>{error}</span>}
    </span>
  )
}

/** One glyph per task, so a row is recognisable before it is read. */
function Icon({ k, done }: { k: string; done: boolean }) {
  const stroke = done ? '#166534' : 'var(--ink, #181C24)'
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  if (k === 'instagram') return (
    <svg {...common}><rect width="20" height="20" x="2" y="2" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
  )
  if (k === 'email') return (
    <svg {...common}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></svg>
  )
  if (k === 'packages') return (
    <svg {...common}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.4" /></svg>
  )
  if (k === 'payout') return (
    <svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
  )
  // shopfront and publish-shopfront share the storefront glyph: they are the
  // same object at two stages.
  return <svg {...common}><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-6h6v6" /></svg>
}
