'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { GROWTH_QUESTIONS } from '@/lib/growth-quiz-labels'
import { saveGrowthQuiz } from './actions'
// Deliberately the Deals flow's stylesheet, not growth.css. These questions ARE
// that flow, asked of a different creator, and a second set of near-identical
// styles would drift apart the first time either is touched.
import '../welcome/welcome.css'
import './growth.css'

/**
 * The Guapd Growth quiz, one screen at a time, over the Growth dashboard.
 *
 * Same construction as the Deals welcome flow (WelcomeQuestions), for the same
 * reasons:
 *
 *   A MODAL, not its own route. A page under /creator inherits the app shell,
 *   so the questions would arrive under navigation the creator cannot use yet.
 *   Over the dashboard, the thing they were just approved for is visible behind
 *   the thing being asked.
 *
 *   PORTALLED to <body>. The creator layout paints pages inside a z-index:1
 *   stacking context whose sibling is the tab bar at 10000, so anything rendered
 *   in place lands underneath the navigation this needs to cover.
 *
 *   NON-DISMISSABLE. No close control, Escape does nothing, the scrim ignores
 *   clicks. The three coded answers are required, and a dismissable required
 *   form is one people dismiss.
 *
 * The closing note is optional and is always ready to submit.
 */
export default function GrowthQuiz({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [other, setOther] = useState('')
  const [anythingElse, setAnythingElse] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const q = GROWTH_QUESTIONS[step]
  const onNote = q?.kind === 'text'
  const chosen = q ? answers[q.key] : undefined
  const isLast = step === GROWTH_QUESTIONS.length - 1
  const coded = GROWTH_QUESTIONS.filter(x => x.kind !== 'text').length

  // document.body does not exist during the server render.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Freezes the page behind and hides the tab bar while this is up. Undone on
  // unmount, so finishing the quiz cannot leave the app without navigation.
  useEffect(() => {
    document.body.classList.add('wq-modal-open')
    return () => document.body.classList.remove('wq-modal-open')
  }, [])

  // The note is optional, so it never blocks. Every coded question does.
  const canContinue = onNote || Boolean(chosen)

  async function submit() {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await saveGrowthQuiz({
      postingFrequency: answers.posting_frequency,
      growthGoal: answers.growth_goal,
      niche: answers.niche,
      nicheOther: other,
      anythingElse,
    })
    if (!res.ok) { setBusy(false); setError(res.message); return }
    // Stays busy: onDone unmounts this, and re-enabling the button first would
    // let a fast second tap fire a duplicate insert.
    onDone()
  }

  if (!mounted) return null

  return createPortal(
    <div className="wq-scrim" role="dialog" aria-modal="true" aria-label="A few quick questions">
      <div className="wq-stage">
        {/* NO key on the step. Keying here remounts the card on every answer, so
            the entrance animation replays and it reads as a flash between
            questions. The card is one continuous object; its contents change. */}
        <div className="wq-panel">
          <div className="wq-progress">
            <div className="wq-progress__bar">
              <div
                className="wq-progress__fill"
                style={{ width: `${((step + 1) / GROWTH_QUESTIONS.length) * 100}%` }}
              />
            </div>
            <span className="wq-progress__label">
              {onNote ? 'Last one' : `Question ${step + 1} of ${coded}`}
            </span>
          </div>

          <h2 className="wq-ask">{q.prompt}</h2>
          {q.sub && <p className="wq-ask__sub">{q.sub}</p>}

          {onNote ? (
            <textarea
              className="wq-textarea"
              value={anythingElse}
              maxLength={500}
              rows={4}
              onChange={e => setAnythingElse(e.target.value)}
              placeholder={q.placeholder}
              autoFocus
            />
          ) : (
            <>
              <div className="wq-options" role="group" aria-label={q.prompt}>
                {q.options.map(o => (
                  <button
                    key={o.code}
                    type="button"
                    className="wq-option"
                    aria-pressed={chosen === o.code}
                    // Deliberately does NOT advance. Auto-advancing on select
                    // means a mis-tap moves the screen before it can be
                    // corrected, and the "Other" box would be gone before it
                    // could be typed in.
                    onClick={() => { setAnswers(a => ({ ...a, [q.key]: o.code })); setError('') }}
                  >
                    <span className="wq-mark" aria-hidden="true">
                      {chosen === o.code && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--lime-950, #161B08)"
                             strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="wq-option__label">{o.label}</span>
                  </button>
                ))}
              </div>

              {q.otherCode && chosen === q.otherCode && (
                <div className="wq-follow">
                  <label className="wq-follow__label" htmlFor="gr-other">
                    {q.otherPrompt} <span className="wq-optional">optional</span>
                  </label>
                  <input
                    id="gr-other"
                    className="wq-textarea"
                    value={other}
                    maxLength={120}
                    onChange={e => setOther(e.target.value)}
                    placeholder="e.g. Travel, parenting, gaming"
                  />
                </div>
              )}
            </>
          )}

          {error && <p role="alert" className="wq-error">{error}</p>}
        </div>

        {/* Pinned to the bottom of a phone screen, inline on desktop. The tab bar
            is hidden for as long as this is up, so the bar has the bottom of the
            viewport to itself. */}
        <div className="wq-actions">
          {step > 0 && (
            <button type="button" className="wq-back" onClick={() => { setStep(s => s - 1); setError('') }} disabled={busy}>
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
            onClick={() => (isLast ? submit() : setStep(s => s + 1))}
          >
            {busy ? 'Saving…' : isLast ? 'Finish' : 'Continue'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
