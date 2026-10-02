/**
 * Where a creator is, and roughly how old: asked at signup, and asked of
 * existing creators on the dashboard.
 *
 * State is a pick-list, city is typed. A state list is short and fixed, so
 * picking it removes the "Karnataka" / "KA" / "karnatka" spread that free text
 * produced. Cities are too many to list, and the state already does the
 * grouping a brand filters on.
 *
 * Age is a BRACKET, never a date of birth. A brand needs "is this creator in
 * my audience's age range", not a birthday, and a date of birth is personal
 * data we would then have to protect for no extra use.
 */

/** The 28 states and 8 union territories, by their common names. */
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
] as const

/**
 * Stored as the code; the label is what is shown. Includes Under 18: there are
 * child creators, usually run by a parent, and without the option they either
 * pick a false bracket or abandon signup. Mirrors the CHECK in migration 0516;
 * keep the two in step.
 */
export const AGE_BRACKETS = [
  { code: 'under_18', label: 'Under 18' },
  { code: '18_24', label: '18–24' },
  { code: '25_34', label: '25–34' },
  { code: '35_44', label: '35–44' },
  { code: '45_plus', label: '45+' },
] as const

export type AgeBracket = (typeof AGE_BRACKETS)[number]['code']

export function isIndianState(v: unknown): v is string {
  return typeof v === 'string' && (INDIAN_STATES as readonly string[]).includes(v)
}

export function isAgeBracket(v: unknown): v is AgeBracket {
  return typeof v === 'string' && AGE_BRACKETS.some(b => b.code === v)
}

export function ageBracketLabel(code: string | null | undefined): string | null {
  return AGE_BRACKETS.find(b => b.code === code)?.label ?? null
}

/** A typed city, tidied: trimmed, inner spaces collapsed, capped. */
export function cleanCity(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
}

/**
 * The legacy free-text `creators.location`, kept in step on every write as
 * "City, State". AI search and the Growth pool filter read that column, and
 * keeping it filled means neither has to change to benefit.
 */
export function locationLine(city: string, state: string): string | null {
  const parts = [cleanCity(city), state.trim()].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export type LocationInput = { city: string; state: string; ageBracket: string }

/**
 * Validate the three together, server-side. Returns the columns to write, or
 * an error a creator can act on. All three are required wherever this is asked:
 * a half answer is the thing the dashboard prompt exists to chase.
 */
export function validateLocation(input: LocationInput):
  | { ok: true; row: { city: string; state: string; age_bracket: AgeBracket; location: string | null } }
  | { ok: false; error: string } {
  const city = cleanCity(input.city)
  if (!isIndianState(input.state)) return { ok: false, error: 'Select your state.' }
  if (!city) return { ok: false, error: 'Enter your city.' }
  if (!isAgeBracket(input.ageBracket)) return { ok: false, error: 'Select your age bracket.' }
  return { ok: true, row: { city, state: input.state, age_bracket: input.ageBracket, location: locationLine(city, input.state) } }
}
