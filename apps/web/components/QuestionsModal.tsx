'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './questions-modal.css'

export interface QuizOption { code: string; label: string }
export interface QuizQuestion { key: string; prompt: string; options: QuizOption[]; multi?: boolean; hint?: string }

/** What the modal collected, handed to the caller to save in its own shape. */
export interface QuizPayload {
  /** The codes chosen on the multi-select question. */
  multi: string[]
  /** Question key → the one code chosen, for every single-select question. */
  answers: Record<string, string>
  /** The free text under "Something else" on the multi-select question. */
  other: string
  /** The optional note on the last screen. */
  note: string
}

export type QuizSaveResult = { ok: true } | { ok: false; message: string }

/**
 * A short questionnaire, one screen at a time, over a dashboard.
 *
 * Shared by the creator post-approval questions and the brand onboarding
 * questions. Each side wraps it with its own save action and destination; the
 * behaviour below is deliberately identical for both.
 *
 * A modal rather than its own route: a separate page inherits the app nav, so
 * the questions arrived under a header full of destinations that could not be
 * used yet. Over the dashboard, the thing promised is visible behind the thing
 * being asked.
 *
 * Non-dismissable by construction — there is no close control, Escape does
 * nothing, and the scrim ignores clicks. Every question is required, and a
 * dismissable required form is just a form people dismiss.
 *
 * Portalled to <body>: the creator layout renders pages inside a z-index:1
 * stacking context whose SIBLING is the tab bar at z-index 10000, and the brand
 * dashboard renders inside a z-index:1 <main>, so anything rendered in place
 * would be painted underneath the navigation this needs to cover.
 *
 * Definitions arrive as a prop rather than being imported: each side's source
 * is server-only because it also holds the gate.
 *
 * At most ONE question may be multi-select; the free-text follow-up belongs to
 * its "other" option.
 */
export default function QuestionsModal({ questions, onSubmit, doneHref }: {
  questions: QuizQuestion[]
  onSubmit: (payload: QuizPayload) => Promise<QuizSaveResult>
  /** Where to go once saved. The dashboard the modal sits over. */
  doneHref: string
}) {
  const router = useRouter()
  // Steps 0..n-1 are questions; the last step is the optional note.
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // Kept apart from `answers` rather than stringified into it: one question is a
  // set and the others are not, and pretending otherwise means parsing it back
  // out at every use.
  const [multi, setMulti] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const lastStep = questions.length
  const onNote = step === lastStep
  const q = onNote ? null : questions[step]
  const chosen = q ? answers[q.key] : null
  const needsMore = Boolean(q?.multi) && multi.includes('other')

  // document.body does not exist during the server render.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Freezes the page behind and hides the creator tab bar for as long as this
  // is up. Both are undone on unmount, so navigating away cannot leave the app
  // without its navigation.
  useEffect(() => {
    document.body.classList.add('wq-modal-open')
    return () => document.body.classList.remove('wq-modal-open')
  }, [])

  function choose(key: string, code: string, isMulti = false) {
    if (isMulti) {
      // Toggle. Tapping a chosen option again removes it, which is the only
      // way to correct a mis-tap without a Clear control.
      setMulti(m => m.includes(code) ? m.filter(c => c !== code) : [...m, code])
    } else {
      setAnswers(a => ({ ...a, [key]: code }))
    }
    setError('')
    // Deliberately does NOT advance. Auto-advancing on select means a mis-tap
    // moves the screen before it can be corrected, and the follow-up box on
    // "Something else" would be gone before it could be typed in.
  }

  // The note at the end is optional, so it is always ready to submit.
  const canContinue = onNote || (q?.multi ? multi.length > 0 : Boolean(chosen))

  async function submit() {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await onSubmit({ multi, answers, other, note })
    if (!res.ok) { setBusy(false); setError(res.message); return }
    // Stays busy — the page navigates away and unmounts this.
    router.push(doneHref)
    router.refresh()
  }

  if (!mounted) return null

  return createPortal(
    <div className="wq-scrim" role="dialog" aria-modal="true" aria-label="A few quick questions">
    <div className="wq-stage">
      {/* NO key on the step. Keying it here remounts the whole card on every
          answer — React tears down the panel and builds a new one, the entrance
          animation replays, and the result reads as a flash between questions.
          The card is one continuous object; only its contents change. */}
      <div className="wq-panel">
        {/* Progress. A count alone is a number; the bar is what tells someone how
            much of their time this is about to take. */}
        <div className="wq-progress">
          <div className="wq-progress__bar">
            <div
              className="wq-progress__fill"
              style={{ width: `${((step + 1) / (lastStep + 1)) * 100}%` }}
            />
          </div>
          <span className="wq-progress__label">
              {onNote ? 'Last one' : `Question ${step + 1} of ${questions.length}`}
          </span>
        </div>
        {q ? (
          <>
            <h2 className="wq-ask">{q.prompt}</h2>
            {q.hint && <p className="wq-ask__sub">{q.hint}</p>}

            <div className="wq-options" role="group" aria-label={q.prompt}>
              {q.options.map(o => {
                const on = q.multi ? multi.includes(o.code) : chosen === o.code
                return (
                  <button
                    key={o.code}
                    type="button"
                    className="wq-option"
                    aria-pressed={on}
                    onClick={() => choose(q.key, o.code, q.multi)}
                  >
                    <span className={q.multi ? 'wq-mark wq-mark--multi' : 'wq-mark'} aria-hidden="true">
                      {on && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--lime-950, #161B08)"
                             strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="wq-option__label">{o.label}</span>
                  </button>
                )
              })}
            </div>

            {needsMore && (
              <div className="wq-follow">
                <label className="wq-follow__label" htmlFor="quiz-other">
                  What is it? <span className="wq-optional">optional</span>
                </label>
                <textarea
                  id="quiz-other"
                  className="wq-textarea"
                  value={other}
                  onChange={e => setOther(e.target.value)}
                  placeholder="Tell us a little more"
                  maxLength={500}
                  rows={3}
                  autoFocus
                />
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="wq-ask">
              Anything else you&rsquo;d like us to know?
            </h2>
            <p className="wq-ask__sub">Optional, but we read every one of these.</p>
            <textarea
              className="wq-textarea"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Anything at all"
              maxLength={500}
              rows={4}
              autoFocus
            />
          </>
        )}

        {error && <p role="alert" className="wq-error">{error}</p>}
      </div>

      {/* Pinned to the bottom of a phone screen, inline on desktop. The creator
          tab bar is hidden while this is up, so the bar has the bottom of the
          viewport to itself. */}
      <div className="wq-actions">
        {step > 0 && (
          <button type="button" className="wq-back" onClick={() => { setStep(s => s - 1); setError('') }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </button>
        )}

        <button
          type="button"
          className="wq-next"
          disabled={!canContinue || busy}
          onClick={() => (onNote ? submit() : setStep(s => s + 1))}
        >
          {busy ? 'Saving…' : onNote ? 'Start Guapping' : 'Continue'}
        </button>
      </div>
    </div>
    </div>,
    document.body,
  )
}
