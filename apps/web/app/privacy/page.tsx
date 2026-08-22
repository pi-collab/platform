import type { Metadata } from 'next'
import MarketingNav from '@/components/MarketingNav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  // Title carries no brand name: the root layout's template appends
  // "| Guapd", and spelling it here too rendered "Privacy Policy · Guapd | Guapd".
  title: 'Privacy Policy',
  description:
    "How Guapd collects, uses and protects personal data, and the rights you have over it under India's DPDP Act.",
  robots: 'index, follow',
  // Its own canonical. Without one it inherited the layout's, which
  // pointed at the home page and declared this a duplicate of it.
  alternates: { canonical: '/privacy' },
}

const containerStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  // No nav-height reservation: MarketingNav is position:sticky, so it occupies
  // flow space rather than sitting over the page. The old Nav was fixed, which
  // is what made the reservation necessary and, when it was too small, clipped
  // the heading.
  padding: 'clamp(40px,6vw,72px) clamp(20px,5vw,28px) clamp(64px,8vw,104px)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--ink-soft)',
  lineHeight: 1.75,
}

const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(32px,4.4vw,44px)',
  fontWeight: 700,
  letterSpacing: '-0.03em',
  lineHeight: 1.08,
  color: 'var(--ink)',
  margin: '0 0 10px',
}

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(19px,2.2vw,22px)',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  lineHeight: 1.25,
  color: 'var(--ink)',
  margin: '44px 0 12px',
}

const pStyle: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: '15.5px',
  lineHeight: 1.75,
  color: 'var(--ink-soft)',
}

const metaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
  // A rule under the meta line separates the document from its title the way
  // the marketing pages separate a section from its heading.
  margin: '0 0 40px',
  paddingBottom: '20px',
  borderBottom: '1px solid var(--hairline, rgba(24,28,36,.12))',
}

const ulStyle: React.CSSProperties = {
  margin: '0 0 1rem',
  paddingLeft: '1.25rem',
  fontSize: '0.9375rem',
}

const liStyle: React.CSSProperties = {
  margin: '0 0 0.5rem',
}

export default function PrivacyPolicyPage() {
  return (
    <>
      <MarketingNav audience="home" />
      <main style={containerStyle}>
        <h1 style={h1Style}>Privacy Policy</h1>
        <p style={metaStyle}>Last updated: 23 July 2026</p>

        <p style={pStyle}>
          GUAPD PRIVATE LIMITED (&ldquo;Guap&rsquo;d&rdquo;, &ldquo;we&rdquo;).
          Registered office: Plot No 307, Kh. No. 137/9, 1st Floor, Ishwar Colony,
          Bawana, Delhi, North West Delhi &ndash; 110039, Delhi, India.
        </p>
        <p style={pStyle}>
          Grievance Officer / Data protection contact: Palak Jain &mdash;{' '}
          <a href="mailto:contact@guapd.com">contact@guapd.com</a>
        </p>
        <p style={pStyle}>
          Support: <a href="mailto:help@guapd.com">help@guapd.com</a>
        </p>
        <p style={pStyle}>
          This policy is framed under India&rsquo;s Digital Personal Data Protection
          Act, 2023. We are the Data Fiduciary.
        </p>

        {/* What we collect */}
        <h2 style={h2Style}>What we collect</h2>
        <p style={pStyle}>
          <strong>Creators:</strong> name, phone number (used for OTP login), email,
          Instagram/YouTube handles and profile links, self-reported audience
          statistics, rate card and pricing, profile photo, content samples uploaded
          to the platform, PAN (optional &mdash; required only for tax-compliant
          payouts and TDS), deal history, messages sent through the platform, uploaded
          deliverable files.
        </p>
        <p style={pStyle}>
          <strong>Brands:</strong> name, work email, company name, GSTIN (optional
          &mdash; required only to issue a GST-compliant invoice), team member names
          and emails, deal history, messages, payment status records, subscription
          plan, billing history and invoices.
        </p>
        <p style={pStyle}>
          <strong>Anonymous visitors to a creator&rsquo;s shopfront:</strong> if you
          begin an offer and choose to sign up, the details you entered are carried
          into your new account. We do not store anything you type before you create
          an account.
        </p>
        <p style={pStyle}>
          <strong>Automatically:</strong> IP address, device and browser information,
          pages viewed, and product analytics events (see Cookies).
        </p>
        <p style={pStyle}>
          <strong>We do not collect or store:</strong> card numbers, bank account
          details, or UPI IDs. All payment instruments are handled by our payment
          processor and never reach our systems.
        </p>

        {/* Why we collect it */}
        <h2 style={h2Style}>Why we collect it</h2>
        <p style={pStyle}>
          Operating the deal workflow; verifying identity and vetting creators;
          sending notifications about your deals over WhatsApp, email and push;
          generating invoices and meeting tax obligations; managing subscriptions and
          billing; maintaining an audit record of every change to a deal so that
          disputes can be resolved fairly; improving the product; security and fraud
          prevention; complying with law.
        </p>

        {/* Legal basis */}
        <h2 style={h2Style}>Legal basis</h2>
        <p style={pStyle}>
          We process personal data on the basis of your consent, given when you create
          an account and when you take specific actions (publishing a storefront,
          sending an offer), and for legitimate uses permitted under the DPDP Act
          &mdash; including performing our contract with you and complying with legal
          obligations.
        </p>

        {/* Public information */}
        <h2 style={h2Style}>Public information</h2>
        <p style={pStyle}>
          If a creator publishes a storefront, the information on that page &mdash;
          name, photo, handle, bio, categories, self-reported statistics, and (if the
          creator enables it) rates and past brand collaborations &mdash; becomes
          publicly visible to anyone with the link. Publishing is off by default and
          entirely the creator&rsquo;s choice. A brand&rsquo;s name appears on a
          creator&rsquo;s storefront only if that brand has separately opted in to
          public attribution. Creators can unpublish at any time, though pages already
          viewed or cached elsewhere may persist outside our control.
        </p>

        {/* Who we share it with */}
        <h2 style={h2Style}>Who we share it with</h2>
        <ul style={ulStyle}>
          <li style={liStyle}>
            <strong>Supabase</strong> &mdash; database, authentication, file storage.
            Data hosted in Mumbai, India.
          </li>
          <li style={liStyle}>
            <strong>Vercel</strong> &mdash; application hosting and delivery.
          </li>
          <li style={liStyle}>
            <strong>Razorpay</strong> &mdash; payment and subscription processing.
          </li>
          <li style={liStyle}>
            <strong>Interakt / WhatsApp Business API (Meta)</strong> &mdash; deal
            notifications sent to your phone number.
          </li>
          <li style={liStyle}>
            <strong>Meta Platforms</strong> &mdash; if you connect an Instagram
            account, to retrieve your own account statistics.
          </li>
          <li style={liStyle}>
            <strong>PostHog</strong> &mdash; product analytics and session replay,
            hosted in the EU (Frankfurt). Only with your consent (see Cookies).
          </li>
          <li style={liStyle}>
            <strong>Professional advisers and authorities</strong> &mdash; where
            required by law, tax, or legal process.
          </li>
        </ul>
        <p style={pStyle}>
          We do not sell personal data. We do not share your data with other users
          except as required to run a deal you are party to, or as published on a
          storefront you have chosen to make public.
        </p>

        {/* Where data is stored */}
        <h2 style={h2Style}>Where data is stored</h2>
        <p style={pStyle}>
          Primarily in India (Mumbai). Some processors listed above may process data
          outside India; where they do, we rely on their contractual safeguards.
          Specifically, if you consent to analytics, PostHog stores that analytics
          and session-replay data in the European Union (Frankfurt).
        </p>

        {/* Retention and deletion */}
        <h2 style={h2Style}>Retention and deletion</h2>
        <p style={pStyle}>
          You may request deletion of your account by emailing{' '}
          <a href="mailto:contact@guapd.com">contact@guapd.com</a>. On deletion we
          remove your profile, storefront, contact details and uploaded content.
        </p>
        <p style={pStyle}>
          <strong>We retain records of completed transactions</strong> &mdash; deal
          terms, invoices, payment status and the associated audit log &mdash; for as
          long as required by tax, accounting and legal obligations, and to resolve
          any dispute between the parties to that deal. This is because a deal is an
          agreement between two people: one party cannot erase the shared record of
          it. Retained records are dissociated from your profile where possible.
        </p>

        {/* Your rights under the DPDP Act */}
        <h2 style={h2Style}>Your rights under the DPDP Act</h2>
        <p style={pStyle}>
          Access a summary of the personal data we hold about you; correct or complete
          inaccurate data; request erasure (subject to the retention terms above);
          nominate another person to exercise these rights in the event of death or
          incapacity; withdraw consent, which will end your ability to use the
          platform; and file a grievance with our Grievance Officer.
        </p>
        <p style={pStyle}>
          To exercise any of these, email{' '}
          <a href="mailto:contact@guapd.com">contact@guapd.com</a>. We will respond
          within the timelines required by law.
        </p>

        {/* Grievance redressal */}
        <h2 style={h2Style}>Grievance redressal</h2>
        <p style={pStyle}>
          Grievance Officer: Palak Jain &mdash;{' '}
          <a href="mailto:contact@guapd.com">contact@guapd.com</a>. If you are not
          satisfied with our response, you may escalate to the Data Protection Board
          of India.
        </p>

        {/* Cookies and analytics */}
        <h2 style={h2Style}>Cookies and analytics</h2>
        <p style={pStyle}>
          We use essential cookies to keep you signed in &mdash; these are required
          for the platform to work and cannot be switched off. With your consent we
          also use PostHog for product analytics, to understand how the platform is
          used and improve it. Analytics cookies are not set until you accept them,
          and you can change your choice at any time using the link in our footer.
        </p>
        <p style={pStyle}>
          If you accept analytics, PostHog also records <strong>session replays</strong>
          &mdash; a reconstruction of how pages were used, such as clicks and
          navigation. What you type is masked: passwords, one-time codes, email and
          phone fields are never captured, and screens showing personal details are
          hidden from recordings. Replays are stored in the EU and are used only to
          diagnose problems and improve the product. Decline analytics and no replay
          is recorded at all.
        </p>

        {/* Children */}
        <h2 style={h2Style}>Children</h2>
        <p style={pStyle}>
          Guapd is not intended for anyone under 18. We do not knowingly process the
          personal data of children.
        </p>

        {/* Security */}
        <h2 style={h2Style}>Security</h2>
        <p style={pStyle}>
          Access to data is restricted by row-level security policies enforced at the
          database layer; uploaded files are stored privately and served only through
          short-lived signed links; payment instruments never touch our systems. No
          system is perfectly secure, and we will notify affected users and the Data
          Protection Board of any personal data breach as required.
        </p>

        {/* Changes */}
        <h2 style={h2Style}>Changes</h2>
        <p style={pStyle}>
          We will update the &ldquo;Last updated&rdquo; date and, for material
          changes, notify you in the product or by email.
        </p>
      </main>
      <Footer />
    </>
  )
}
