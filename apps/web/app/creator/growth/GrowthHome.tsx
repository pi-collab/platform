'use client'

import { useState } from 'react'
import { GROWTH_QUESTIONS } from '@/lib/growth-quiz-labels'
import { saveGrowthQuiz } from './actions'
import './growth.css'

/**
 * Guapd Growth: the holding page, and the quiz that runs once.
 *
 * Growth is a POSITIVE outcome and the copy has to carry that on its own —
 * a creator arriving here was not rejected, and nothing on this page should
 * read as consolation. There is no appeal box, because there is no decision to
 * appeal.
 *
 * The quiz reuses the welcome-questions shape: one question per screen, a
 * sticky action on a phone, and a progress bar — so it reads as the same
 * product a creator has already been through rather than a form bolted on.
 */
export interface GrowthProfile {
  fullName: string
  phone: string | null
  photoUrl: string | null
  channels: { platform: string; handle: string }[]
}

export default function GrowthHome({ firstName, quizDone, profile }: {
  firstName: string
  quizDone: boolean
  profile: GrowthProfile
}) {
  const [tab, setTab] = useState<'dashboard' | 'profile'>('dashboard')
  const [done, setDone] = useState(quizDone)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const q = GROWTH_QUESTIONS[step]
  const chosen = answers[q?.key ?? '']
  const isLast = step === GROWTH_QUESTIONS.length - 1
  const canAdvance = Boolean(chosen)

  async function next() {
    if (!isLast) { setStep(step + 1); return }
    setBusy(true); setError('')
    const res = await saveGrowthQuiz({
      followerBand: answers.follower_band,
      growthGoal: answers.growth_goal,
      niche: answers.niche,
      nicheOther: other,
    })
    setBusy(false)
    if (!res.ok) { setError(res.message); return }
    setDone(true)
  }

  return (
    <main className="gr-page">
      <div className="gr-shell">
        <span className="gr-badge">Guapd Growth</span>

        <h1 className="gr-title">
          You&rsquo;re in Guapd Growth, {firstName}
        </h1>

        {/* NOT "coming soon" here. This sits above the quiz, and telling someone
            the thing is not ready is an invitation to skip the questions that
            decide what gets built. The waiting message belongs after they have
            answered, not before. */}
        <p className="gr-lede">
          {done
            ? 'A track for creators building towards their first brand deals.'
            : 'A track for creators building towards their first brand deals. Three quick questions and you\u2019re set.'}
        </p>

        {tab === 'profile' ? (
          <div className="gr-card">
            <div className="gr-prof">
              <div className="gr-avatar" aria-hidden="true">
                {profile.photoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={profile.photoUrl} alt="" />
                  : <span>{(profile.fullName || 'C').charAt(0).toUpperCase()}</span>}
              </div>
              <div>
                <p className="gr-prof-name">{profile.fullName || 'Your profile'}</p>
                {profile.phone && <p className="gr-prof-meta">{profile.phone}</p>}
              </div>
            </div>

            {profile.channels.length > 0 && (
              <div className="gr-chan">
                <span className="gr-chan-label">Channels</span>
                {profile.channels.map(c => (
                  <div key={`${c.platform}/${c.handle}`} className="gr-chan-row">
                    <span className="gr-chan-plat">{c.platform}</span>
                    <span className="gr-chan-handle">@{c.handle.replace(/^@/, '')}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="gr-prof-note">
              You&rsquo;ll be able to edit your profile here once Growth opens up.
            </p>
          </div>
        ) : done ? (
          /* The waiting message lives HERE and nowhere else — after the quiz is
             answered. Saying it earlier costs us the answers. */
          <div className="gr-card gr-card--done">
            <div className="gr-check" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <div>
              <p className="gr-done-title">Coming soon</p>
              <p className="gr-done-body">
                Thanks &mdash; that&rsquo;s all we need for now. We&rsquo;re building the Growth tools:
                ways to grow your following, learn how brand collaborations work, and get ready for your
                first deals. Your answers shape what we build first, and we&rsquo;ll let you know the
                moment there&rsquo;s something here for you.
              </p>
            </div>
          </div>
        ) : (
          <div className="gr-card">
            <div className="gr-progress">
              <div className="gr-progress__bar">
                <div
                  className="gr-progress__fill"
                  style={{ width: `${Math.round(((step + 1) / GROWTH_QUESTIONS.length) * 100)}%` }}
                />
              </div>
              <span className="gr-progress__label">
                {step + 1} of {GROWTH_QUESTIONS.length}
              </span>
            </div>

            <h2 className="gr-ask">{q.prompt}</h2>

            <div className="gr-options">
              {q.options.map(o => (
                <button
                  key={o.code}
                  type="button"
                  className="gr-option"
                  aria-pressed={chosen === o.code}
                  onClick={() => setAnswers(a => ({ ...a, [q.key]: o.code }))}
                >
                  <span className="gr-mark" aria-hidden="true">
                    {chosen === o.code && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    )}
                  </span>
                  <span className="gr-option__label">{o.label}</span>
                </button>
              ))}
            </div>

            {q.otherCode && chosen === q.otherCode && (
              <div className="gr-follow">
                <label className="gr-follow__label" htmlFor="gr-other">
                  {q.otherPrompt} <span className="gr-optional">(optional)</span>
                </label>
                <input
                  id="gr-other"
                  className="gr-input"
                  value={other}
                  maxLength={120}
                  onChange={e => setOther(e.target.value)}
                  placeholder="e.g. Travel, parenting, gaming"
                />
              </div>
            )}

            {error && <p className="gr-error" role="alert">{error}</p>}

            <div className="gr-actions">
              {step > 0 && (
                <button type="button" className="gr-back" onClick={() => setStep(step - 1)} disabled={busy}>
                  Back
                </button>
              )}
              <button
                type="button"
                className="gr-next"
                onClick={next}
                disabled={!canAdvance || busy}
              >
                {busy ? 'Saving…' : isLast ? 'Finish' : 'Continue'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Two tabs only. A Growth creator has no Deals, Payments or Shopfront, and
          offering them would be three links that bounce back to this page. */}
      <nav className="gr-tabs" aria-label="Growth">
        <button
          type="button"
          className="gr-tab"
          aria-current={tab === 'dashboard' ? 'page' : undefined}
          onClick={() => setTab('dashboard')}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
          <span>Dashboard</span>
        </button>
        <button
          type="button"
          className="gr-tab"
          aria-current={tab === 'profile' ? 'page' : undefined}
          onClick={() => setTab('profile')}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          <span>Profile</span>
        </button>
      </nav>
    </main>
  )
}
