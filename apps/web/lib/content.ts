/**
 * CONTENT CONFIGURATION
 *
 * All marketing copy lives here. To update any text:
 *   - Find the relevant export below and edit the string.
 *   - Search for PLACEHOLDER to find copy that needs real content.
 *   - CTAs link to "#brand-signup" / "#creator-signup" — replace with real URLs when auth is wired.
 *
 * BRAND_NAME is the locked brand name used across the site.
 */

export const BRAND_NAME = 'Guapd'

// ── NAV ────────────────────────────────────────────────────────────────────

export const nav = {
  links: [
    { label: 'For brands',    href: '/brands'   },
    { label: 'For creators',  href: '/creators' },
    { label: 'How it works',  href: '#how-it-works' },
  ],
  login:      { label: 'Log in',          href: '#login'          },
  brandCta:   { label: 'Get early access', href: '#brand-signup'  },
  creatorCta: { label: 'Join as creator',  href: '#creator-signup' },
}

// ── HOME PAGE ───────────────────────────────────────────────────────────────

export const homePage = {
  badge: 'Brand × Creator',
  headline: 'Brand–creator deals without the chaos',
  subheadline:
    'One platform for the whole collaboration — offer, negotiate, deliver, and get paid. No WhatsApp threads, no agency middlemen, no chasing.',

  audienceSplit: {
    brand: {
      emoji:   '🏢',
      label:   "I'm a brand",
      tagline: 'Stop overpaying agencies. Run deals directly, transparently.',
      cta:     'See how brands benefit →',
      href:    '/brands',
    },
    creator: {
      emoji:   '🎬',
      label:   "I'm a creator",
      tagline: 'One inbox for every deal. Get paid on time.',
      cta:     'See how creators benefit →',
      href:    '/creators',
    },
  },

  stats: [
    { value: '₹0',   label: 'Agency cut'           },
    { value: '1',    label: 'Inbox for every deal'  },
    { value: '100%', label: 'Deal transparency'     },
  ],

  problem: {
    eyebrow: 'The problem',
    headline: 'One deal. Seven tools.',
    body: 'A single brand–creator collaboration currently lives across WhatsApp threads, Instagram DMs, email chains, shared Drive folders, bank transfers, and a spreadsheet someone updates manually. Every step is a handoff. Every handoff is a chance for something to go wrong.',
    tools: [
      'WhatsApp',
      'Instagram DMs',
      'Email',
      'Google Drive',
      'Spreadsheets',
      'Bank transfer',
      'Phone calls',
    ],
    solution: 'We put all of it in one deal.',
  },

  howItWorks: {
    id: 'how-it-works',
    eyebrow: 'How it works',
    headline: 'Brief to paid — in one place',
    steps: [
      {
        number: '01',
        title:  'Brand sends a structured offer',
        body:   'Deliverables, rate, timeline, revision count, and payment terms — all in a single structured form. Creator gets a WhatsApp ping.',
      },
      {
        number: '02',
        title:  'Both sides negotiate and agree',
        body:   'Counter, edit, accept. Every move is timestamped. When both sides agree, terms lock on record.',
      },
      {
        number: '03',
        title:  'Creator delivers, brand reviews',
        body:   'Files uploaded in the platform. Brand approves or requests a revision — tracked against the agreed limit.',
      },
      {
        number: '04',
        title:  'Payment tracked to completion',
        body:   'Razorpay payment link sent. Status updates automatically from link sent to paid. No chasing.',
      },
    ],
  },

  bothSides: {
    eyebrow: 'Built for both sides',
    headline: 'One platform, two happy parties',
    brand: {
      label:   'For brands',
      href:    '/brands',
      points: [
        'Stop paying agency markup on every deal',
        'Send structured offers in minutes',
        'Every agreed term is written and locked',
        'Review deliverables in one place',
        'Track payment status automatically',
        'Re-engage past creators in one tap',
      ],
      cta:  'Learn more for brands',
    },
    creator: {
      label:   'For creators',
      href:    '/creators',
      points: [
        'Free for creators — always',
        'One inbox for every brand deal',
        'Terms on record, scope protected',
        'Upload files and track revisions',
        'See payment status in real time',
        'WhatsApp pings for new offers',
      ],
      cta:  'Learn more for creators',
    },
  },

  homeFinalCta: {
    headline:     'The deal platform India\'s creators and brands have been waiting for.',
    brandCta:     { label: 'Get early access', href: '#brand-signup'  },
    creatorCta:   { label: 'Join as a creator', href: '#creator-signup' },
    microcopy:    'Free for creators · No agency required',
  },
}

// ── BRAND PAGE ─────────────────────────────────────────────────────────────

export const brandPage = {
  hero: {
    badge:       'For brands',
    headline:    'Stop overpaying for creator deals',
    subheadline: 'Run every collaboration directly — structured offer to final payment — without an agency taking 20% for work you can do yourself.',
    ctaText:     'Request early access',
    ctaHref:     '#brand-signup',
    microcopy:   'Free to start · No commitment',
  },

  stats: [
    { value: '0%',   label: 'Agency markup'      },
    { value: '100%', label: 'Deal transparency'  },
    { value: '1',    label: 'Place for it all'   },
  ],

  features: [
    {
      label:    'Offers',
      headline: 'Send a structured brief in minutes',
      body:     'Build a precise offer with deliverables, timeline, revision count, usage rights, and payment terms — all in a structured form. No ambiguity, no back-and-forth over WhatsApp to agree on scope.',
      visual:   'offer-builder' as const,
    },
    {
      label:    'Negotiation',
      headline: 'Agree on terms with a full paper trail',
      body:     "Every counter, edit, and acceptance is timestamped and on record. When terms are agreed, they are locked — and both sides have the same written record. No more 'I said this, not that' disputes.",
      visual:   'thread' as const,
      reverse:  true,
    },
    {
      label:    'Payments',
      headline: 'Track payment status without chasing',
      body:     'Send a Razorpay payment link and watch status update automatically — invoiced, link sent, paid. No spreadsheet, no follow-up DM asking "has it gone through?"',
      visual:   'payment' as const,
    },
  ],

  featureGrid: {
    label:    'Everything in one deal',
    headline: 'No more stitching together WhatsApp, email, and Drive',
    cards: [
      { icon: '📋', title: 'Structured briefs',       body: 'Define deliverables, timeline, and revision limits upfront. Both sides see the same terms.' },
      { icon: '🔒', title: 'Agreed terms on record',  body: 'No verbal misunderstandings. Every agreed term is written, locked, and auditable.' },
      { icon: '📁', title: 'Deliverable review',      body: 'Review files in one place. Approve or request a revision — it counts against the agreed limit.' },
      { icon: '💳', title: 'Payment tracking',        body: 'Razorpay link → status updates automatically. Know exactly where your payment is.' },
      { icon: '🔁', title: 'One-tap re-engagement',   body: 'Worked with a creator before? Re-engage in one tap, with previous terms pre-filled.' },
      { icon: '📊', title: 'Full deal timeline',      body: 'Every event logged from offer to payment. Your audit trail, automatically.' },
    ],
  },

  midCta: {
    headline: 'Stop running campaigns over WhatsApp.',
    ctaText:  'Request early access',
    ctaHref:  '#brand-signup',
  },

  // PLACEHOLDER: replace with real testimonials when available
  testimonials: {
    label:    'Why brands are making the switch',
    headline: 'The tools you need to run deals directly',
    cards: [
      {
        quote: 'We were managing three campaigns across WhatsApp, email, and a shared Drive folder. One place for all of it would save hours every week.',
        name:  'Brand manager, fintech startup',
        role:  '', // PLACEHOLDER
      },
      {
        quote: 'Our agency was taking 20% for coordination work we could handle ourselves — if we had the right system.',
        name:  'Growth lead, D2C brand',
        role:  '', // PLACEHOLDER
      },
      {
        quote: 'Payment delays are the single biggest friction in our creator relationships. Knowing exactly where it is would change everything.',
        name:  'Marketing head, BFSI brand',
        role:  '', // PLACEHOLDER
      },
    ],
  },

  finalCta: {
    headline:  'Ready to run deals without the agency?',
    sub:       'Join brands already managing creator campaigns directly.',
    ctaText:   'Request early access',
    ctaHref:   '#brand-signup',
    microcopy: 'Free to start · No agency required',
  },

  mobileCta: {
    ctaText: 'Get early access',
    ctaHref: '#brand-signup',
  },
}

// ── CREATOR PAGE ────────────────────────────────────────────────────────────

export const creatorPage = {
  hero: {
    badge:       'For creators',
    headline:    'One inbox for every brand deal',
    subheadline: 'Stop managing collaborations across DMs, email, and WhatsApp. Accept offers, negotiate terms, upload deliverables, and track payment — all in one place.',
    ctaText:     'Join as a creator',
    ctaHref:     '#creator-signup',
    microcopy:   'Free for creators · Always',
  },

  stats: [
    { value: '₹0',   label: 'Fee for creators'      },
    { value: '1',    label: 'Inbox for all deals'    },
    { value: '100%', label: 'Payment visibility'     },
  ],

  features: [
    {
      label:    'Inbox',
      headline: 'Every deal, one place',
      body:     'No more offers buried in Instagram DMs. Every brand brief arrives as a structured card — deliverables, rate, timeline, all laid out clearly. Accept, counter, or decline in one tap.',
      visual:   'offer-builder' as const,
    },
    {
      label:    'Deliverables',
      headline: 'Upload and get approved without the back-and-forth',
      body:     'Upload your content, track revision requests, and see exactly how many rounds are left. The revision count was in the original terms — no scope creep, no surprises.',
      visual:   'thread' as const,
      reverse:  true,
    },
    {
      label:    'Payment',
      headline: 'Know exactly when you are getting paid',
      body:     'Watch payment status move from link sent to paid in real time. No chasing, no "it has been processed" messages. If it is done, you will see it.',
      visual:   'payment' as const,
    },
  ],

  featureGrid: {
    label:    'Everything you need',
    headline: 'Built so you never miss a deal or a payment',
    cards: [
      { icon: '📥', title: 'Deal inbox',             body: 'All offers in one place — structured, clear, and easy to respond to.' },
      { icon: '✅', title: 'Accept or counter',      body: 'Respond to offers in one tap. Counter on any line item with a reason.' },
      { icon: '📂', title: 'File upload',            body: 'Upload content, track revisions, and stay within agreed scope.' },
      { icon: '💰', title: 'Payment status',         body: 'Watch payment move from pending to paid in real time. No guessing.' },
      { icon: '📄', title: 'Terms on record',        body: 'What you agreed to, always written and on record. No disputes.' },
      { icon: '🔔', title: 'WhatsApp notifications', body: 'Get pinged on WhatsApp when a brand sends you an offer or updates a deal.' },
    ],
  },

  midCta: {
    headline: 'Your next deal should not live in someone\'s DMs.',
    ctaText:  'Join as a creator',
    ctaHref:  '#creator-signup',
  },

  // PLACEHOLDER: replace with real testimonials when available
  testimonials: {
    label:    'Why creators are making the switch',
    headline: 'Designed for how creators actually work',
    cards: [
      {
        quote: 'I have had brands forget what we agreed verbally three times in one campaign. Having written terms would have saved all of it.',
        name:  'Finance creator, 180K followers',
        role:  '', // PLACEHOLDER
      },
      {
        quote: 'The worst part of brand deals is chasing payment. If I could see exactly where it is, I would sleep better.',
        name:  'Tech creator, YouTube + Instagram',
        role:  '', // PLACEHOLDER
      },
      {
        quote: 'I miss offers because they get buried in DMs. An actual inbox for deals would change how I work.',
        name:  'Career creator, 95K Instagram',
        role:  '', // PLACEHOLDER
      },
    ],
  },

  finalCta: {
    headline:  'Your deals, your inbox, your terms.',
    sub:       'Join creators who are done managing collaborations over DMs.',
    ctaText:   'Join as a creator',
    ctaHref:   '#creator-signup',
    microcopy: 'Free for creators · Always',
  },

  mobileCta: {
    ctaText: 'Join as a creator',
    ctaHref: '#creator-signup',
  },
}

// ── FOOTER ─────────────────────────────────────────────────────────────────

export const footer = {
  tagline: 'Brand–creator deals without the chaos.',

  columns: [
    {
      heading: 'Platform',
      links: [
        { label: 'For brands',    href: '/brands'       },
        { label: 'For creators',  href: '/creators'     },
        { label: 'How it works',  href: '#how-it-works' },
      ],
    },
    {
      heading: 'Company',
      links: [
        { label: 'About',    href: '#about'   },
        { label: 'Blog',     href: '#blog'    },
        { label: 'Careers',  href: '#careers' },
      ],
    },
    {
      heading: 'Legal',
      links: [
        { label: 'Privacy policy',   href: '#privacy' },
        { label: 'Terms of service', href: '#terms'   },
      ],
    },
  ],

  social: [
    { label: 'in',  href: '#linkedin'   },
    { label: '𝕏',   href: '#twitter'    },
    { label: 'ig',  href: '#instagram'  },
  ],

  copyright: `© 2026 ${BRAND_NAME}. All rights reserved.`,

  legal: [
    { label: 'Privacy policy',   href: '#privacy' },
    { label: 'Terms of service', href: '#terms'   },
  ],
}
