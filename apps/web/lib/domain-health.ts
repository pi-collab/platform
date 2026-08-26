import { promises as dns } from 'dns'

/**
 * A few cheap facts about a brand's website, for the signup notification.
 *
 * NOT a gate. Every signal here has an innocent explanation — a real company
 * mid-setup has no HTTPS yet, a small brand may sit on parked nameservers for
 * a week, and plenty of legitimate businesses never put an MX record on their
 * apex. Blocking on any of them would reject real brands. This exists so a
 * person reviewing the signup sees what a manual check would have shown them,
 * without doing it by hand.
 *
 * Zero2Host is the case that prompted it: a real, purchased domain with
 * working mail, a plausible name, and no site behind it — parked nameservers
 * and no TLS at all. It cleared every automated check we had.
 */

export interface DomainHealth {
  host: string
  /** Did anything resolve at all? A domain with no A record is a strong signal. */
  resolves: boolean
  /** Does https:// actually connect and answer? */
  https: boolean
  /** Mail configured for the domain — the address on the signup can receive. */
  hasMx: boolean
  /** Nameservers that indicate a registrar parking page rather than hosting. */
  parked: boolean
  /** Human-readable notes, empty when nothing is worth saying. */
  notes: string[]
}

/** Registrar parking nameservers. Not exhaustive, and not meant to be. */
const PARKING = ['dns-parking.com', 'parkingcrew', 'sedoparking', 'bodis.com', 'above.com', 'afternic']

const TIMEOUT_MS = 4000

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS)),
  ])
}

/**
 * Never throws and never blocks for long: every lookup is capped, and every
 * failure degrades to "unknown" rather than propagating. Signup must not fail
 * because someone's DNS is slow.
 */
export async function checkDomainHealth(website: string | null | undefined): Promise<DomainHealth | null> {
  if (!website) return null

  let host: string
  try {
    host = new URL(website).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }

  const [addrs, mx, ns] = await Promise.all([
    withTimeout(dns.resolve4(host), [] as string[]),
    withTimeout(dns.resolveMx(host), [] as { exchange: string }[]),
    withTimeout(dns.resolveNs(host), [] as string[]),
  ])

  const https = await withTimeout(
    fetch(`https://${host}`, { method: 'HEAD', redirect: 'follow', cache: 'no-store' })
      .then((r) => r.status > 0)
      .catch(() => false),
    false,
  )

  const parked = ns.some((n) => PARKING.some((p) => n.toLowerCase().includes(p)))
  const resolves = addrs.length > 0

  const notes: string[] = []
  if (!resolves) notes.push('The domain does not resolve, no A record.')
  if (resolves && !https) notes.push('No working HTTPS. The site is either unfinished or parked.')
  if (parked) notes.push('Nameservers look like a registrar parking page, not real hosting.')
  if (!mx.length) notes.push('No MX record, so the domain is not set up to receive mail.')

  return { host, resolves, https, hasMx: mx.length > 0, parked, notes }
}
