/**
 * What we are asking a creator to do, in one list.
 *
 * ── Why this is data and not markup ─────────────────────────────────────────
 * The same list is read by the dashboard card and by anything that later wants
 * to count outstanding work. It had been markup — five hand-written rows in
 * CreatorDashboardEmpty and five more in CreatorDashboardEmptyDesktop, each
 * with its own copy of what "done" meant. That is how "Connect your socials"
 * came to be satisfied by TYPING a handle while promising analytics that only
 * a real Instagram connection can deliver.
 *
 * ── Two kinds, one surface ──────────────────────────────────────────────────
 * 'setup' is what a creator must do before the product works for them; it is
 * finite and it finishes. 'recommended' is everything we suggest afterwards,
 * and it never finishes — which is why the surface is not called "Get started"
 * forever. When no setup task is outstanding the card becomes "Recommended",
 * and a future suggestion is one entry added here rather than a new component.
 *
 * Client-safe on purpose: the card that renders it is a client component, and
 * the state it reads is computed on the server and passed down.
 */

export type TaskKind = 'setup' | 'recommended'

/** How a task is completed from the card itself, when it can be. */
export type TaskAction = 'link' | 'email'

export interface CreatorTask {
  key: string
  kind: TaskKind
  title: string
  subtitle: string
  href: string
  done: boolean
  action: TaskAction
}

/**
 * Everything the list needs to know, resolved server-side.
 *
 * `hasInstagram` is a real connection, not a typed handle — a broken one still
 * counts, because a fault is InstagramReconnectBanner's job and asking twice is
 * what this card exists to stop. `hasEmail` is an address we could actually
 * send to — see lib/creator-contact.
 */
export interface CreatorTaskState {
  hasInstagram: boolean
  hasEmail: boolean
  hasPackages: boolean
  hasShopfront: boolean
  hasShopfrontPublished: boolean
  hasPayout: boolean
  /** Growth creators have no public storefront, so the two shopfront rows are
   *  not tasks they can complete — they are a progress bar that never fills. */
  isGrowth?: boolean
}

export function creatorTasks(s: CreatorTaskState): CreatorTask[] {
  const instagram: CreatorTask = {
    key: 'instagram',
    kind: 'setup',
    title: 'Connect Instagram',
    // The old row said "connect your socials" and counted a typed handle. It
    // promised analytics, which a string cannot give. This is the same
    // promise, against the thing that keeps it.
    subtitle: 'Show followers, reach and audience verified straight from Instagram',
    href: '/creator/settings',
    done: s.hasInstagram,
    action: 'link',
  }

  const email: CreatorTask = {
    key: 'email',
    kind: 'setup',
    title: 'Add your email',
    subtitle: 'So we can reach you about offers and payments, not just on WhatsApp',
    href: '/creator/settings?tab=profile',
    done: s.hasEmail,
    // Answered in place: this is one short field, and the nav hop to Settings
    // is why the column sat empty for 16 of 19 creators.
    action: 'email',
  }

  const packages: CreatorTask = {
    key: 'packages',
    kind: 'setup',
    title: 'Set your packages',
    subtitle: 'What you offer and what it costs, so brands can send a real brief',
    href: '/creator/packages?from=dashboard',
    done: s.hasPackages,
    action: 'link',
  }

  const payout: CreatorTask = {
    key: 'payout',
    kind: 'setup',
    title: 'Add a payment method',
    subtitle: 'So we can pay you when a deal completes',
    href: '/creator/payments?from=dashboard',
    done: s.hasPayout,
    action: 'link',
  }

  /* ── Growth: a shorter list, in a different order ────────────────────────
     The two shopfront rows are gone, because a Growth creator cannot complete
     them — the page is locked and the server action refuses. Left in, they
     would hold the setup list permanently incomplete: "Get started" would
     never become "Recommended" and the progress bar would never reach 100%.

     PACKAGES leads. It is the hard requirement to be bookable — a brand cannot
     send an offer to someone with no price on anything — so it outranks
     Instagram, which is the credibility step that decides whether a brand
     picks you once they already can. */
  if (s.isGrowth) return [packages, instagram, email, payout]

  return [
    instagram,
    email,
    packages,
    payout,
    {
      key: 'shopfront',
      kind: 'setup',
      title: 'Set up your shopfront',
      subtitle: 'Give brands a page to buy from',
      href: '/creator/storefront',
      done: s.hasShopfront,
      action: 'link',
    },
    {
      // The first real recommendation, and the reason the second mode is not
      // theoretical: a shopfront that exists but is unpublished is invisible to
      // brands, which is a thing worth saying once setup is behind them.
      key: 'publish-shopfront',
      kind: 'recommended',
      title: 'Publish your shopfront',
      subtitle: 'It is built but not live, so brands cannot open it yet',
      href: '/creator/storefront',
      done: !s.hasShopfront || s.hasShopfrontPublished,
      action: 'link',
    },
  ]
}

export interface TaskProgress {
  /** Setup tasks only — recommendations are not progress toward anything. */
  setupTotal: number
  setupDone: number
  pct: number
  setupComplete: boolean
  /** What the card shows: outstanding setup, or outstanding recommendations. */
  visible: CreatorTask[]
  /** Nothing to say. The card renders nothing at all. */
  empty: boolean
}

export function taskProgress(tasks: CreatorTask[]): TaskProgress {
  const setup = tasks.filter((t) => t.kind === 'setup')
  const setupDone = setup.filter((t) => t.done).length
  const setupComplete = setupDone === setup.length

  // Before setup is finished the card shows the setup list INCLUDING the ticks,
  // because the progress bar is only legible next to what it measures.
  // Afterwards it shows outstanding recommendations only — a recommendation
  // already taken is not a recommendation.
  const visible = setupComplete
    ? tasks.filter((t) => t.kind === 'recommended' && !t.done)
    : setup

  return {
    setupTotal: setup.length,
    setupDone,
    pct: setup.length === 0 ? 100 : Math.round((setupDone / setup.length) * 100),
    setupComplete,
    visible,
    empty: visible.length === 0,
  }
}

/** The card's heading. Two modes, one surface. */
export function taskHeading(p: TaskProgress): string {
  return p.setupComplete ? 'Recommended' : 'Get started'
}
