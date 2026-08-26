'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { saveOnboardingAnswers } from './actions'
import './welcome.css'

interface Option { code: string; label: string }
interface Question { key: string; prompt: string; options: Option[]; multi?: boolean; hint?: string }

/**
 * The three questions, one screen at a time, over the dashboard.
 *
 * A modal rather than its own route: a separate page under /creator inherits
 * the app nav, so the questions arrived under a header full of destinations
 * they could not use yet. Over the dashboard, the thing they were promised is
 * visible behind the thing being asked.
 *
 * Non-dismissable by construction — there is no close control, Escape does
 * nothing, and the scrim ignores clicks. All three answers are required, and a
 * dismissable required form is just a form people dismiss.
 *
 * Portalled to <body>: the creator layout renders pages inside a z-index:1
 * stacking context whose SIBLING is the tab bar at z-index 10000, so anything
 * rendered in place would be painted underneath the very navigation this needs
 * to cover.
 *
 * Definitions arrive as a prop rather than being imported: the source is
 * server-only because it also holds the gate, and ops maps the same codes back
 * to labels from the client-safe half.
 */
export default function WelcomeQuestions({ questions }: { questions: Question[] }) {
  const router = useRouter()
  // Steps 0..n-1 are questions; the last step is the optional note.
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // Kept apart from `answers` rather than stringified into it: one question is a
  // set and the others are not, and pretending otherwise means parsing it back
  // out at every use.
  const [pains, setPains] = useState<string[]>([])
  const [painOther, setPainOther] = useState('')
  const [anythingElse, setAnythingElse] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const lastStep = questions.length
  const onNote = step === lastStep
  const q = onNote ? null : questions[step]
  const chosen = q ? answers[q.key] : null
  const needsMore = q?.key === 'biggest_pains' && pains.includes('other')

  // document.body does not exist during the server render.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Freezes the page behind and hides the tab bar for as long as this is up.
  // Both are undone on unmount, so navigating away cannot leave the app without
  // its navigation.
  useEffect(() => {
    document.body.classList.add('wq-modal-open')
    return () => document.body.classList.remove('wq-modal-open')
  }, [])

  function choose(key: string, code: string, multi = false) {
    if (multi) {
      // Toggle. Tapping a chosen option again removes it, which is the only
      // way to correct a mis-tap without a Clear control.
      setPains(p => p.includes(code) ? p.filter(c => c !== code) : [...p, code])
    } else {
      setAnswers(a => ({ ...a, [key]: code }))
    }
    setError('')
    // Deliberately does NOT advance. Auto-advancing on select means a mis-tap
    // moves the screen before it can be corrected, and the follow-up box on
    // "Something else" would be gone before it could be typed in.
  }

  // The note at the end is optional, so it is always ready to submit.
  const canContinue = onNote || (q?.multi ? pains.length > 0 : Boolean(chosen))

  async function submit() {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await saveOnboardingAnswers({
      biggest_pains: pains,
      deal_handling: answers.deal_handling,
      monthly_deals: answers.monthly_deals,
      pain_other: painOther,
      anything_else: anythingElse,
    })
    if (!res.ok) { setBusy(false); setError(res.message); return }
    // Stays busy — the page navigates away and unmounts this.
    router.push('/creator/dashboard')
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
                const on = q.multi ? pains.includes(o.code) : chosen === o.code
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
                <label className="wq-follow__label" htmlFor="pain-other">
                  What is it? <span className="wq-optional">optional</span>
                </label>
                <textarea
                  id="pain-other"
                  className="wq-textarea"
                  value={painOther}
                  onChange={e => setPainOther(e.target.value)}
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
              value={anythingElse}
              onChange={e => setAnythingElse(e.target.value)}
              placeholder="Anything at all"
              maxLength={500}
              rows={4}
              autoFocus
            />
          </>
        )}

        {error && <p role="alert" className="wq-error">{error}</p>}
      </div>

      {/* Pinned to the bottom of a phone screen, inline on desktop. There is no
          tab bar on this route — it sits outside the creator app shell — so the
          bar has the bottom of the viewport to itself. */}
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
