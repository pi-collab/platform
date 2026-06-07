// Mirror of supabase/schema.sql enums and tables.
// Single source of truth for the Deal model — import from @platform/shared, never redefine.

export type UserRole = 'creator' | 'brand_member'

export type DealStatus =
  | 'negotiating'
  | 'agreed'
  | 'delivered'
  | 'revision'
  | 'approved'
  | 'paid'
  | 'complete'
  | 'declined'
  | 'cancelled'

export type OfferParty = 'brand' | 'creator'

export type PaymentStatus =
  | 'none'
  | 'link_sent'
  | 'paid'
  | 'overdue'
  | 'refunded'

export interface User {
  id: string
  auth_id: string | null
  role: UserRole
  full_name: string | null
  email: string | null
  phone: string | null
  managed_by: string | null  // delegated-access stub for agencies/managers
  created_at: string
  updated_at: string
}

export interface Creator {
  id: string
  user_id: string | null  // null until they sign up (pre-signup offer flow)
  full_name: string
  phone: string | null
  niche: string | null
  handle: string | null
  rate_card: Record<string, unknown>  // amounts inside are paise (integers)
  is_vetted: boolean
  created_at: string
  updated_at: string
}

export interface Brand {
  id: string
  name: string
  category: string | null
  created_at: string
  updated_at: string
}

export interface BrandMember {
  id: string
  brand_id: string
  user_id: string
  is_admin: boolean
  created_at: string
}

export interface Deal {
  id: string
  brand_id: string
  creator_id: string
  created_by: string | null
  status: DealStatus
  title: string | null
  deliverables: string | null
  price_paise: number | null  // MONEY: stored as bigint paise in DB (₹1 = 100). Never float.
  currency: string
  timeline_date: string | null  // ISO date string
  revision_limit: number
  revisions_used: number
  usage_rights: string | null
  payment_terms: string | null
  last_offer_by: OfferParty | null
  reengaged_from: string | null  // points to parent deal for the one-tap re-engage loop
  created_at: string
  updated_at: string
  agreed_at: string | null
  completed_at: string | null
}

export interface Message {
  id: string
  deal_id: string
  sender_id: string | null
  sender_party: OfferParty
  body: string | null
  offer_terms: Record<string, unknown> | null  // paise inside, for structured offer/counter messages
  created_at: string
}

export interface Deliverable {
  id: string
  deal_id: string
  uploaded_by: string | null
  version: number
  storage_path: string  // path in Supabase Storage bucket
  filename: string | null
  note: string | null
  created_at: string
}

export interface Payment {
  id: string
  deal_id: string
  status: PaymentStatus
  amount_paise: number | null  // MONEY: paise, never float
  currency: string
  razorpay_link_id: string | null
  razorpay_link_url: string | null
  link_sent_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  deal_id: string | null
  actor_id: string | null
  event_type: string  // e.g. 'deal.created', 'deal.status_changed'
  detail: Record<string, unknown>
  created_at: string
}
