import { randomBytes } from 'node:crypto'

/**
 * Invites to creators found on Instagram who are not on Guapd yet.
 * guapd.com/c/i-<26 base36> is rewritten to /invite/<token> by middleware;
 * the "i-" prefix is reserved and can never be a storefront slug.
 */

export const INVITE_TOKEN = /^i-[a-z0-9]{26}$/
export const INVITE_COOKIE = 'guapd_invite'
export const INVITE_COOKIE_MAX_AGE = 14 * 24 * 3600

export function newInviteToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(26)
  let out = 'i-'
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % 36]
  return out
}

export function inviteUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
  return `${base}/c/${token}`
}

/** The message a brand copies or sends. Short, says who and how, no money. */
export function inviteMessage(brandName: string, username: string, link: string): string {
  return `Hi @${username}, ${brandName} would like to work with you on a campaign. We use Guapd to send offers and pay creators. See the brief and accept here: ${link}`
}

export { instagramProfileUrl, instagramMessageUrl, whatsappUrl } from './invite-links'
