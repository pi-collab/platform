/**
 * Does a brand's contact email look like it belongs to its website?
 *
 * ── What this is for ────────────────────────────────────────────────────────
 * A brand signs up with a website and a work email. Those usually share a
 * name — priya@nykaa.com for nykaa.com. When they do not, it is worth a human
 * look before that account can read the creator roster and everybody's rates.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 * NOT a fraud test, and never a rejection. Blinkit's people are on grofers.com;
 * a company mid-rebrand, a holding company, an agency buying on a client's
 * behalf and half the Indian D2C market will all "fail" this and all of them
 * are real. That is why a mismatch HOLDS an account for review rather than
 * refusing it — the cost of a false positive is a few hours' wait, not a lost
 * brand.
 *
 * Free consumer providers never reach here: lib/work-email.ts already refuses
 * them at signup.
 */

/**
 * Two-part public suffixes, so tryon.co.in yields "tryon" and not "co".
 *
 * Deliberately short — the ones an Indian brand plausibly uses, plus the
 * majors. A suffix missing from this list makes the name one label too shallow
 * (co, com), which fails CLOSED: the domains stop matching and the brand gets
 * reviewed. That is the right direction for a list that will never be
 * complete.
 */
const MULTI_PART_SUFFIXES = new Set([
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in', 'ac.in', 'gov.in', 'edu.in',
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au', 'com.br', 'com.mx', 'com.sg', 'com.my', 'com.ph',
  'co.nz', 'co.za', 'co.jp', 'co.kr', 'co.th', 'co.id',
])

/** Everything before the public suffix's last label: the registrable name. */
export function domainName(raw: string | null | undefined): string | null {
  if (!raw) return null

  let host = raw.trim().toLowerCase()
  // A website field holds anything a person can type into one.
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')   // scheme
  host = host.split('/')[0].split('?')[0].split('#')[0] // path, query, fragment
  host = host.split('@').pop() ?? host                  // an email, not a host
  host = host.split(':')[0]                             // port
  host = host.replace(/\.$/, '')                        // trailing dot
  if (!host || !host.includes('.')) return null

  const labels = host.split('.').filter(Boolean)
  if (labels.length < 2) return null

  const lastTwo = labels.slice(-2).join('.')
  // The name sits one label deeper when the suffix itself is two labels.
  const nameIndex = MULTI_PART_SUFFIXES.has(lastTwo) ? labels.length - 3 : labels.length - 2
  if (nameIndex < 0) return null

  // Punctuation dropped so "try-on" and "tryon" are the same name. A brand
  // writing its own name with and without a hyphen across two fields is not a
  // signal of anything.
  const name = labels[nameIndex].replace(/[^a-z0-9]/g, '')
  return name || null
}

export type DomainMatch =
  /** Same name either side. Nothing to look at. */
  | { match: true }
  /** Different names, or not enough to compare. `reason` is for ops, not the brand. */
  | { match: false; reason: string; emailName: string | null; siteName: string | null }

/**
 * Compare the email's domain with the website's.
 *
 * TLD is ignored on purpose — tryon.com and tryon.in are the same company, and
 * Indian brands routinely hold both.
 *
 * One name containing the other counts as a match (nykaa / nykaafashion,
 * zomato / zomatoorders), but only when the shorter is four characters or
 * more. Below that, containment is coincidence: "ab" is inside half the
 * domains on the internet.
 */
export function brandDomainMatch(
  website: string | null | undefined,
  contactEmail: string | null | undefined,
): DomainMatch {
  const siteName = domainName(website)
  const emailName = domainName(contactEmail)

  // No website is not a mismatch, but it is not a match either: there is
  // nothing to check the address against, which is the same position a
  // reviewer is in.
  if (!siteName) return { match: false, reason: 'no website to compare', emailName, siteName: null }
  if (!emailName) return { match: false, reason: 'no usable email domain', emailName: null, siteName }

  if (siteName === emailName) return { match: true }

  const [shorter, longer] = siteName.length <= emailName.length ? [siteName, emailName] : [emailName, siteName]
  if (shorter.length >= 4 && longer.includes(shorter)) return { match: true }

  return { match: false, reason: 'email domain does not match website', emailName, siteName }
}
