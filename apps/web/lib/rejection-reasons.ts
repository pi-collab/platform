/**
 * Why a creator was not approved, in the words they will actually read.
 *
 * ── Two audiences, one list ─────────────────────────────────────────────────
 * `opsLabel` is what the reviewer picks from: short, blunt, scannable under a
 * Reject button. `creatorLine` is what lands in their inbox and on their
 * status screen. Keeping both here means the kind version is the only version
 * that can be sent — there is no free-text box for a reviewer to be curt in at
 * the end of a long vetting session.
 *
 * ── `fixable` is the important flag ─────────────────────────────────────────
 * Some of these are a missing field, not a judgement. Those get a next step
 * and an invitation to come back; the rest get the appeal box and nothing that
 * implies a decision is pending when it is not. Telling someone to "add your
 * handle and reply" when the real answer is "your audience is not who our
 * brands buy" wastes their time and ours.
 */

export interface RejectionReason {
  code: string
  /** Shown to ops in the picker. */
  opsLabel: string
  /** Shown to the creator, in email and on their status screen. */
  creatorLine: string
  /** What they can do about it, when there is something. */
  nextStep?: string
  /** A missing detail they can supply, rather than a decision about them. */
  fixable: boolean
}

export const REJECTION_REASONS: RejectionReason[] = [
  {
    code: 'no_instagram_handle',
    opsLabel: 'No Instagram handle to review',
    creatorLine: 'We could not find an Instagram handle on your profile, so there was nothing for us to review.',
    nextStep: 'Add your Instagram handle to your profile and send us a note below. We will review it properly.',
    fixable: true,
  },
  {
    code: 'handle_not_found',
    opsLabel: 'Handle did not match a real account',
    creatorLine: 'We could not find the Instagram account you gave us. It may have a typo, or be set to private.',
    nextStep: 'Check the handle on your profile and send us a note below with the right one.',
    fixable: true,
  },
  {
    code: 'profile_incomplete',
    opsLabel: 'Profile too incomplete to review',
    creatorLine: 'There was not enough on your profile for us to review it.',
    nextStep: 'Fill in your profile and send us a note below, and we will take another look.',
    fixable: true,
  },
  {
    code: 'account_inactive',
    opsLabel: 'Account not active recently',
    creatorLine: 'Your account has not posted recently enough for brands to book from it.',
    nextStep: 'Come back to us once you are posting regularly again.',
    fixable: true,
  },
  {
    code: 'content_mismatch',
    opsLabel: 'Content not a fit for our brands',
    creatorLine: 'Your content is not a fit for the brands working with us at the moment.',
    fixable: false,
  },
  {
    code: 'audience_concerns',
    opsLabel: 'Audience quality concerns',
    creatorLine: 'We were not able to verify the audience on your account.',
    fixable: false,
  },
  {
    code: 'other',
    opsLabel: 'Other',
    creatorLine: 'We are not able to approve your profile at the moment.',
    fixable: false,
  },
]

export function rejectionReason(code: string | null | undefined): RejectionReason | null {
  if (!code) return null
  return REJECTION_REASONS.find((r) => r.code === code) ?? null
}

/** Valid codes only. A code we do not recognise is stored as nothing rather
 *  than saved and then rendered as a blank sentence to a creator. */
export function isRejectionReason(code: string | null | undefined): boolean {
  return Boolean(code) && REJECTION_REASONS.some((r) => r.code === code)
}
