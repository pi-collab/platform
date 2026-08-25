import 'server-only'
import { BRAND_NAME } from '@/lib/content'
import { formatPaiseINR } from '@/lib/money'

/**
 * Branded transactional email shell, shared by every email we send.
 *
 * The three renderers below (deal, account, notice) all go through one shell()
 * — the previous version copied the chrome twice and its own comment warned
 * that a third would mean extracting it. The demo-request emails were that
 * third.
 *
 * ── Design language ────────────────────────────────────────────────────────
 * Matches the marketing site rather than generic transactional grey: Midnight
 * Ink #12151C on a #F5F7FA page, hairline #E5E8EE borders, the 20px rounded
 * white card, and the neon #E8FF66 accent used sparingly as a rule above the
 * wordmark. Buttons are dark with a pill radius, as on the site.
 *
 * ── Email HTML is not web HTML. Constraints this deliberately obeys ────────
 *   - TABLES for layout. Outlook renders flexbox/grid unpredictably.
 *   - INLINE styles only. Gmail strips <style> blocks.
 *   - ~600px max width — the safe column for desktop clients.
 *   - A TEXT wordmark, not an image. Most clients block remote images by
 *     default, so an image header renders as a broken box for many recipients.
 *   - System font stack. Schibsted Grotesk cannot be webfont-loaded reliably in
 *     mail, so the closest widely-available grotesque is used instead.
 *   - A plain-text alternative is ALWAYS produced. Text-only clients need it
 *     and spam filters penalise HTML-only mail.
 */

/** Safe column width for desktop email clients. */
const WIDTH = 600

/** Sampled from the site's own tokens so mail and web read as one product. */
const COLORS = {
  ink: '#12151C',
  muted: '#565C68',
  faint: '#8A9099',
  border: '#E5E8EE',
  pageBg: '#F5F7FA',
  cardBg: '#FFFFFF',
  neon: '#E8FF66',
  button: '#12151C',
  buttonText: '#FFFFFF',
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

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

/** A dark pill button, table-wrapped so Outlook renders the block. */
function button(url: string, label: string): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 0 0;">
                <tr>
                  <td align="center" bgcolor="${COLORS.button}" style="border-radius:999px;">
                    <a href="${url}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:${COLORS.buttonText};text-decoration:none;border-radius:999px;">${esc(label)}</a>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0 0;font-size:12px;line-height:1.5;color:${COLORS.faint};">
                Or paste this into your browser:<br>
                <span style="color:${COLORS.muted};">${url}</span>
              </p>`
}

/** Key/value rows inside a hairline-ruled block. */
function detailRows(rows: [string, string][]): string {
  if (!rows.length) return ''
  const body = rows
    .map(
      ([k, v]) => `
                <tr>
                  <td style="padding:7px 0;font-size:14px;color:${COLORS.muted};">${esc(k)}</td>
                  <td align="right" style="padding:7px 0;font-size:14px;font-weight:600;color:${COLORS.ink};">${esc(v)}</td>
                </tr>`,
    )
    .join('')
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLORS.border};border-bottom:1px solid ${COLORS.border};margin:4px 0 24px 0;padding:4px 0;">${body}
              </table>`
}

/**
 * The shared chrome: page background, neon rule, wordmark, white card, footer.
 * Every email we send is this shell with a different middle.
 */
function shell(opts: { heading: string; preheader: string; inner: string; footer: string }): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.pageBg};">
  <!-- Preheader: inbox preview text, hidden in the body -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.pageBg};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;">

          <!-- Wordmark, with the site's neon as a small accent rule -->
          <tr>
            <td style="padding:0 0 18px 2px;font-family:${FONT};">
              <div style="width:26px;height:3px;background:${COLORS.neon};border-radius:2px;margin-bottom:10px;"></div>
              <span style="font-size:19px;font-weight:700;letter-spacing:-0.03em;color:${COLORS.ink};">${esc(BRAND_NAME.toLowerCase())}</span>
            </td>
          </tr>

          <tr>
            <td style="background:${COLORS.cardBg};border:1px solid ${COLORS.border};border-radius:20px;padding:32px 30px 28px 30px;font-family:${FONT};">
${opts.inner}
            </td>
          </tr>

          <tr>
            <td style="padding:18px 4px 0 4px;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.faint};">
              ${opts.footer}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function h1(text: string): string {
  return `              <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:${COLORS.ink};">${esc(text)}</h1>`
}

/**
 * A body line, optionally set bold.
 *
 * Structural rather than a marker inside the string ("**like this**") because
 * these lines carry text people typed. A marker convention would let an
 * applicant bold their own answer by writing two asterisks, and worse, would
 * mean the escaping had to let SOME markup through.
 */
export type EmailLine = string | { text: string; strong?: boolean }

/** The words alone, for the plain-text part and the preheader. */
function lineText(line: EmailLine): string {
  return typeof line === 'string' ? line : line.text
}

function para(line: EmailLine): string {
  const text = typeof line === 'string' ? line : line.text
  const strong = typeof line === 'string' ? false : line.strong === true
  const weight = strong ? 'font-weight:700;' : ''
  const color = strong ? COLORS.ink : COLORS.muted
  return `              <p style="margin:0 0 ${strong ? '6px' : '16px'} 0;font-size:15px;line-height:1.65;${weight}color:${color};">${esc(text)}</p>`
}

// ── Deal notifications ──────────────────────────────────────────────────────

export interface DealEmailContent {
  heading: string
  body: string
  /** Deal name as shown to humans, e.g. "Diwali Reel (GD-1042)". */
  dealLabel: string
  /**
   * Amount in paise, ALREADY resolved to what the BRAND PAYS (gross, inclusive
   * of platform fee) — never the creator's net. Omit where an amount would be
   * noise (declines, deliverable submissions, posts).
   */
  amountPaise?: number
  amountLabel?: string
  /** Absolute URL for the CTA. MUST be a brand route — see buildDealUrl. */
  dealUrl: string
  ctaLabel?: string
}

export function renderDealEmail(content: DealEmailContent): { html: string; text: string } {
  const {
    heading, body, dealLabel, amountPaise,
    amountLabel = 'Deal value', dealUrl, ctaLabel = 'View deal',
  } = content

  const amount = typeof amountPaise === 'number' ? formatPaiseINR(amountPaise) : null
  const rows: [string, string][] = [['Deal', dealLabel]]
  if (amount) rows.push([amountLabel, amount])

  const html = shell({
    heading,
    preheader: body,
    inner: [h1(heading), para(body), detailRows(rows), button(dealUrl, ctaLabel)].join('\n'),
    footer:
      `This is an automated notification. Manage this deal in your dashboard at ${esc(siteHost())}.<br>` +
      `You&rsquo;re receiving this because you&rsquo;re a member of this brand on ${esc(BRAND_NAME)}.`,
  })

  const text = [
    heading, '', body, '',
    `Deal: ${dealLabel}`,
    amount ? `${amountLabel}: ${amount}` : null,
    '', `${ctaLabel}: ${dealUrl}`, '',
    `This is an automated notification. Manage this deal in your dashboard at ${siteHost()}.`,
    `You're receiving this because you're a member of this brand on ${BRAND_NAME}.`,
  ].filter((l) => l !== null).join('\n')

  return { html, text }
}

// ── Account emails (approvals, rejections) ─────────────────────────────────

export interface AccountEmailContent {
  heading: string
  /** One or more paragraphs. Each renders separately; keep them short. */
  body: EmailLine[]
  ctaUrl?: string
  ctaLabel?: string
  footerNote?: string
}

export function renderAccountEmail(content: AccountEmailContent): { html: string; text: string } {
  const { heading, body, ctaUrl, ctaLabel = 'Open Guapd', footerNote } = content
  const note = footerNote ?? `This is an automated notification from ${BRAND_NAME}.`

  const html = shell({
    heading,
    preheader: lineText(body[0] ?? ''),
    inner: [h1(heading), ...body.map(para), ctaUrl ? button(ctaUrl, ctaLabel) : ''].filter(Boolean).join('\n'),
    footer: `${esc(note)}<br>${esc(siteHost())}`,
  })

  const text = [
    heading, '', ...body.map(lineText),
    ...(ctaUrl ? ['', `${ctaLabel}: ${ctaUrl}`] : []),
    '', note,
  ].join('\n')

  return { html, text }
}

// ── Notices (demo requests, and anything else with optional detail rows) ────

export interface NoticeEmailContent {
  heading: string
  body: string[]
  /** Optional key/value block, e.g. the fields someone submitted. */
  rows?: [string, string][]
  ctaUrl?: string
  ctaLabel?: string
  footerNote?: string
}

/**
 * A general notice. Same chrome as the others; the middle is paragraphs plus an
 * optional detail table. renderDealEmail exists separately because its deal and
 * amount rows are mandatory — an empty one reads as a bug rather than as a
 * shorter email.
 */
export function renderNoticeEmail(content: NoticeEmailContent): { html: string; text: string } {
  const { heading, body, rows = [], ctaUrl, ctaLabel = 'Open Guapd', footerNote } = content
  const note = footerNote ?? `This is an automated notification from ${BRAND_NAME}.`

  const html = shell({
    heading,
    preheader: body[0] ?? '',
    inner: [h1(heading), ...body.map(para), detailRows(rows), ctaUrl ? button(ctaUrl, ctaLabel) : '']
      .filter(Boolean).join('\n'),
    footer: `${esc(note)}<br>${esc(siteHost())}`,
  })

  const text = [
    heading, '', ...body,
    ...(rows.length ? ['', ...rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(ctaUrl ? ['', `${ctaLabel}: ${ctaUrl}`] : []),
    '', note,
  ].join('\n')

  return { html, text }
}
