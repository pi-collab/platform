import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  // Title carries no brand name: the root layout's template appends
  // "| Guapd", and spelling it here too rendered "Terms of Service · Guapd | Guapd".
  title: 'Terms of Service',
  description:
    "The terms that govern using Guapd to agree, run and get paid for brand and creator collaborations.",
  robots: 'index, follow',
  // Its own canonical. Without one it inherited the layout's, which
  // pointed at the home page and declared this a duplicate of it.
  alternates: { canonical: '/terms' },
}

const containerStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '3rem 1.5rem 4rem',
  fontFamily: 'var(--font-ui, Inter, sans-serif)',
  color: '#222',
  lineHeight: 1.7,
}

const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-display, Sora, sans-serif)',
  fontSize: '2rem',
  fontWeight: 700,
  color: '#111',
  margin: '0 0 0.5rem',
}

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display, Sora, sans-serif)',
  fontSize: '1.25rem',
  fontWeight: 700,
  color: '#111',
  margin: '2rem 0 0.75rem',
}

const pStyle: React.CSSProperties = {
  margin: '0 0 1rem',
  fontSize: '0.9375rem',
}

const metaStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#888',
  margin: '0 0 2rem',
}

const ulStyle: React.CSSProperties = {
  margin: '0 0 1rem',
  paddingLeft: '1.25rem',
  fontSize: '0.9375rem',
}

const liStyle: React.CSSProperties = {
  margin: '0 0 0.5rem',
}

export default function TermsOfServicePage() {
  return (
    <>
      <Nav audience="none" />
      <main style={containerStyle}>
        <h1 style={h1Style}>Terms of Service</h1>
        <p style={metaStyle}>Last updated: 23 July 2026</p>

        <p style={pStyle}>
          GUAPD PRIVATE LIMITED. Registered office: Plot No 307, Kh. No. 137/9,
          1st Floor, Ishwar Colony, Bawana, Delhi, North West Delhi &ndash; 110039,
          Delhi, India.
        </p>
        <p style={pStyle}>
          Contact: <a href="mailto:help@guapd.com">help@guapd.com</a> (support),{' '}
          <a href="mailto:contact@guapd.com">contact@guapd.com</a> (company and
          legal).
        </p>

        {/* 1. What Guapd is */}
        <h2 style={h2Style}>1. What Guapd is</h2>
        <p style={pStyle}>
          Guapd is a workflow platform where brands and creators agree, run and
          complete collaborations. We provide the tools: structured offers,
          negotiation, deliverable review, invoicing and payment tracking.
        </p>

        {/* 2. Intermediary */}
        <h2 style={h2Style}>2. We are an intermediary, not a party to your deal</h2>
        <p style={pStyle}>
          Every deal is a contract between the brand and the creator. Guapd is not a
          party to it. We do not employ creators, do not commission content, do not
          own the content produced, and do not guarantee that either party will
          perform. We are an intermediary under the Information Technology Act, 2000.
        </p>

        {/* 3. Eligibility */}
        <h2 style={h2Style}>3. Eligibility</h2>
        <p style={pStyle}>
          You must be 18 or over and able to enter a contract. Brand accounts must be
          created by someone authorised to bind that business.
        </p>

        {/* 4. Accounts */}
        <h2 style={h2Style}>4. Accounts</h2>
        <p style={pStyle}>
          You are responsible for activity on your account and for keeping your login
          secure. Creators may be subject to vetting before receiving offers; we may
          decline or revoke vetting at our discretion.
        </p>

        {/* 5. The agreed terms of a deal */}
        <h2 style={h2Style}>5. The agreed terms of a deal</h2>
        <p style={pStyle}>
          When a brand and a creator accept terms on Guapd, those recorded terms
          &mdash; deliverables, price, timeline, revision count, usage rights and
          payment terms &mdash; are the agreement between them. The platform maintains
          a timestamped record of that agreement and of every subsequent change.
          Neither party may unilaterally alter a recorded agreement.
        </p>

        {/* 6. Content and rights */}
        <h2 style={h2Style}>6. Content and rights</h2>
        <p style={pStyle}>
          Creators retain ownership of content they produce unless the agreed terms
          transfer or license it. Usage rights, including any boosting or paid-media
          rights and their duration, are whatever the agreed terms say. Brands must
          not use content beyond those rights.
        </p>
        <p style={pStyle}>
          Creators are responsible for complying with advertising law and platform
          rules, including ASCI disclosure requirements for paid promotions. Brands
          are responsible for the accuracy of claims they ask a creator to make.
        </p>

        {/* 7. Platform fees on deals */}
        <h2 style={h2Style}>7. Platform fees on deals</h2>
        <p style={pStyle}>
          Guapd charges a platform fee on each deal. The fee rate applicable to a deal
          is shown on that deal before either party accepts, and is fixed at the time
          the deal is created &mdash; it does not change afterwards, even if our rates
          change later.
        </p>
        <p style={pStyle}>
          Unless the deal states otherwise, the fee is deducted from the amount
          payable to the creator. The brand pays the agreed deal amount; the creator
          receives that amount less the platform fee. Both the gross amount and the
          net amount payable to the creator are shown on the deal before the creator
          accepts.
        </p>
        <p style={pStyle}>
          We may apply different platform fee rates to different brands, creators, or
          deals. The rate that applies to any deal is always the one recorded on that
          deal. We may change our rates for future deals with notice.
        </p>

        {/* 7A. Subscription plans */}
        <h2 style={h2Style}>7A. Subscription plans</h2>
        <p style={pStyle}>
          Guapd offers paid subscription plans for brands. Plans differ in the
          features and deal volumes they include; a free tier is available.
        </p>
        <ul style={ulStyle}>
          <li style={liStyle}>
            <strong>Charges and cycle.</strong> Your plan, price and billing cycle are
            shown at the point of purchase and in your account settings. Subscriptions
            renew automatically at the end of each cycle until cancelled.
          </li>
          <li style={liStyle}>
            <strong>Relationship to platform fees.</strong> Subscription charges are
            separate from and in addition to the platform fee on each deal.
          </li>
          <li style={liStyle}>
            <strong>Price changes.</strong> We will give at least 30 days&rsquo;
            notice before a subscription price change takes effect for you. Your
            current billing cycle is unaffected.
          </li>
          <li style={liStyle}>
            <strong>Cancellation.</strong> You may cancel at any time from your
            account settings. Cancellation takes effect at the end of the current
            billing cycle. We do not provide refunds for a partial cycle unless
            required by law.
          </li>
          <li style={liStyle}>
            <strong>What happens if your subscription ends.</strong> Deals created
            while your subscription was active continue on the terms recorded on those
            deals, including the fee, and you keep access to those deals and their
            records. Plan features &mdash; including any deal volume above the free
            tier &mdash; become unavailable.
          </li>
          <li style={liStyle}>
            <strong>Failed payment.</strong> If a renewal payment fails we may suspend
            plan features after notice and a reasonable opportunity to update payment
            details. Deals already in progress are not cancelled.
          </li>
          <li style={liStyle}>
            <strong>Taxes.</strong> Prices are exclusive of GST unless stated.
            Applicable taxes are added and shown on your invoice.
          </li>
          <li style={liStyle}>
            Subscription payments are processed by our payment processor. Guapd does
            not store card or bank details.
          </li>
        </ul>

        {/* 8. Payments */}
        <h2 style={h2Style}>8. Payments</h2>
        <p style={pStyle}>
          Payments are made by the brand to the creator. Guapd does not hold funds. We
          provide payment links, invoicing and status tracking, but the obligation to
          pay is the brand&rsquo;s and it is owed to the creator. Tax deductions and
          compliance are the responsibility of the parties, though we may provide
          tools to assist.
        </p>

        {/* 9. Disputes between users */}
        <h2 style={h2Style}>9. Disputes between users</h2>
        <p style={pStyle}>
          We are not an arbitrator. If a dispute arises, we will make the recorded
          deal history &mdash; agreed terms, messages, submissions, approvals and
          timestamps &mdash; available to both parties. Resolution is between them.
        </p>

        {/* 10. Acceptable use */}
        <h2 style={h2Style}>10. Acceptable use</h2>
        <p style={pStyle}>
          No unlawful content, no impersonation, no fake or purchased engagement
          statistics, no misuse of another user&rsquo;s data, no attempts to
          circumvent platform security, no scraping. Creators must not publish
          materially false statistics on a storefront. We may suspend accounts for
          breach.
        </p>

        {/* 11. Storefronts */}
        <h2 style={h2Style}>11. Storefronts</h2>
        <p style={pStyle}>
          A creator&rsquo;s storefront is published at the creator&rsquo;s choice and
          the creator is responsible for the accuracy of what appears on it, including
          self-reported statistics. A brand&rsquo;s name appears on a storefront only
          with that brand&rsquo;s separate consent. We may unpublish a storefront that
          breaches these terms.
        </p>

        {/* 12. Availability and liability */}
        <h2 style={h2Style}>12. Availability and liability</h2>
        <p style={pStyle}>
          The platform is provided as-is. We do not guarantee uninterrupted
          availability. To the extent permitted by law, our total liability to you is
          limited to the platform fees you have paid us in the twelve months preceding
          the claim. We are not liable for a counterparty&rsquo;s non-performance,
          non-payment, or the content produced under a deal.
        </p>

        {/* 13. Termination */}
        <h2 style={h2Style}>13. Termination</h2>
        <p style={pStyle}>
          You may close your account at any time. We may suspend or terminate accounts
          for breach of these terms. Completed deal records are retained as set out in
          the Privacy Policy.
        </p>

        {/* 14. Changes */}
        <h2 style={h2Style}>14. Changes</h2>
        <p style={pStyle}>
          We may amend these terms and will notify you. Continued use after notice
          constitutes acceptance. The version applicable to a deal is the one in force
          when the deal was created.
        </p>

        {/* 15. Governing law */}
        <h2 style={h2Style}>15. Governing law</h2>
        <p style={pStyle}>
          These terms are governed by the laws of India. The courts at Delhi have
          exclusive jurisdiction.
        </p>
      </main>
      <Footer />
    </>
  )
}
