# WhatsApp templates: Instagram connection broke

Two templates to register in MSG91 and submit for Meta approval. Both are
**UTILITY** (an account service update about a connection the creator
themselves authorised), not MARKETING.

The code that sends them is `notifyCreatorInstagramBroken` in
`apps/web/lib/creator-whatsapp.ts`. Until both are approved, sends return not
ok and are recorded to `events` as `creator.instagram_whatsapp_failed`; the
email and the dashboard banner still reach the creator.

## The shape both templates must match exactly

- **exactly one body variable** — `{{1}}`, the creator's first name
- **one URL button** with a **dynamic suffix**, no other buttons
- no header, no media, no footer variable

This is not stylistic. `sendWhatsAppTemplate` sends `body_1` and a
`button_1` of subtype `url`, and MSG91 rejects the whole send when the
registered template declares a different set. The `status_update` template was
rejected twice for exactly this — once for passing a body var it did not
declare, once for passing a button param to a static button. A template
registered with two body vars, or with a static URL, will fail at send time
rather than at review.

---

## 1. `instagram_reconnect`

For `expired` and `needs_reconnect`: the token died or could not be refreshed.
Reconnecting is the whole fix.

**Category:** UTILITY · **Language:** en (must match `MSG91_WHATSAPP_LANG`)

**Body:**

```
Hi {{1}}, your Instagram connection needs a quick reconnect to keep your verified stats live on your storefront.
```

**Button:** Visit website · Dynamic

- Button text: `Reconnect Instagram`
- URL: `https://www.guapd.com/{{1}}`
- Sample suffix: `creator/settings`

**Sample values for review:** `{{1}}` = `Priya`, button suffix =
`creator/settings`

---

## 2. `instagram_personal_account`

For `personal_account`: the creator switched their Instagram to a Personal
account, so Instagram stopped returning insights.

**This needs to be its own template.** Sending the reconnect copy here tells
someone to do a thing that cannot work — reconnecting a Personal account
produces a Personal account again. They would follow the instruction, watch it
fail, and reasonably conclude the fault is ours. The code deliberately does not
fall back to template 1 for this case: if this template is unapproved, WhatsApp
is skipped and the email carries the message instead.

**Category:** UTILITY · **Language:** en

**Body:**

```
Hi {{1}}, your Instagram is set to a Personal account, so your verified stats have stopped updating. Switch back to a Business or Creator account in Instagram, then reconnect.
```

**Button:** Visit website · Dynamic

- Button text: `Reconnect Instagram`
- URL: `https://www.guapd.com/{{1}}`
- Sample suffix: `creator/settings`

**Sample values for review:** `{{1}}` = `Priya`, button suffix =
`creator/settings`

---

## Why the button points at `/creator/settings`

Not `/api/instagram/connect`. That route needs a live session, so anyone
tapping it from WhatsApp while logged out dead-ends on an error.
`/creator/settings` carries them through login and back, and already renders a
"Reconnect" button for every broken state (`ConnectedAccounts.tsx`).

## After approval

Nothing to deploy. The template names are already in the code
(`IG_RECONNECT_TEMPLATE`, `IG_PERSONAL_TEMPLATE`); approval is what makes the
existing sends start succeeding. Confirm with:

```sql
select event_type, detail, created_at
from events
where event_type like 'creator.instagram_whatsapp%'
order by created_at desc limit 20;
```
