import 'server-only'
import { BRAND_NAME } from '@/lib/content'
import { formatPaiseINR } from '@/lib/money'

/**
 * Branded transactional email shell, shared by every brand deal notification.
 *
 * Email HTML is not web HTML. Constraints this deliberately obeys:
 *   - TABLES for layout. Outlook renders flexbox/grid unpredictably.
 *   - INLINE styles only. Gmail strips <style> blocks.
 *   - ~600px max width — the safe column for desktop clients.
 *   - A TEXT wordmark, not an image. There is no logo asset in public/, and
 *     most clients block remote images by default, so an image-based header
 *     would render as a broken box for a large share of recipients.
 *   - A plain-text alternative is always produced. Text-only clients need it
 *     and spam filters penalise HTML-only mail.
 */

/** Safe column width for desktop email clients. */
const WIDTH = 600

const COLORS = {
  ink: '#111111',
  muted: '#6b7280',
  faint: '#9ca3af',
  border: '#e5e7eb',
  pageBg: '#f6f6f4',
  cardBg: '#ffffff',
  button: '#111111',
  buttonText: '#ffffff',
}

export interface DealEmailContent {
  /** Headline, e.g. "Karan Malhotra accepted your offer". */
  heading: string
  /** One or two sentences of context. */
  body: string
  /** Deal name as shown to humans, e.g. "Diwali Reel (GD-1042)". */
  dealLabel: string
  /**
   * Amount in paise, ALREADY resolved to what the BRAND PAYS (gross,
   * inclusive of platform fee) — never the creator's net. Omit where an
   * amount would be noise (declines, deliverable submissions, posts).
   */
  amountPaise?: number
  /** Label for the amount row, e.g. "Deal value" or "Amount due". */
  amountLabel?: string
  /** Absolute URL for the CTA. MUST be a brand route — see buildDealUrl. */
  dealUrl: string
  /** CTA text. Defaults to "View deal". */
  ctaLabel?: string
}

/**
 * Absolute URL of the BRAND deal view.
 *
 * GUARD: brand emails must link to `/deals/{id}`, never `/creator/deals/{id}`.
 * The creator route is gated by verifyCreator() and would bounce a brand user
 * to the creator login — a dead end from an email they were told to act on.
 */
export function buildDealUrl(dealId: string): string {
  return `${siteBase()}/deals/${dealId}`
}

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

/** Bare host for footer copy, e.g. "guapd.com". */
function siteHost(): string {
  return siteBase().replace(/^https?:\/\//, '')
}

/** Escape untrusted text (deal titles, creator names) for HTML contexts. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Render the HTML and plain-text bodies for a brand deal notification. */
export function renderDealEmail(content: DealEmailContent): { html: string; text: string } {
  const {
    heading,
    body,
    dealLabel,
    amountPaise,
    amountLabel = 'Deal value',
    dealUrl,
    ctaLabel = 'View deal',
  } = content

  const amount = typeof amountPaise === 'number' ? formatPaiseINR(amountPaise) : null

  const amountRow = amount
    ? `
          <tr>
            <td style="padding:6px 0;font-size:14px;color:${COLORS.muted};">${esc(amountLabel)}</td>
            <td align="right" style="padding:6px 0;font-size:14px;font-weight:700;color:${COLORS.ink};">${esc(amount)}</td>
          </tr>`
    : ''

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.pageBg};">
  <!-- Preheader: inbox preview text, hidden in the body -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(body)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.pageBg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;">

          <!-- Wordmark (text, not an image — clients block remote images) -->
          <tr>
            <td style="padding:0 0 16px 4px;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${COLORS.ink};">
              ${esc(BRAND_NAME)}
            </td>
          </tr>

          <tr>
            <td style="background:${COLORS.cardBg};border:1px solid ${COLORS.border};border-radius:12px;padding:28px 28px 24px 28px;font-family:Helvetica,Arial,sans-serif;">

              <h1 style="margin:0 0 10px 0;font-size:20px;line-height:1.35;font-weight:700;color:${COLORS.ink};">
                ${esc(heading)}
              </h1>

              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:${COLORS.muted};">
                ${esc(body)}
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.border};border-bottom:1px solid ${COLORS.border};margin:0 0 22px 0;padding:4px 0;">
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:${COLORS.muted};">Deal</td>
                  <td align="right" style="padding:6px 0;font-size:14px;font-weight:600;color:${COLORS.ink};">${esc(dealLabel)}</td>
                </tr>${amountRow}
              </table>

              <!-- CTA: table-wrapped so Outlook renders the block -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${COLORS.button}" style="border-radius:8px;">
                    <a href="${dealUrl}" style="display:inline-block;padding:12px 26px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${COLORS.buttonText};text-decoration:none;border-radius:8px;">
                      ${esc(ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0 0;font-size:12px;line-height:1.5;color:${COLORS.faint};">
                Or paste this into your browser:<br>
                <span style="color:${COLORS.muted};">${dealUrl}</span>
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding:18px 4px 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${COLORS.faint};">
              This is an automated notification — manage this deal in your dashboard at ${esc(siteHost())}.<br>
              You're receiving this because you're a member of this brand on ${esc(BRAND_NAME)}.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    heading,
    '',
    body,
    '',
    `Deal: ${dealLabel}`,
    amount ? `${amountLabel}: ${amount}` : null,
    '',
    `${ctaLabel}: ${dealUrl}`,
    '',
    `This is an automated notification — manage this deal in your dashboard at ${siteHost()}.`,
    `You're receiving this because you're a member of this brand on ${BRAND_NAME}.`,
  ]
    .filter((line) => line !== null)
    .join('\n')

  return { html, text }
}
