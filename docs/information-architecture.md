# Information Architecture — All Screens

> Exhaustive IA extraction for designer handoff. Every element, field, section, button, action, and conditional state currently on each screen.
> Generated from codebase on 2026-07-25.

---

## Screen 1: Browse Creators (Brand Side)

**Files:** `apps/web/app/browse/page.tsx` + `apps/web/app/browse/BrowseGrid.tsx`

### Layout / Structure
Full-width page section with container-width cap and horizontal padding. Two-row filter bar at the top, results count line, then a responsive auto-fill grid of creator cards.

### Sections (top to bottom)
1. Page header
2. Filter bar (two rows)
3. Results count label
4. Creator card grid (or empty state)

### Fields / Data shown

**Page header**
- H1: "Browse Creators"
- Subtitle: "Find a creator from our vetted roster to start a deal."

**Filter bar — Row 1**
- Search input: placeholder "Search by name or handle..." — matches against `full_name` and `handle`
- Niche select: "All niches" default, then options from the `NICHES` constant
- Followers select: brackets — < 50K / 50K–100K / 100K–500K / 500K–1M / 1M+

**Filter bar — Row 2**
- Rate range select: < 10K / 10K–25K / 25K–50K / 50K–1L / 1L–3L / 3L+ (matched against any of the creator's rates)
- My budget select: < 25K / 25K–50K / 50K–1L / 1L–3L / 3L+ (matched against creator's lowest rate)
- "Clear all" button (conditional — see below)

**Results count label**
- "N creators" if no filter is active
- "N creators (of M)" when the filtered set is smaller than the total

**Creator card (each card in the grid)**
- Avatar: profile photo if available, else initials fallback (2 chars, from `full_name` split)
- Full name (bold heading)
- Niche badges (one pill per niche in the `niches` array)
- Primary social line: platform name (bold, capitalized) + handle + follower count (formatted as K/M), where "primary" = the social account with the highest follower count
- Rate range line: formatted "X – Y" or "X" if min = max (from `rate_card` JSONB, in paise)
- "Worked with N brand(s)" count line (conditional — only shown if `worked_with` array is non-empty)
- Entire card is a `<Link>` to `/browse/[creator.id]`

### Actions / Buttons (with conditions)
- "Clear all" button: appears only when at least one filter is active (search, niche, followers, rate, or budget)
- Click on creator card: navigates to `/browse/[id]` (brand-side detail page)

### States / Conditional UI
- All filters are client-side; filtering happens in-memory on every keystroke / selection change
- Rate range filter: only includes creators who have a `rate_card` with at least one non-zero value that falls in the bracket
- Budget filter: based on creator's *minimum* rate vs the bracket ("can I afford them at all?")
- Follower filter: compared against the *highest* follower count across all of the creator's social accounts
- Primary social row: hidden if creator has no social accounts
- Rate range row: hidden if creator has no `rate_card`
- Worked with row: hidden if `worked_with` is empty or null
- Avatar shows initials fallback (gray box) when no `profile_photo_url`

### Empty states
- Error loading from DB: red error text "Error loading creators: [message]" (full page, no grid)
- No creators matching current filters: centered text "No creators match your filters" + "Try adjusting your search or filters."
- Zero creators in DB: same no-match state (filtered.length === 0)

---

## Screen 2: Creator Storefront / Public Profile

Two distinct implementations exist — the public storefront (`/c/[slug]`) for any visitor/brand and the brand-internal profile (`/browse/[id]`) for logged-in brands. Both are documented here.

### Screen 2A: Public Storefront (`/c/[slug]/StorefrontPage.tsx`)

#### Layout / Structure
Full-viewport gradient background (light green to pink to purple to orange). Single max-width-900 centered column. All sections are "glass" cards with backdrop blur and rounded corners. PitchPanel is a fixed-position modal overlay.

#### Sections (top to bottom)
1. Header card (portrait, name, headline, categories, "Send a pitch" CTA, stats)
2. About card (bio)
3. Platforms card (social links)
4. Packages card (rate card items)
5. Work card (content portfolio items)
6. Worked with card (past brand names)
7. Creator recruitment CTA card
8. Footer
9. PitchPanel (modal overlay, shown on demand)

#### Fields / Data shown

**Header card**
- Portrait: 96x96px image (from `portrait_path`) or gradient placeholder showing first 2 chars of `display_name`
- H1: `display_name`
- Headline (conditional): shown if `data.headline` is non-null
- Category pills: one pill per item in `data.categories` (shown only if array is non-empty)
- Stats row (shown only if at least one stat is non-null):
  - Followers: formatted as K/M
  - Avg. views: formatted as K/M
  - Engagement rate: formatted as "X.X%"

**About card** (conditional — only if `data.bio` is non-null)
- Section title: "About"
- Bio text (pre-wrapped)

**Platforms card** (conditional — only if `data.platform_links.length > 0`)
- Section title: "Platforms"
- One pill-link per platform: shows platform icon abbreviation (IG/YT/X/in/TT or first 2 chars) + handle, links to `pl.url` in new tab

**Packages card** (conditional — only if `data.packages` is non-null and has items)
- Section title: "Packages"
- Responsive grid of package cards. Each card:
  - Meta line: `platform . product_type`
  - Description text (conditional — if `pkg.description` is non-null)
  - Price: formatted amount (in rupees from paise)
  - "+" button: opens PitchPanel pre-filled with `1 [platform] [product_type] — [price]`

**Work card** (conditional — only if `data.content_items.length > 0`)
- Section title: "Work"
- Responsive grid of content item cards. Each card:
  - Thumbnail image (16:9 ratio, background-image, conditional on `item.image_path`)
  - Title text
  - Entire card links to `item.link` if present

**Worked with card** (conditional — only if `data.past_collabs` is non-null and has items)
- Section title: "Worked with"
- One pill per brand name from `past_collabs` array

**Creator CTA card** (always shown)
- Text: "Are you a creator? Get your own page and let brands find you."
- Link: "Create your storefront" to `/creator/storefront`

**Footer** (always shown)
- "Powered by Guapd"

#### PitchPanel (modal overlay)
Triggered by "Send a pitch" button in header or "+" button on a package card.

**PitchPanel fields:**
- Title: "Pitch [creatorName]"
- Subtitle: "Describe what you have in mind. They'll receive your pitch as a deal offer."
- Close button (X icon, top-right)
- Field: "Campaign / project title" (text input, required, maxLength 200, placeholder "e.g. Summer product launch")
- Field: "What you're looking for" (textarea, required, maxLength 1000, rows 3, placeholder "e.g. 1 Instagram Reel + 2 Stories about our new product"; pre-filled when opened from a package "+" button)
- Field: "Message (optional)" (textarea, maxLength 2000, rows 3, placeholder "Any extra context, budget range, timeline...")
- ToS/Privacy disclaimer text with links to `/terms` and `/privacy`
- Submit button: "Send pitch" (disabled and greyed while sending, shows "Sending...")
- Error message (red box, conditional)
- Draft persistence: form state saved to sessionStorage under key `guapd_pitch_draft` if user is redirected to login; restored on return

**PitchPanel success state:**
- Large checkmark icon
- "Pitch sent!"
- Text: "[creatorName] will see your pitch in their deal inbox. You can track it from your deals page."
- Button: "Go to deals" navigates to `/deals`

**PitchPanel error state:**
- If `result.error === 'not_authenticated'`: saves draft to sessionStorage, redirects to `/login?next=/c/[slug]`
- Other errors: red error box shown above submit button

#### Actions / Buttons
- "Send a pitch" (header): always visible, opens PitchPanel
- Package "+" button: opens PitchPanel with deliverables pre-filled
- Platform links: external links in new tab
- "Create your storefront": navigates to `/creator/storefront`
- Analytics: `storefront_viewed` event fired on mount; `pitch_started` on open; `deal_created_from_storefront` on success

#### States / Conditional UI
- Portrait placeholder gradient shown when `portrait_path` is null
- Each section card only renders if its data is non-empty/non-null
- Stats row only renders if at least one stat value is non-null

#### Empty states
- No explicit empty state for zero sections — sections simply don't render. A storefront with no bio, no packages, no work, no past collabs would show only the header card, platforms card (if any), creator CTA, and footer.

---

### Screen 2B: Brand-Internal Creator Profile (`/browse/[id]/page.tsx`)

#### Layout / Structure
Section with container-width cap. Back link, then header, then CTA row, then products storefront, then a two-column details grid (social accounts, worked with, portfolio).

#### Sections (top to bottom)
1. Back navigation
2. Header (avatar, name, niche badges, bio)
3. CTA row (primary + optional re-engage)
4. Products section (grouped by platform+handle)
5. Details grid: Social Accounts | Worked With | Portfolio Links

#### Fields / Data shown

**Back link:** "Back to browse" to `/browse`

**Header**
- Avatar: profile photo (80x80) or initials fallback
- H1: `full_name`
- Niche badges (one pill per niche)
- Bio text (conditional)

**CTA row**
- Primary button: "Start a deal with [first name]" to `/deals/new?creator=[id]`
- Re-engage button: "Re-engage [first name]" to `/deals/new?from=[lastDeal.id]` (conditional — only shown if brand has a previous deal with this creator)

**Products section** (conditional — only if active products exist)
- Section title: "Products" (uppercase)
- Grouped by platform + handle. For each group:
  - Account header: platform badge + `@handle` + follower count (if > 0) + "Verified" badge (if `sa.verified`)
  - Product rows. Each row:
    - Product type (name)
    - Description (conditional)
    - Price: formatted amount if `display_price = true`, else italic "Price on request"
    - Revision line: "[N] rev incl" + ", [X]/extra" if `price_per_extra_revision_paise > 0`

**Social Accounts section** (conditional — only if `social_accounts` array is non-empty)
- Section title: "Social Accounts" (uppercase)
- One card per social account:
  - Platform name (bold, capitalized)
  - "Verified" badge (conditional)
  - Handle (with `@` prefix)
  - Follower count (conditional — only if > 0)
  - URL link (conditional)

**Worked With section** (conditional — only if `worked_with` is non-empty)
- Section title: "Worked With" (uppercase)
- One pill per brand name

**Portfolio section** (conditional — only if `portfolio_links` is non-empty)
- Section title: "Portfolio" (uppercase)
- One external link per URL

#### Actions / Buttons
- "Start a deal with [first name]": navigates to `/deals/new?creator=[id]` (always shown)
- "Re-engage [first name]": navigates to `/deals/new?from=[lastDeal.id]` (only shown if the brand has a prior deal with this creator)
- Social account URL: opens in new tab

#### States / Conditional UI
- Products section hidden when no active `creator_products` exist for this creator
- `display_price = false` products show "Price on request" instead of a price
- Social account "Verified" badge appears only when `sa.verified = true`
- Follower count only shown when > 0
- Social URL link only shown when `sa.url` is non-null
- Re-engage button only appears when the brand has at least one prior deal with this creator

#### Empty states
- Creator not found (or RLS blocks access): Next.js 404

---

## Screen 3: Offer Builder / Create Deal

**Files:** `apps/web/app/deals/new/page.tsx` + `apps/web/app/deals/new/DealForm.tsx`

### Layout / Structure
Section with container-width cap. Back link + H1, then a max-width-640 form. Two-tab interface (Offer / Brief). Fee breakdown and product selection are in the Offer tab. Brief fields are in the Brief tab. Submit button is below the tabs and always visible.

### Sections (top to bottom)
1. Back navigation
2. Page heading
3. Two-tab switcher (Offer | Brief)
4. Offer tab content
5. Brief tab content (hidden when Offer tab active)
6. Submit button

### Fields / Data shown

**Back link:** "Back to [creator full_name]" to `/browse/[creatorId]`

**Page heading**
- "New deal with [name]" when re-engaging from a previous deal (`?from=` param)
- "Create an offer for [name]" for a fresh deal (`?creator=` param)

**Tab switcher**
- "Offer" tab
- "Brief" tab — shows a small indigo dot indicator when either `briefPitch` or `briefGuidelines` has content

**Prefill banner** (conditional — only when `?from=` is set and some previous deal items no longer exist as active products)
- Yellow warning box: "Heads up: N item(s) from the previous deal are no longer offered by this creator and were not pre-filled: [item names]. Review before sending."

**Error box** (conditional — red box at top of form when a validation error occurs)

---

**OFFER TAB**

**Creator display (read-only)**
- Profile photo or initials fallback (40x40)
- Creator full name (bold)
- Handle (if non-null)

**Deal title field**
- Label: "Deal title"
- Input: pre-filled as "Deal with [full_name]" (or from previous deal title if re-engaging)

**Campaign field** (conditional — only shown if at least one active campaign exists)
- Label: "Campaign (optional)" + hint "Group this deal under a campaign"
- Select: "No campaign" + one option per campaign (id/name)

**Select deliverables fieldset**
- Legend: "Select deliverables"
- If no products: text "This creator has no products listed. Add products via ops first."
- Grouped by platform + handle. For each group:
  - Account header: platform badge + `@handle` + follower count
  - Product rows. For each product:
    - Product type name
    - Description (conditional)
    - Price: formatted amount if `display_price = true`, else italic "Price on request"
    - Quantity stepper: [-] [N] [+] (border turns black when qty > 0)
    - **Reel type dropdown** (conditional — only shown when qty > 0 AND platform is "instagram"): "Reel type..." / "Collab post" / "Non-collab"
    - **Boosting rights toggle** (conditional — only shown when qty > 0): [Boost] [No boost] pill buttons + x to clear
    - **Boosting duration picker** (conditional — only shown when boosting_rights = true): [1mo] [3mo] [6mo] [12mo] [unlimited] pill buttons
    - **Custom price input** (conditional — only shown when `display_price = false` AND qty > 0): number input "Your price"

- **Running total box** (conditional — only shown when at least one item has qty > 0):
  - "N item(s) selected"
  - Deliverables summary text (e.g. "1x Reel @ 50K (Instagram @handle)")
  - "Total: X"

**Total price override field**
- Label: "Total price" + hint "Auto-calculated from products. Override if needed."
- Number input: placeholder = auto-calculated total
- Warning text: "Overriding calculated total of X" (conditional — only when override differs from calculated total)

**Fee breakdown panel** (conditional — only shown when selectedCount > 0 AND platformFeePercent > 0 AND finalPaise > 0)
- Row: "Deliverables total" | amount
- Row: "Platform fee (N%)[— deducted]" | +/- amount
- Divider
- Row: "You pay" (bold) | amount
- Row: "Creator receives" | amount

**Delivery date field**
- Label: "Delivery date"
- Date input

**Revision terms fieldset** (border turns bold black when products are selected)
- Legend: "Revision terms"
- Product defaults info box (conditional — shown when products are selected):
  - Per-product line: "[product_type] ([platform] @handle) — N rev incl[, X/extra or, free extras]"
  - Variation warning (conditional — amber text, shown when multiple selected products have different revision terms): "Products have different revision terms — deal uses min included (N) and max per-extra (X)."
  - "Adjust below if needed." (shown when no variation)
- Field: "Included revisions" (number, min 0, auto-updated from product defaults when selection changes)
- Field: "Per extra revision" (number, min 0, auto-updated from product defaults)
- Summary text (conditional — shown when price per extra revision > 0): "N revision(s) included, then X per extra"

**Usage rights field**
- Label: "Usage rights"
- Select: blank / "One-time social post" / "6 months, all platforms" / "Perpetual, all media" / "Custom"
- Custom input (conditional — appears when "Custom" is selected): text input "Describe usage rights..."
- Pre-filled from previous deal if re-engaging

**Content rights fieldset**
- Legend: "Content rights"
- Hint text: "Boosting rights are set per deliverable above. Usage rights expiry applies to the whole deal."
- Field: "Usage rights expire on" + hint "When do all content usage rights end? Leave blank for perpetual." — date input

**Payment terms field**
- Label: "Payment terms"
- Select: blank / "50% advance, 50% on approval" / "100% on approval" / "100% advance" / "Custom"
- Custom input (conditional — when "Custom" selected): text input "Describe payment terms..."
- Pre-filled from previous deal if re-engaging

**Product shipment checkbox**
- "This deal includes a product shipment" (checkbox + label)
- Helper text (conditional — shown when checked): "You'll be able to add tracking info after the creator accepts."

**Message to creator field**
- Label: "Message to creator (optional)" + hint "Will be sent as the first message in the deal thread"
- Textarea (min-height 60px, resizable), placeholder "Hey! Would love to work together on..."

---

**BRIEF TAB**

- Intro text: "Share your campaign pitch and creative guidelines with the creator. They'll see this on their deal page. This is optional."
- Field: "Pitch" + hint "What's the campaign about? What do you want the creator to communicate?" — textarea, maxLength 2000, placeholder giving an example finance campaign brief
- Field: "Creative guidelines" + hint "Any dos/don'ts, tone, hashtags, or specific talking points?" — textarea, maxLength 2000, placeholder with example dos/don'ts
- Both fields pre-filled from previous deal if re-engaging

---

**Submit button** (always below tabs)
- Label: "Creating..." (loading) or "Create offer . X" where X is the total brand pays (including fee if `on_top` mode)
- Disabled states: when loading, OR when no products selected (selectedCount = 0), OR when a "price on request" product is selected but no custom price entered (`hasMissingPrice`)
- Button turns grey when disabled

### Actions / Buttons
- Tab switcher: "Offer" / "Brief"
- Quantity stepper buttons: [-] and [+] per product
- Reel type dropdown (per Instagram product when qty > 0)
- [Boost] / [No boost] / x boosting right toggles per item (when qty > 0)
- Boosting duration pills: [1mo] [3mo] [6mo] [12mo] [unlimited] per item (when boosting = true)
- "Clear" (x) on boosting rights: resets boosting_rights to null
- Submit: creates deal via `createDeal` server action, redirects to `/deals/[dealId]` on success

### States / Conditional UI
- Fresh deal (`?creator=`): title pre-filled as "Deal with [name]", revision fields at defaults, empty usage/payment
- Re-engage flow (`?from=`): title, deliverables, price, revision terms, usage rights, payment terms, brief pitch/guidelines all pre-filled from the source deal; items matched to current active products; dropped items shown in warning banner
- `revisionLimit` and `pricePerExtraRevision` auto-update when product selection changes (unless a prefill was provided, in which case pre-fill values take priority on the first render only)
- Fee breakdown panel shows/hides based on whether the brand has a non-zero `platform_fee_percent` (or a per-pair rate override from `brand_creator_rates`)
- Campaign dropdown is hidden entirely if the brand has no active campaigns

### Validation
- Deal title required
- At least one product must have qty > 0
- All "price on request" products that are selected must have a custom price entered
- Final price must be > 0

### Empty states
- No products for creator: "This creator has no products listed. Add products via ops first."

---

## Screen 4: Deal Detail (Brand Side)

**File:** `apps/web/app/deals/[id]/page.tsx`

### Layout / Structure
Section with container-width cap. Back link, then a header row (deal title + status + creator link + campaign link + price + messages CTA). Then sequential sections: brief, deliverable items, shipment, posted status, invoice, two-column grid (deal terms | timeline), then metadata timestamps. `RealtimeDealListener` is mounted for live updates.

### Sections (top to bottom)
1. Back navigation
2. Header (title, deal_ref, status badge, creator line, campaign line, price, messages button)
3. Brief panel (collapsible, conditional)
4. Deliverable items (interactive review when status is `delivered` or `revision`, read-only otherwise)
5. Product shipment card (conditional)
6. Posted content block (conditional)
7. Invoice card (conditional)
8. Two-column grid: Deal Terms | Timeline
9. Metadata (created/updated/agreed/completed timestamps)

### Fields / Data shown

**Back link:** "Back to deals" to `/deals`

**Header (left)**
- H1: deal title (or "Untitled deal")
- `deal_ref` monospace tag (conditional — if non-null)
- Status badge (colored pill): derived display status label — negotiating / agreed / delivered / revision / approved / paid / complete / declined / cancelled; color from `deriveDisplayStatus()` helper
- Creator line: "with [full_name]" + handle (conditional) — name links to `/browse/[creator.id]`
- Campaign line: "Campaign: [name]" — name links to `/campaigns/[campaign_id]` (conditional — only if deal is in a campaign)

**Header (right)**
- Total price (monospace, large): `brand_pays_paise` (base + fee + revision overage)
- Breakdown text (conditional — when fee > 0 or overage > 0): "X base + Y fee + N extra rev"
- "Messages (N)" or "Start conversation" button — opens the DealThread chat panel (always visible)
- "New deal, same terms" button to `/deals/new?from=[id]` (conditional — only when status is `complete`, `paid`, or `approved`)

**Brief panel** (conditional — only shown if `deal.brief_pitch` or `deal.brief_guidelines` is non-null, OR if the deal belongs to a campaign that has a brief)
- Collapsible `<details>` element — auto-opened (`open` attribute) when deal status is `negotiating`
- Summary header: "Campaign Brief" (if campaign brief) or "Brief", plus campaign name link
- Inside expanded: sub-sections "PITCH" and "CREATIVE GUIDELINES" (each conditional)

**Deliverable Items section** (conditional — only shown when `deal_deliverable_items` rows exist)
- Section title: "Review Deliverables" (when status is `delivered` or `revision`) or "Deliverable Items" (all other statuses)

- **Interactive review mode** (`delivered` or `revision` status) — uses `ItemReview` component:
  - Progress bar: green fill, "N of M reviewed" count
  - Revisions: "Revisions: N / M used"
  - Per item card:
    - Label (product type)
    - Platform + @handle
    - Reel type badge: "Collab" or "Non-collab" (conditional)
    - Boosting badge: "Boosting Nmo" or "Boosting unlimited" (conditional)
    - Price (monospace, conditional — if `price_paise > 0`)
    - Status badge: pending / submitted / revision / approved (with version number if v > 1)
    - Submitted content: external URL link (conditional) or uploaded file name + "View file" button (conditional)
    - Action buttons (only when `item_status = 'submitted'`):
      - "Approve" button
      - "Request Revision" button — shows revision form
    - Revision form (conditional — when "Request Revision" clicked):
      - Textarea: "What needs to change?" (placeholder with timecode example)
      - "Cancel" button
      - "Send revision request" button
  - Revision reminders (conditional):
    - "This is the final revision included in the agreed terms." (soft reminder, when next revision would be the last)
    - "Beyond revision limit (N/M used)" warning box + extra cost per revision if applicable (when already over limit)
  - Success state when all items approved: "All deliverables approved — The deal has been marked as approved. The creator has been notified."

- **Read-only mode** (all other statuses):
  - Progress bar: green fill, "N of M submitted" count
  - Per item row: label, platform + handle, reel type badge, boosting badge, external URL link (if present), file name + "View file" button (if file uploaded), status badge

**Product Shipment card** — `ShipmentCard` component (conditional — shown when `deal.requires_shipment = true` AND `deal.shipment_status` is non-null AND deal status is not `negotiating`, `declined`, or `cancelled`)
- Section title: "Product Shipment"
- **Pending state:**
  - Text: "Shipment pending — mark as shipped when ready."
  - Input: "Tracking link (optional)" (URL)
  - Input: "Carrier / AWB note (optional)" (text)
  - Button: "Mark as shipped"
- **Shipped state:**
  - Text: "Shipped on [date]" (blue)
  - "Track shipment" link (conditional — if `tracking_link` is non-null)
  - Carrier note text (conditional)
  - Button: "Mark as delivered"
- **Delivered state:**
  - Text: "Product delivered" (green)
  - Tracking link (conditional)
  - Carrier note (conditional)

**Posted status** (two possible states)
- Green box: "Content Posted" + live URL link + "Posted [date]" (conditional — shown when `deal.is_posted = true` AND `posted_url` is non-null)
- Italic text: "Awaiting creator to post the content." (conditional — shown when status is `approved`, `paid`, or `complete` AND `is_posted` is false)

**Invoice card** — `BrandInvoiceCard` component (conditional — only shown when an invoice row exists)
- Title: "Invoice [deal_ref]" + status badge (draft / issued / accepted / paid / overdue)
- Line items:
  - Deliverables: amount
  - Revision overage: amount (conditional — if `overage_paise > 0`)
  - Platform fee (N%, on top/deducted): +/- amount (conditional — if `fee_paise > 0`)
  - Divider
  - You pay: amount (bold)
  - Creator receives: amount (bold)
- Payment terms text (conditional)
- Due date status (conditional — colored text, red if urgent, green otherwise)
- Issued date (conditional)
- Accepted date (conditional)
- Action buttons (status-dependent):
  - `issued`: "Accept invoice" button
  - `accepted`: "Pay X" button (green)
  - `paid`: "Paid — deal complete" text confirmation

**Deal Terms section** (left column of two-column grid)
- Section title: "Deal Terms"
- Deliverables: if structured items exist — per-item list with platform, reel type tag, boosting tag, and per-item price; else — legacy text string
- Base price (monospace)
- Platform fee (conditional — if `fee_paise > 0`): "Platform fee (N%, on top/deducted)"
- You pay (bold monospace, conditional — same condition)
- Creator receives (conditional)
- Delivery date (formatted)
- Revisions: "N / M used"
- Per extra revision amount (conditional — if `price_per_extra_revision_paise > 0`)
- Amount owed breakdown (conditional — if revisions_used > revision_limit AND price_per_extra_revision_paise > 0): "Base X + N extra revisions x Y = Z"
- Usage rights (conditional)
- Usage rights expire (conditional — if `usage_rights_end_date` is non-null)
- Rights confirmed timestamp (conditional — if `rights_confirmed_at` is non-null)
- Payment terms (conditional)
- Last offer by (conditional — shows "Brand" or "Creator", capitalized)

**Timeline section** (right column)
- Section title: "Timeline"
- Chronological event list (from `events` table, ascending). Each event:
  - Animated pulsing dot (current = larger, color-coded; past = grey)
  - Connecting vertical line between events (except last)
  - Event label (human-readable)
  - Description / transition text
  - Timestamp
  - "CURRENT" badge on the most recent event
- Event types parsed: `deal.created`, `deal.status_changed` (with from-to labels), `deal.rights_confirmed`, `deal.posted`, and all others (humanized)

**Metadata** (always shown)
- Created: full timestamp
- Updated: full timestamp
- Agreed: full timestamp (conditional)
- Completed: full timestamp (conditional)

### Actions / Buttons
- "New deal, same terms": only when status is `complete`, `paid`, or `approved`
- "Messages (N)" / "Start conversation": always (opens chat panel)
- "Accept invoice": when invoice status is `issued`
- "Pay X": when invoice status is `accepted`
- "Mark as shipped": when shipment status is `pending`
- "Mark as delivered": when shipment status is `shipped`
- "Approve" (per item): when item status is `submitted` AND deal is `delivered`/`revision`
- "Request Revision" (per item): same condition as Approve
- "Send revision request": inside the per-item revision form
- "View file": when item has a storage_path (opens signed URL in new tab)
- All loading states show "..." or "Updating..." / "Accepting..." etc. while the async action runs

### States / Conditional UI
- 9 possible deal statuses, each color-coded (negotiating=amber, agreed=blue, delivered=purple, revision=orange, approved=green, paid=emerald, complete=grey, declined=red, cancelled=grey)
- `canReview = (status === 'delivered' || status === 'revision') && hasItems` — determines whether ItemReview (interactive) or read-only item list is shown
- Deliverables section hidden entirely when no `deal_deliverable_items` rows exist
- Legacy deliverables text shown in Deal Terms when no structured items exist
- Shipment card hidden for `negotiating`, `declined`, `cancelled` deals and when `requires_shipment = false`
- Posted block hidden when `is_posted = false` (shows "awaiting" text for approved/paid/complete)
- Invoice card hidden when no invoice row exists
- Brief panel hidden when no brief content exists

### Empty states
- No events in timeline: "No events recorded yet."
- No messages in chat: "No messages yet — start the conversation."
- Deal not found / not owned by this brand: Next.js 404

---

## Screen 4 (continued): Deal Detail (Creator Side)

**File:** `apps/web/app/creator/deals/[id]/page.tsx`

### Layout / Structure
Max-width-900 main element. Back link, then header (title, deal_ref, status, brand name). Then: brief panel, terms card, accept/decline block, deliverable items section, invoice card, shipment info, posted card (or posted confirmation), and chat thread button. `RealtimeDealListener` mounted for live updates.

### Sections (top to bottom)
1. Back navigation
2. Header (title, deal_ref, status badge, brand name)
3. Brief panel (always-expanded, conditional)
4. Terms card (deal terms, always shown)
5. Accept / Decline block (conditional — only when status = `negotiating`)
6. Deliverable Items section (structured or legacy)
7. Invoice card (conditional — when status is `approved`, `paid`, or `complete`)
8. Product Shipment info (read-only, conditional)
9. Posted card / Posted confirmation
10. Chat thread button (always shown, at bottom)

### Fields / Data shown

**Back link:** "My deals" to `/creator/deals`

**Header**
- H1: deal title (or "Untitled deal")
- `deal_ref` monospace tag (conditional)
- Status badge: shows raw `deal.status` value, color-coded (negotiating=blue, agreed=green, delivered=yellow, revision=orange, approved=green, paid=emerald, complete=grey, declined=red, cancelled=grey)
- "from [brand name]" subtitle

**Brief panel** (conditional — only if pitch or guidelines exist at deal or campaign level; always fully expanded, not collapsible)
- Label: "Campaign Brief" (if from campaign) or "Brief"
- Campaign name (if from campaign)
- Sub-section "PITCH" with pitch text (conditional)
- Sub-section "CREATIVE GUIDELINES" with guidelines text (conditional)

**Terms card** (always shown)
- Section title: "Offer Terms" (when status = `negotiating`) or "Agreed Terms" (all other statuses)
- "Agreed on [date]" (green, conditional — shown when `agreed_at` is non-null)
- Terms grid:
  - Deliverables: if structured items exist — per-item list with label, platform, @handle, reel type badge, boosting badge, per-item price; else — `deal.deliverables` text
  - "You receive": creator's net payout
    - Simple: amount label+value when fee is `on_top` (fee is invisible to creator)
    - With breakdown: base amount - platform fee (N%) +/- overage (conditional — when fee is `deducted` or overage exists)
  - Delivery by: formatted date (conditional)
  - Revisions: "N / M" (used / limit)
  - Per extra revision: amount (conditional — if `price_per_extra_revision_paise > 0`)
  - Amount owed: overage calculation (conditional — if over limit AND extra revision price > 0)
  - Usage rights text (conditional)
  - Usage rights expire date (conditional)
  - Rights confirmed timestamp (conditional)
  - Payment terms text (conditional)
  - "Product shipment — The brand will ship a product to you" (conditional — if `requires_shipment = true`)

**Accept / Decline block** — `AcceptDecline` component (conditional — only when status = `negotiating`)
- Header: "Respond to this offer"
- Sub-text: "Review the terms above, then accept or decline."
- Primary state (two buttons side by side):
  - "Accept offer" (green pill, full-width flex)
  - "Decline" (white/red outline pill)
- Declining state (shown after clicking "Decline"):
  - "Reason (optional)" textarea: "Let the brand know why..."
  - "Confirm decline" button (red)
  - "Cancel" button
- Success states (replaces the component):
  - Accepted: green box — "Deal accepted / You can now start working on the deliverables."
  - Declined: red box — "Deal declined / The brand has been notified."

**Deliverables section** — `DeliverableItems` component (shown when structured items exist) or legacy fallback

- **Structured items** (`DeliverableItems`):
  - Progress bar: green fill, "N of M" count
  - Per item card:
    - Label, platform, @handle
    - Status badge (with version number if v > 1): pending / submitted / revision / approved
    - Revision feedback box (conditional — shown when `item_status = 'revision'` AND `revision_note` is non-null): orange box with "REVISION FEEDBACK" label and the brand's note text
    - Submitted content (for submitted/approved items): external URL link OR uploaded file name + "uploaded" badge + "View file" button
    - Input controls (for pending/revision items when `canSubmit = true`):
      - Mode toggle: [Paste link] [Upload file] (pill tabs)
      - **Link mode**: URL input + "Save" button
      - **Upload mode**: "Choose file" button (hidden file input, accepted: video/mp4, quicktime, webm, avi, jpeg, png, webp, gif, pdf, mp3, wav, m4a, zip — max 50MB) + "Video, image, PDF, audio, or ZIP. Max 50MB." hint
      - Upload progress bar: animated fill + "Uploading... N%" text
  - Submit all CTA box (conditional — shown when `canSubmit = true` AND all items have been saved/submitted):
    - "All deliverables ready"
    - "Review your submissions above, then submit for brand review."
    - "Submit all for review" button (green pill)
  - Pending hint (conditional — shown when `canSubmit = true` AND some items still need content):
    - "N item(s) still need a link or upload before you can submit for review."
  - Success state (after submission): "Submitted for review / The brand has been notified and will review your work."

- **Legacy deliverables** (when no structured items exist — for old deals):
  - List of past submissions (each: version number, optional note, date, external URL link)
  - Empty state: "No deliverables submitted yet."
  - `SubmitDeliverable` component (conditional — when `canSubmit = true` and no structured items)

**Invoice card** — `InvoiceCard` component (conditional — only when status is `approved`, `paid`, or `complete`)
- **No invoice + not posted state:**
  - "Invoice" title
  - "Post your content first, then generate an invoice for payment."
  - Warning: "Mark the content as posted before invoicing" (amber)
- **No invoice + posted state:**
  - "Invoice" title
  - "Your content is posted and approved. Generate an invoice to send to the brand for payment."
  - "Generate invoice" button
- **Invoice exists:**
  - Title: "Invoice [deal_ref]" + status badge (draft / issued / accepted / paid / overdue)
  - Line items:
    - Deliverables: amount
    - Revision overage: amount (conditional)
    - Platform fee (N%) deducted: -amount (conditional — only shown to creator when `fee_mode = 'deducted'`)
    - Divider
    - You receive: amount (bold)
  - Payment terms (conditional)
  - Due date status text (conditional, colored)
  - Issued date (conditional)
  - Accepted date (conditional)
  - Status-dependent action / status text:
    - `draft`: "Issue to brand" button
    - `issued`: "Waiting for brand to accept" (amber text)
    - `accepted`: "Invoice accepted — awaiting payment" (green text)
    - `paid`: "Paid — X received" (dark green text)

**Product Shipment info** (read-only, conditional — when `requires_shipment = true` AND `shipment_status` is non-null AND status is not `negotiating`, `declined`, `cancelled`)
- Section title: "Product Shipment"
- **Pending state:** "The brand will ship the product to you."
- **Shipped state:**
  - "Product shipped on [date]" (blue)
  - "Track shipment" link (conditional)
  - Carrier note (conditional)
  - "You can start recording once your product arrives." hint (conditional — only when `canSubmit = true`)
- **Delivered state:**
  - "Product delivered" (green)
  - Tracking link (conditional)

**Posted card** — `PostedCard` component (conditional — shown when status is `approved`, `paid`, or `complete` AND `is_posted = false`)
- Section title: "Content Posted?"
- "Once your content is live, paste the post URL below."
- URL input: "https://instagram.com/reel/..."
- "Post" button (disabled when input is empty or loading)
- Error text (conditional)
- Success state: "Marked as posted! The brand has been notified."

**Posted confirmation block** (conditional — shown when `is_posted = true` AND `posted_url` is non-null)
- "CONTENT POSTED" label (green)
- Live URL link (truncated to 60 chars)
- "Posted [date]" (conditional)

**Chat thread** — `CreatorThread` component (at bottom, always rendered)
- "Messages (N)" or "Message brand" CTA button
- Chat panel (360px wide, 480px tall, fixed bottom-right, same behavior as brand-side DealThread):
  - Header: "Messages" + close button
  - Message bubbles: creator messages right-aligned (dark/black), brand messages left-aligned (light grey) — labels are "You" / "Brand"
  - Empty state: "No messages yet — send a message to the brand."
  - Compose: emoji toggle + text input + "Send" button
  - Emoji picker (conditional): same 3 groups, 36 emojis
  - Terminal state notice: "This deal is [status] — messaging is closed." (for `complete`, `declined`, `cancelled`)
  - Realtime subscription; plays sound on new message

### Actions / Buttons
- "Accept offer": when status = `negotiating`
- "Decline": when status = `negotiating` — opens decline reason form
- "Confirm decline": in the decline form
- "Cancel" (in decline form): returns to Accept/Decline buttons
- Per-item "Save" (link mode): saves external URL for one deliverable item
- Per-item "Choose file" (upload mode): file picker for one deliverable item
- Per-item "View file": opens signed URL of uploaded file in new tab
- "Submit all for review": when all items have content and deal is `agreed`/`revision`
- "Generate invoice": when no invoice, deal is `approved`/`paid`/`complete`, and content is posted
- "Issue to brand": when invoice status is `draft`
- "Post" (PostedCard): saves live content URL
- "Message brand" / "Messages (N)": opens chat panel

### States / Conditional UI
- `canSubmit = (deal.status === 'agreed' || deal.status === 'revision')` — controls all deliverable input controls
- `hasStructuredItems = items && items.length > 0` — determines whether structured DeliverableItems or legacy SubmitDeliverable is shown
- Invoice card only appears at `approved`, `paid`, or `complete`
- PostedCard only appears at `approved`, `paid`, or `complete` when `is_posted = false`
- Invoice gate: if not posted — blocked with "Mark content as posted" warning; if posted — "Generate invoice" button shown

### Empty states
- No messages in chat: "No messages yet — send a message to the brand."
- No deliverables yet (legacy path): "No deliverables submitted yet."
- Deal not found / not owned by this creator: Next.js 404

---

## Screen 5: Notifications

**Files:** `apps/web/app/notifications/page.tsx` (brand) + `apps/web/app/creator/notifications/page.tsx` (creator) + shared `NotificationFeed` component

### Layout / Structure
Full-page view, max-width 900px, centered, with responsive horizontal padding. Wrapped inside `BrandNav` (brand side) or `CreatorSidebar` (creator side). The same `NotificationFeed` component is reused for both.

### Sections (top to bottom)
1. Page header block
2. "Mark all as read" control (conditional)
3. Notification list (vertical stack of rows, 0.375rem gap)
4. Empty state (shown when list is empty)

### Fields / Data Shown

**Page header:**
- Page title: "Notifications" (h1, 1.375rem, bold)
- Subtitle line: either "X unread" (count of items with no `read_at`) or "All caught up" (if unread count is 0)

**Per notification row (clickable link):**
- `body` — the notification message text (free text, wraps to multiple lines)
- `created_at` — displayed as a relative time string:
  - "just now" (< 1 min)
  - "Xm ago" (< 1 hr)
  - "Xh ago" (< 24 hrs)
  - "Xd ago" (< 7 days)
  - Formatted date: "D Mon" (7+ days), using `en-IN` locale
- Unread indicator dot (8x8px black circle, right-aligned) — only on unread items
- Body text weight: bold (600) for unread, normal (400) for read

**Visual unread state per row:**
- Background: `#f8f9ff` (unread) vs `#fff` (read)
- Left border: 3px solid `#111` (unread) vs 3px solid transparent (read)
- Opacity: 0.6 when the mark-read transition is in progress

**Data queried:** `id`, `deal_id`, `type`, `body`, `read_at`, `created_at` — up to 100 notifications, ordered newest first

### Actions / Buttons (with conditions)
1. "Mark all as read" button — appears only when `unreadCount > 0`. Label changes to "Marking..." while in flight. Disabled while pending.
2. Notification row (clickable link) — navigates to `/deals/{deal_id}` (brand) or `/creator/deals/{deal_id}` (creator) if `deal_id` is not null. On click: if unread, fires `markNotificationRead(id)` server action.

### States / Conditional UI

| State | What is shown |
|---|---|
| List has items, some unread | "Mark all as read" button appears above list |
| List has items, all read | No "Mark all as read" button |
| Row is unread | Blue-tinted background, left black border, bold text, dot indicator |
| Row is read | White background, no left border, normal-weight text, no dot |
| Mark-read action in flight | Row opacity drops to 0.6 |
| Mark-all-read in flight | Button shows "Marking..." and is disabled |

### Empty State
- Bell icon SVG (40x40, light gray stroke)
- Heading: "No notifications yet"
- Subtext: "When something happens on your deals, you'll see it here."
- Displayed inside a centered card with border, large padding

---

## Screen 6: Messaging / Deal Thread

### Layout / Structure
The thread does **not** have a dedicated page. It is a **floating chat panel** (position: fixed, bottom-right) rendered within the deal detail page on both brand and creator sides.
- Panel dimensions: 380x520px (brand), 360x480px (creator). Max-width `calc(100vw - 32px)`, max-height `calc(100vh - 32px)`.
- Panel is hidden (scale 0.95, opacity 0, visibility hidden) until the trigger button is clicked, then animates open (scale 1, opacity 1).
- `Escape` key closes the panel; also closes the emoji picker first if it is open.

### Sections (top to bottom)
1. Trigger button (floats in the page, not inside the panel)
2. Panel header
3. Messages area (scrollable, flex: 1)
4. Emoji picker (conditional, slides in above compose form)
5. Compose area (fixed at bottom of panel)

### Fields / Data Shown

**Trigger button:**
- Chat bubble icon (SVG)
- Label: "Messages (N)" if messages exist, otherwise "Start conversation" (brand) / "Message brand" (creator)

**Panel header:**
- Title: "Messages" (h2)
- Close (x) button

**Message bubbles (per message):**
- Sender label: "You" for own messages, "Creator" (brand side) or "Brand" (creator side) for other party
- Message body: `msg.body` — free-form text, pre-wrap, word-break
- Timestamp: `created_at` formatted as "D Mon, HH:MM" using `en-IN` locale
- Bubble alignment: own messages right-aligned, other party's left-aligned
- Visual style: own = dark bg + white text; other = light bg + border

**Realtime:** subscribes via Supabase realtime. New messages from the other party appear in real time; a sound effect plays on receipt. Own sent messages are added optimistically and deduped by ID.

### Actions / Buttons (with conditions)
1. Open panel button — always visible on the deal page
2. Close (x) button — inside panel header
3. Emoji picker toggle button — smiley face SVG, inside compose form
4. Emoji buttons — 36 emojis across 3 groups (Smileys x12, Gestures x12, Objects x12). Clicking appends emoji to input
5. Text input — placeholder "Type a message...", autofocuses when panel opens, disabled while sending
6. "Send" button — disabled when input is empty or while sending. Label changes to "..." while in flight
7. Error message — appears below compose form if send fails

### States / Conditional UI

| State | What is shown |
|---|---|
| Panel closed | Only trigger button visible |
| Panel open, no messages | Empty state text in messages area |
| Panel open, has messages | Message list, auto-scrolls to bottom |
| Message sending in flight | Send button shows "..." and is disabled; input is disabled |
| Send failed | Error text below compose form |
| Emoji picker open | Emoji tray above compose form; closes on outside click or Escape |
| Deal is terminal (complete / declined / cancelled) | Compose form replaced by closed notice text; no input or send button |

### Empty State (within panel)
- Brand side: "No messages yet — start the conversation."
- Creator side: "No messages yet — send a message to the brand."

### Terminal State Notice
- "This deal is [status] — messaging is closed."
- No input field, no send button, no emoji toggle

---

## Screen 7: Deliverable Review (Brand Side)

### Layout / Structure
This is a **section within** the brand deal detail page (`/deals/[id]`), not a standalone page. It appears as the "Review Deliverables" section when `deal.status` is `delivered` or `revision`. Rendered via the `ItemReview` component.

### Sections (top to bottom)
1. Progress bar + reviewed count
2. Revision count display
3. Deliverable item cards (one per item)
4. Revision limit warning banners (conditional)
5. Error message (conditional)
6. Success state (replaces everything when all items are approved)

### Fields / Data Shown

**Progress bar:**
- Thin bar (5px height) showing `reviewed / total` proportion (green fill)
- Count label: "X of Y reviewed" (reviewed = items with status `approved` or `revision`)

**Revision counter:**
- Text: "Revisions: X / Y used" (X = `revisions_used`, Y = `revision_limit`)

**Per deliverable item card:**

| Field | Notes |
|---|---|
| `label` | Item name, bold |
| `platform` | Platform name |
| `handle` | Creator handle (prefixed with `@` if missing) |
| `reel_type` badge | "Collab" or "Non-collab" pill, only if set |
| `boosting_rights` badge | "Boosting Xmo" or "Boosting unlimited" pill (blue), only if true |
| `price_paise` | Per-item price in INR (monospace), only if > 0 |
| Status badge | Pill showing current status; colored (pending=gray, submitted=yellow, revision=orange, approved=green) |
| Version indicator | Appended to status badge as `v2`, `v3` etc. if `version > 1` |
| External URL | Clickable link (truncated), shown for submitted/revision items |
| Uploaded file | Filename text + "View file" button, shown when `storage_path` and `file_name` are set |

**Revision feedback form (per item, conditional):**
- Textarea — placeholder: "What needs to change? e.g. at 0:14 fix the transition, increase brightness, change music..."
- 3 rows, resizable vertically

### Actions / Buttons (with conditions)

All action buttons appear **only on items with `item_status === 'submitted'`**:

1. "Approve" button — approves the individual item. If approving the last submitted item, the deal transitions `delivered -> approved` automatically
2. "Request Revision" button — opens the inline revision feedback form. Outlined orange/red style
3. "Send revision request" button (inside form) — submits revision notes. If `deal.status === 'delivered'`, atomically transitions deal to `revision` and increments `revisions_used`
4. "Cancel" button (inside form) — closes the revision form without sending
5. "View file" button — appears on items with `storage_path`. Fetches signed URL and opens file in new tab

### States / Conditional UI

| State | Behavior |
|---|---|
| Item is `pending` | No actions, no links shown |
| Item is `submitted` | Approve + Request Revision buttons shown |
| Item is `revision` | No action buttons (brand has already acted) |
| Item is `approved` | No action buttons; green badge |
| Revision form open | Textarea + buttons replace the action row |
| All items approved (success) | Full component replaced by green success box |
| `isLastIncluded` | Subtle gray reminder: "This is the final revision included in the agreed terms." |
| `isBeyondLimit` | Yellow warning: "Beyond revision limit (X/Y used)" + optional per-extra price |

---

## Screen 8: Invoice

Invoices appear as **cards within deal detail pages**, not as standalone screens. The same invoice data powers both views but the fields shown and actions available differ by role.

### Screen 8A: Invoice — Brand Side (`BrandInvoiceCard`)

Location: `/deals/[id]` — rendered as a card when `invoice` is non-null.

#### Sections (top to bottom)
1. Card header row (title + status badge)
2. Line items table
3. Payment terms + due date
4. Timestamps (issued at, accepted at)
5. Error message (conditional)
6. Action button (conditional on invoice status)
7. Paid confirmation text (conditional)

#### Fields / Data Shown

**Card header:**
- Label: "Invoice" + `deal_ref` in monospace if present
- Status badge (pill): draft=gray, issued=yellow, accepted=green, paid=dark green, overdue=red

**Line items:**

| Row label | Value | Condition |
|---|---|---|
| "Deliverables" | base amount | Always |
| "Revision overage" | overage amount | Only if > 0 |
| Platform fee | fee amount with percent and mode | Only if > 0 |
| "You pay" | brand total (bold) | Always |
| "Creator receives" | creator net (bold) | Always |

**Payment info:**
- Payment terms text (conditional)
- Due date status: green if not overdue, red if overdue (conditional)
- Issued date (conditional)
- Accepted date (conditional)

#### Actions / Buttons

| Invoice status | Action |
|---|---|
| `issued` | "Accept invoice" button |
| `accepted` | "Pay X" button (green) |
| `paid` | "Paid — deal complete" text |

---

### Screen 8B: Invoice — Creator Side (`InvoiceCard`)

Location: `/creator/deals/[id]` — shown when deal status is `approved`, `paid`, or `complete`.

#### Pre-invoice states (no invoice yet):

- If `isPosted === false`:
  - "Post your content first, then generate an invoice for payment."
  - Warning pill: "Mark the content as posted before invoicing"
  - No button

- If `isPosted === true`:
  - "Your content is posted and approved. Generate an invoice."
  - "Generate invoice" button

#### Invoice exists — Line items (creator-specific):

| Row label | Value | Condition |
|---|---|---|
| "Deliverables" | base amount | Always |
| "Revision overage" | overage amount | Only if > 0 |
| Platform fee | -fee amount with percent | Only if > 0 AND `fee_mode === 'deducted'` |
| "You receive" | creator net (bold) | Always |

Note: on-top fees are invisible to creator — brand absorbs them.

#### Actions / Buttons

| Invoice status | Action |
|---|---|
| No invoice + posted | "Generate invoice" button |
| `draft` | "Issue to brand" button |
| `issued` | "Waiting for brand to accept" (amber text) |
| `accepted` | "Invoice accepted — awaiting payment" (green text) |
| `paid` | "Paid — X received" (dark green text) |

#### Invoice workflow sequence (full two-sided flow):

```
Deal status: approved
  -> Creator: content posted (PostedCard -> markPosted)
  -> Creator: "Generate invoice" -> invoice created as draft
  -> Creator: "Issue to brand" -> invoice status: issued -> brand notified
  -> Brand: "Accept invoice" -> invoice status: accepted, due_date set
  -> Brand: "Pay X" -> invoice status: paid, deal status: paid -> complete
  -> Creator: sees "Paid — X received"
```

---

## Screen 9: Creator Payments / Earnings

**Route:** `/creator/payments`
**File:** `apps/web/app/creator/payments/page.tsx`

### Layout / Structure
Fixed left sidebar (`CreatorSidebar`) + scrollable main content area. Max content width 900px, centered.

### Sections (top to bottom)
1. Page header
2. Summary stat cards (2-column grid)
3. Pending payments list (conditional — only shown when pending invoices exist)
4. Payment history list (always shown)

### Fields / Data Shown

**Page Header**
- Title: "Payments" (h1)
- Subtitle: "Your earnings and payment status"

**Summary Cards (2-column grid)**
- Card 1 — Total earned: sum of `creator_receives_paise` on invoices with `status = 'paid'`. Green background.
- Card 2 — Pending: sum of `creator_receives_paise` on invoices with `status = 'accepted'`, plus count shown inline in label ("Pending (3)").

**Pending Payments Section** (section label: "PENDING PAYMENTS" — uppercase)
Each pending invoice row (clickable link to `/creator/deals/[deal_id]`):
- Deal title (truncated with ellipsis)
- Brand name (sub-line in grey)
- Amount in rupees (right-aligned, bold monospace)
- Status badge: derived from `deriveDisplayStatus`
- Due date: "Due 15 Jan" (shown only when `due_date` is present)

**Payment History Section** (section label: "PAYMENT HISTORY" — uppercase)
All invoices, ordered newest-first. Each row (clickable link to `/creator/deals/[deal_id]`):
- Deal title (truncated)
- Brand name
- Amount in rupees (bold monospace)
- Status badge: derived display status
- Date line — conditional by invoice status:
  - `paid`: "Paid 12 Jan 2026" (includes year)
  - `accepted`: "Due 20 Feb" (no year)
  - `issued`: "Issued 10 Jan" (no year)

### Actions / Buttons
- Every invoice row is a link navigating to `/creator/deals/[deal_id]` — always active, the entire row is clickable
- No other buttons or actions on this page

### States / Conditional UI
- Error state: if Supabase query returns error — red error text, nothing else rendered
- Pending section visible only when `invoices.filter(status === 'accepted').length > 0`
- Pending count in label only when `pendingInvoices.length > 0`
- Date sub-line conditionally rendered per status
- Amount formatting: smart rupee shortening (Cr / L / K / exact)

### Empty States
- No payments yet (when `all.length === 0`): centered card — "No payments yet" + "When a deal is approved and invoiced, payment status will appear here."
- Pending section simply does not render if no pending invoices

---

## Screen 10: Brand Dashboard

### Screen 10A: Brand Dashboard (`/dashboard`)

**File:** `apps/web/app/dashboard/page.tsx`

#### Layout / Structure
Fixed left sidebar (`BrandSidebar`) + scrollable main content area. Max width `var(--container-width, 1080px)`. `RealtimeDashboardListener` mounted for live updates.

#### Sections (top to bottom)
1. Page heading
2. "Needs Attention" alert cards (conditional)
3. Stat cards row (5 cards)
4. "Deals by Status" bar chart (conditional)
5. "Top Creators" list (conditional)

#### Fields / Data Shown

**Page Heading:** "Dashboard" (h1)

**Needs Attention Cards** (flex row, wrapping)
Up to 3 attention cards, each is a link to `/deals`:
- "Invoices to review" — count of deals where derived status = 'invoice to accept'. Yellow/amber styling.
- "Overdue" — count of overdue deals + total overdue amount. Red styling.
- "Payments due" — count + total amount. Yellow/amber styling.
Each card: large count number, label text, optional total amount beneath.

**Stat Cards (5-card auto-fit grid, min 160px)**
1. Active deals — count in statuses: negotiating, agreed, delivered, revision, approved
2. Completed — count in complete, paid
3. Posted — "X of Y" (Y = deals in approved/paid/complete, X = those with `is_posted = true`)
4. Total deals — total non-cancelled, non-declined
5. Budget spent — sum of `brand_pays_paise` on paid invoices

**Deals by Status Bar** (section label: "DEALS BY STATUS")
Proportional horizontal segmented bar (height 28px):
- Segments: Active (blue), Completed (green), Payment due (yellow)
- Only segments with count > 0 shown
- Each shows its count as white text inside
- Legend with colored squares below

**Top Creators List** (section label: "TOP CREATORS", up to 5)
Each row:
- Avatar: profile photo or initials fallback (2-letter, grey box)
- Creator name (bold)
- Sub-line: "X deal(s) . Y" (deal count + total price)
- "Re-engage" button (right-aligned, black pill) to `/deals/new?from=[latestDealId]`

#### Actions / Buttons
- Attention cards — links to `/deals` (conditional per card type)
- "Re-engage" button on each top creator row
- "Browse creators" button — only in empty state, links to `/browse`

#### Empty State
When `totalDeals === 0`:
- "Start your first deal" + "Browse vetted creators and send your first offer."
- "Browse creators" button (links to `/browse`)

---

### Screen 10B: Brand Deals List (`/deals`)

**Files:** `apps/web/app/deals/page.tsx` + `DealsTable.tsx`

#### Layout / Structure
Same sidebar + main layout. Two render modes: desktop table (>768px) and mobile cards (<768px).

#### Sections (top to bottom)
1. Page header (title + count + "+ New Deal" CTA)
2. Search bar
3. Status filter pills
4. Posted sub-filter (conditional)
5. Deals list (table or cards)
6. Pagination (conditional)
7. Footer count

#### Fields / Data Shown

**Page Header**
- "Your Deals" (h1)
- Count line: "X deal(s)" + optional search/filter qualifiers
- "+ New Deal" button (top-right, links to `/browse`)

**Search Bar**
- Placeholder: "Search by ref, title, or deliverables..."
- Live search with 300ms debounce
- Clear (x) button when text present

**Status Filter Pills**
Pills: All, negotiating, agreed, delivered, revision, approved, paid, complete, declined, cancelled
- Active pill: dark bg + bold; inactive: grey/light

**Posted Sub-Filter** (shown only when completed deals exist on current page)
Row of 3 pills: "All (N)", "Posted (N)", "Awaiting (N)"

**Desktop Table Columns:** Ref, Creator, Title, Deliverables, Price, Status, Created, (actions)
- Ref: `deal_ref` monospace (em-dash if null)
- Creator: thumbnail (28x28) or initials + full name
- Title: truncated
- Deliverables: truncated text
- Price: `brand_pays_paise` with fee + overage
- Status: derived display status badge + optional due date + optional "Posted"/"Awaiting post" badge
- Created: formatted date
- Actions: "View details" link to `/deals/[id]`

**Mobile Card:** Creator thumbnail + title + deal_ref + status badge + posted badge + deliverables + price + date. Full row is a link.

**Pagination:** "Prev" / "Page X of Y" / "Next" (when totalPages > 1)

**Footer:** "Showing X of Y deals"

#### Empty States
- No deals at all: "No deals yet" + "Browse creators and start your first deal." + "Browse creators" link
- No deals matching filter: "No deals match this filter."

---

### Screen 10C: Campaigns List (`/campaigns`)

**File:** `apps/web/app/campaigns/page.tsx`

#### Sections (top to bottom)
1. Page header ("Campaigns" + count + "New Campaign" button)
2. Campaign cards list

#### Fields / Data Shown per Campaign Card (link to `/campaigns/[id]`)
- Campaign name (bold)
- Description (optional, truncated)
- Status badge: active (green), completed (grey), archived (grey)
- Rollup stats:
  - Deal count: "X deal(s)"
  - Committed: sum of `price_paise` for non-declined/cancelled deals (conditional if > 0)
  - Paid: sum of `brand_pays_paise` on paid invoices (green, conditional if > 0)
  - Created date

#### Empty State
- "No campaigns yet" + "Create a campaign to group related deals together."

---

## Screen 11: Creator Dashboard

### Screen 11A: Creator Dashboard (`/creator/dashboard`)

**File:** `apps/web/app/creator/dashboard/page.tsx`

#### Layout / Structure
Fixed left sidebar (`CreatorSidebar`) + main content area. Max width 900px. `RealtimeDashboardListener` mounted.

If the creator is NOT vetted, the layout intercepts and shows a vetting gate screen instead.

#### Sections (top to bottom)
1. Page heading
2. Storefront card (always present, 3 possible states)
3. "Needs Attention" grid (conditional — 4 possible cards in 2-column grid)
4. Earnings stat cards (2-column grid)
5. Deal stat cards (2-column grid)
6. "Brands you've worked with" list (conditional)

#### Fields / Data Shown

**Page Heading:** "Dashboard" (h1)

**Storefront Card — 3 states:**
1. **No storefront** (slug is null): link to `/creator/storefront`. Icon (house, purple). "Set up your Storefront" + "A public page where brands can discover your work and send you offers". Chevron icon.
2. **Exists but not published**: "Your Storefront isn't live yet" + "Finish setting up and publish to start receiving pitches". "Edit" button. Amber background.
3. **Published**: "Storefront is live" + full URL `guapd.com/c/[slug]` in monospace green. Three buttons: "Copy link" (toggles to "Copied!" for 2s), "View" (opens in new tab), "Edit". Green background.

**Needs Attention Grid** (2-column, conditional)
Up to 4 cards, each links to `/creator/deals`:
1. "Offers to respond" — count of `negotiating` deals where `last_offer_by = 'brand'`. Blue styling.
2. "Deliverables / revisions" or "Deliverables to submit" — count of `agreed` + `revision` deals. Yellow styling.
3. "Invoices to issue" — count of `approved` deals with no invoice. Orange styling.
4. "Payments incoming" — count of accepted invoices + total amount. Green styling.

**Earnings Stat Cards (2-column)**
1. "Total earned" — sum of paid invoice `creator_receives_paise`. Green highlight.
2. "Pending" — sum of accepted invoice `creator_receives_paise`.

**Deal Stat Cards (2-column)**
3. "Active deals" — count in negotiating, agreed, delivered, revision, approved
4. "Completed" — count in complete, paid

**Brands you've worked with** (up to 5, sorted by deal count desc)
- Brand name (bold)
- Sub-line: "X deal(s) . Y earned" (earned part only when > 0)

#### Vetting Gate States
- Unvetted + not rejected: "Your account is under review" + "We'll notify you when you're approved. This usually takes 24-48 hours."
- Unvetted + rejected: "Your application wasn't approved this time" + "Reach out to us and we'd love to reconsider."

#### Empty State
When `allDeals.length === 0`: "Your deals will appear here" + "When a brand sends you an offer, you'll see it on your dashboard. Make sure your profile and rate card are complete."

---

### Screen 11B: Creator Deals List (`/creator/deals`)

**Files:** `apps/web/app/creator/deals/page.tsx` + `CreatorDealsTable.tsx`

#### Layout / Structure
Same sidebar as creator dashboard. Main content is a glassmorphism card container (backdrop blur, semi-transparent). No pagination — all deals loaded at once.

#### Sections (top to bottom)
1. Header (title + total count + total value + animated mascot)
2. Controls row (search + sort dropdown)
3. Status tabs (horizontal scrollable)
4. Grouped deal list (or empty filter state)
5. Footer count

#### Fields / Data Shown

**Header**
- "My Deals" (h1, large responsive font)
- Sub-line: "X deals . Y shown" (X = total, Y = sum of `price_paise` filtered)
- Animated Guapd mascot (SVG, lime-green, bobbing CSS animation, top-right)

**Controls Row**
- Search input: "Search deals by title or brand", client-side, clear button
- Sort dropdown: Newest first (default), Oldest first, Price high-low, Price low-high, By status

**Status Tabs** (scrollable, tabs hidden if count = 0 except "All")
Tabs: All (excludes declined), Agreed, Delivered, Revision, Approved, Complete, Declined, Posted, Awaiting post
- Active tab: white bg, shadow, solid border

**Deal Groups** (only when filter = "All" and no search text)
- "Needs your attention" group — deals where status is `agreed, revision, delivered` OR `approved/complete/paid` with `is_posted = false`. Green dot indicator.
- "Wrapped & other" group — remaining deals

When a filter is active or search has text: no grouping, flat list.

**Deal Row** (each row is a link to `/creator/deals/[id]`)
- Brand avatar: 34x34px rounded square, gradient background (10 distinct hash-assigned gradients) with 2-letter initials
- Deal title (bold, truncated)
- Deal ref (monospace, conditional)
- Status pill (color-coded per status):
  - negotiating=amber, agreed=blue, delivered=teal, revision=amber, approved=purple, complete/paid=green, declined=red, cancelled=grey
  - "Awaiting post" override when `approved/complete/paid` + `is_posted = false`
- Meta line: Brand name + created date + platform icon + deliverable label (Instagram/YouTube icon derived from `deliverables` text)
- Price: formatted rupees (bold, conditional if > 0)
- Right-side element:
  - **Urgent rows** (agreed/revision/delivered/awaiting post): action pill with contextual label:
    - `agreed` -> "View deal"
    - `revision` -> "Resubmit"
    - `approved/complete/paid + not posted` -> "Upload post"
    - `complete + posted` -> "Send invoice"
    - `delivered` -> "Track"
  - **Non-urgent rows**: plain grey chevron icon

**Footer:** "Showing X of Y deals"

#### Empty States
- True empty (no deals): Animated mascot + "No deals yet" + "When a brand sends you an offer, it will appear here." No controls shown.
- Empty after filter/search: Animated mascot + "No deals in this status yet" + "Nothing matches this filter combination right now." Controls remain visible.
