# WhatsApp templates: drafts (NOT submitted)

Status 2026-11-06: drafts only. Do not submit to MSG91 or Meta until PJ says so.

## Removed from the plan (PJ, 2026-11-06)

Guapd AI search now covers every creator visible on Browse, with no opt-in, so there is no opt-in ask to send. The former `guapd_ai_optin` template is dropped and was never submitted. Creators are told in the app instead (a one-time notice on the creator home).

Consent finding, kept for reference: creators agree only to the Terms of Service and Privacy Policy, which cover deal notifications and login codes over WhatsApp/SMS/email (with a WhatsApp notification opt-out, `notify_whatsapp`). There is no marketing or product-update consent, so any promotional WhatsApp would need one first.

## 2. `instagram_reconnect_verified` (Utility: an account problem)

Quotes the exact labels a brand sees on a result card when numbers are not verified: the badge **Not verified** and "N followers, **self-reported**" (`CARD_NOT_VERIFIED`, `CARD_SELF_REPORTED` in `apps/web/lib/ai/opt-in-copy.ts`; `scripts/test-creator-search.ts` checks this file still quotes them).

Button: URL, dynamic. Base `https://guapd.com/{{1}}`, value `creator/settings?tab=connected`.

EN:
> Hi {{1}}, Instagram has stopped sharing your numbers with Guapd. Until you reconnect, brands see your followers marked "Not verified" and "self-reported". Reconnect in one tap to show verified numbers again.
Button: **Reconnect Instagram**

HI:
> नमस्ते {{1}}, Instagram ने Guapd के साथ आपके नंबर शेयर करना बंद कर दिया है। जब तक आप दोबारा कनेक्ट नहीं करते, ब्रांड आपके फ़ॉलोअर्स के साथ "Not verified" और "self-reported" देखते हैं। verified नंबर फिर से दिखाने के लिए एक टैप में दोबारा कनेक्ट करें।
Button: **दोबारा कनेक्ट करें**

The existing approved `instagram_reconnect` template already covers this case; this version adds what brands see.

## In-app copy (live on staging, `apps/web/lib/ai/search-visibility-copy.ts`)

One-time notice on the creator home:
- Title: Brands can now find you through Guapd AI search
- Body: When a brand describes the creators they want, Guapd can suggest you. You can turn this off in Settings, under Connected accounts.
- Small print: Brands see your name, photo, handle, city, niches, and your numbers (marked verified if your Instagram is connected). They never see your phone number or email.
- Button: Open Settings → `/creator/settings?tab=connected&ai=1`; × dismisses it for good

Settings switch "Show me in Guapd AI search" (on by default):
- Under it: Brands use Guapd AI search to find creators for their briefs. Keep this on to be suggested.
- Turning it off asks first. "Hide you from Guapd AI search?" If you turn this off, you won't be suggested when brands search for creators with Guapd AI, so you may get fewer offers. Brands can still find you on Browse and open your profile, and your current deals carry on. You can turn it back on anytime. [Keep me visible] [Turn off]
