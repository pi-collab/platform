'use client'

import { useState } from 'react'
import SignOutButton from '@/components/SignOutButton'
import GrowthQuiz from './GrowthQuiz'
import './growth.css'

/**
 * Guapd Growth: the holding page, and the quiz that runs once.
 *
 * Growth is a POSITIVE outcome and the copy has to carry that on its own —
 * a creator arriving here was not rejected, and nothing on this page should
 * read as consolation. There is no appeal box, because there is no decision to
 * appeal.
 *
 * The quiz itself is GrowthQuiz: a non-dismissable modal OVER this page,
 * built from the Deals welcome flow's stylesheet so a creator meets the same
 * product they have already been through. This page is what is behind it, and
 * what they get once it is answered.
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

  return (
    <main className="gr-page">
      <div className="gr-shell">
        <span className="gr-badge">Guapd Growth</span>

        {/* Two headers, because this page is two moments. On arrival it carries
            the news; once the quiz is answered it is a dashboard, and a dashboard
            that re-announces the decision every visit reads like a holding pen.
            The greeting is the Deals dashboard's, deliberately: same app. */}
        <h1 className="gr-title">
          {done
            ? <>Hey, <span className="gr-name">{firstName}</span></>
            : <>You&rsquo;ve been approved for Guapd Growth</>}
        </h1>

        {/* NOT "coming soon" here. This sits above the quiz, and telling someone
            the thing is not ready is an invitation to skip the questions that
            decide what gets built. The waiting message belongs after they have
            answered, not before. */}
        {!done && (
          <p className="gr-lede">
            Your track for growing your audience, with brand deals on the way. A few quick
            questions and you&rsquo;re set.
          </p>
        )}

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
              You&rsquo;ll be able to edit your profile here once Guapd Growth opens up.
            </p>

            {/* To /login/creator, not the brand page. The default sent creators
                to brand sign-in, which then offered to set up a brand for them. */}
            <div className="gr-signout">
              <SignOutButton
                redirectTo="/login/creator"
                className="gr-signout-btn"
                label="Sign out"
              />
            </div>
          </div>
        ) : done ? (
          /* The waiting message lives HERE and nowhere else — after the quiz is
             answered. Saying it earlier costs us the answers. */
          <>
            <div className="gr-card gr-card--done">
              <div className="gr-check" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <div>
                <p className="gr-done-title">Something exciting coming soon</p>
                <p className="gr-done-body">
                  We&rsquo;re lining up the best brand deals for creators like you, and the tools to
                  grow your audience alongside them. Your answers shape what we do first, and
                  we&rsquo;ll let you know the moment it&rsquo;s ready.
                </p>
              </div>
            </div>

            {/* The two tiers, so where a creator stands is legible without having
                to infer it from what the app is missing. Deals is LOCKED rather
                than hidden: knowing it exists and how to reach it is the point. */}
            <div className="gr-tiers">
              <p className="gr-tiers__label">Your tier</p>

              <div className="gr-tier gr-tier--current">
                <div className="gr-tier__head">
                  <span className="gr-tier__name">Guapd Growth</span>
                  <span className="gr-tier__pill gr-tier__pill--soon">Coming soon</span>
                </div>
                <p className="gr-tier__body">
                  Where you are now. Tools to grow your audience, and brand deals suited to where
                  you are, coming your way soon.
                </p>
              </div>

              <div className="gr-tier gr-tier--locked">
                <div className="gr-tier__head">
                  <span className="gr-tier__name">
                    <svg className="gr-tier__lock" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Guapd Deals
                  </span>
                  <span className="gr-tier__pill gr-tier__pill--locked">Locked</span>
                </div>
                {/* NOT "send and receive offers": a creator does not send
                    offers, brands do. What this tier gives them is running the
                    deal itself, directly, in one place. */}
                <p className="gr-tier__body">
                  For creators working with brands regularly. One place to run every deal directly
                  with the brand, from the offer through to getting paid. Opens up for you as you
                  grow.
                </p>
              </div>
            </div>
          </>
        ) : (
          /* Nothing behind the quiz but the welcome. The tiers and the
             "Coming soon" card stay out until the answers are in: saying the
             tools are unbuilt is an invitation to skip the questions that
             decide what gets built. */
          null
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

      {/* Over the dashboard, not instead of it, and not on its own route: the
          same construction as the Deals welcome flow. Unmounts on completion,
          which is when the dashboard becomes reachable. */}
      {!done && <GrowthQuiz onDone={() => setDone(true)} />}
    </main>
  )
}
