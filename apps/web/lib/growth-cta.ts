/**
 * What a Growth creator should be pressing next.
 *
 * Every creator surface used to point at "Set up your shopfront", which for a
 * Growth creator is a locked page — their loudest button told them to do the
 * one thing they cannot. This replaces that label and destination, in the same
 * slot, with the thing that actually moves them forward.
 *
 * ── The order is not cosmetic ───────────────────────────────────────────────
 * PACKAGES FIRST. A package is the hard requirement to be bookable: a brand
 * cannot send an offer to someone with no price on anything, so a creator with
 * no packages is invisible in practice no matter how good their numbers are.
 *
 * INSTAGRAM SECOND. It is the credibility step, not the gate — verified reach
 * is what makes a brand choose you once they can buy from you. Putting it first
 * would be asking for the nice-to-have before the necessity.
 *
 * NULL when both are done, so a finished creator is not handed a fourth thing
 * to do. Callers render their own "you are ready" state rather than being
 * given one here, because that copy differs per screen.
 */
export interface GrowthSetupState {
  hasPackages: boolean
  hasInstagram: boolean
}

export interface GrowthCta {
  label: string
  href: string
}

export function growthCta(s: GrowthSetupState): GrowthCta | null {
  if (!s.hasPackages) return { label: 'Set your packages', href: '/creator/packages' }
  if (!s.hasInstagram) return { label: 'Connect Instagram', href: '/creator/settings?tab=connected' }
  return null
}

/** Shown in place of a CTA once there is nothing left to set up. */
export const GROWTH_READY_LINE = 'You’re ready — brands can book you'
