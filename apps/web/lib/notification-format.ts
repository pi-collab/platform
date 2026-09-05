/**
 * Presentation vocabulary for the notification feed.
 *
 * Extracted from NotificationFeed so the mobile screen and the desktop feed
 * share ONE definition of what each notification type is called, which rows a
 * filter matches, and how a name becomes an avatar. Two copies of these maps
 * is how a filter quietly stops matching a type someone added on one side
 * only.
 *
 * No `server-only`: both consumers are client components.
 */

export interface Notification {
  id: string
  deal_id: string | null
  type: string
  body: string
  read_at: string | null
  created_at: string
}

export interface CreatorInfo {
  name: string
  photo: string | null
  pricePaise: number | null
}

export type Variant = 'brand' | 'creator'
export type Filter = 'all' | 'unread' | 'submissions' | 'offers' | 'payments' | 'deals'

export const BRAND_FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'payments', label: 'Payments' },
  { id: 'deals', label: 'Deals' },
]

export const CREATOR_FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'offers', label: 'Offers' },
  { id: 'payments', label: 'Payments' },
  { id: 'deals', label: 'Deals' },
]

// Gradients matching the HTML design (pastel tones with sec-2 purple hints)
export const AVATAR_GRADS = [
  'linear-gradient(135deg,#E9E2FF,#DEF0FF)',   // lavender → sky
  'linear-gradient(135deg,#FFEEE2,#FFE1EC)',   // peach → pink
  'linear-gradient(135deg,#D6F0F5,#E8FAFC)',   // cyan → light cyan
  'linear-gradient(135deg,#F7F4FB,#F7F4FB)',   // sec-2 purple (solid)
  'linear-gradient(135deg,#F7F4FB,#FFE0EC)',   // sec-2 → pink
  'linear-gradient(135deg,#F5EDE0,#FFF8E6)',   // warm cream
]

export function nameToGradIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return Math.abs(hash) % AVATAR_GRADS.length
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100_000) { const v = rupees / 100_000; return `\u20B9${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}L` }
  if (rupees >= 1_000) return `\u20B9${Math.round(rupees / 1_000)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function getBucket(iso: string): 'today' | 'week' | 'older' {
  const now = new Date()
  const d = new Date(iso)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= startOfToday) return 'today'
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  if (d >= startOfWeek) return 'week'
  return 'older'
}

export const SUBMISSION_TYPES = new Set(['deliverable_submitted', 'content_posted', 'submission', 'delivered'])
export const OFFER_TYPES = new Set(['offer_sent', 'offer_declined', 'offer'])
export const PAYMENT_TYPES = new Set(['invoice_issued', 'invoice_accepted', 'payment_paid', 'payment', 'invoice'])
// Brand: deals = everything except submissions/payments/messages
export const BRAND_DEAL_TYPES = new Set(['offer_sent', 'deal_agreed', 'offer_declined', 'deal_approved', 'revision_requested', 'product_shipped', 'product_delivered', 'accepted', 'complete', 'cancelled', 'declined', 'agreed', 'approval', 'shipping', 'counter_offer', 'counter_accepted'])
// Creator: deals = invoice, approval, shipping, delivery (per HTML)
export const CREATOR_DEAL_TYPES = new Set(['invoice_issued', 'invoice_accepted', 'deal_agreed', 'deal_approved', 'product_shipped', 'product_delivered', 'invoice', 'approval', 'shipping', 'delivery', 'agreed', 'complete', 'counter_offer', 'counter_accepted'])

export function matchesFilter(n: Notification, f: Filter, allRead: boolean, variant: Variant): boolean {
  if (f === 'all') return true
  if (f === 'unread') return !n.read_at && !allRead
  if (f === 'submissions') return SUBMISSION_TYPES.has(n.type)
  if (f === 'offers') return OFFER_TYPES.has(n.type)
  if (f === 'payments') return PAYMENT_TYPES.has(n.type)
  if (f === 'deals') return variant === 'creator' ? CREATOR_DEAL_TYPES.has(n.type) : BRAND_DEAL_TYPES.has(n.type)
  return true
}

export const BRAND_DESC: Record<string, string> = {
  offer_sent: 'New offer sent',
  deal_agreed: 'Deal accepted \u00B7 the deal is now active',
  offer_declined: 'Offer declined',
  deal_approved: 'Content approved',
  revision_requested: 'Revision requested',
  deliverable_submitted: 'Content ready for your review',
  invoice_issued: 'Invoice received \u00B7 payment awaiting your release',
  invoice_accepted: 'Invoice accepted',
  payment_paid: 'Payment released',
  content_posted: 'Content is now live',
  product_shipped: 'Product shipped',
  product_delivered: 'Product delivered',
  new_message: 'New message',
  accepted: 'Deal accepted \u00B7 the deal is now active',
  submission: 'Content ready for your review',
  invoice: 'Invoice received \u00B7 payment awaiting your release',
  payment: 'Payment released',
  complete: 'Deal completed',
  message: 'New message',
  shipping: 'Product shipped',
  delivered: 'Content delivered',
  approval: 'Content approved',
  agreed: 'Deal accepted \u00B7 the deal is now active',
  declined: 'Offer declined',
  cancelled: 'Deal cancelled',
  counter_offer: 'Counter offer received \u00B7 review their terms',
  counter_accepted: 'Counter accepted \u00B7 terms are now locked',
}

export const CREATOR_DESC: Record<string, string> = {
  offer_sent: 'New offer \u00B7 review the terms',
  deal_agreed: 'You accepted the terms',
  offer_declined: 'Offer declined',
  deal_approved: 'Deliverables approved \u00B7 time to get paid',
  revision_requested: 'Revision requested',
  deliverable_submitted: 'Deliverables submitted',
  invoice_issued: 'Invoice sent',
  invoice_accepted: 'Invoice accepted \u00B7 payment is being processed',
  payment_paid: 'Sent to your linked account',
  content_posted: 'Content is now live',
  product_shipped: 'Tracking added to the deal',
  product_delivered: 'Everything is here \u00B7 time to create',
  new_message: 'New message',
  accepted: 'You accepted the terms',
  submission: 'Deliverables submitted',
  invoice: 'Invoice accepted \u00B7 payment is being processed',
  payment: 'Sent to your linked account',
  complete: 'Deal completed',
  message: 'New message',
  shipping: 'Tracking added to the deal',
  delivered: 'Everything is here \u00B7 time to create',
  delivery: 'Everything is here \u00B7 time to create',
  approval: 'You accepted the terms',
  agreed: 'You accepted the terms',
  declined: 'Offer declined',
  cancelled: 'Deal cancelled',
  offer: 'New offer \u00B7 review the terms',
  approved: 'Deliverables approved',
  counter_offer: 'New counter offer \u00B7 review updated terms',
  counter_accepted: 'Counter accepted \u00B7 deal is now active',
}

export function typeDescription(type: string, variant: Variant): string {
  const map = variant === 'creator' ? CREATOR_DESC : BRAND_DESC
  return map[type] || type
}
