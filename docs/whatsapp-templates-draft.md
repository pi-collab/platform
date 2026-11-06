# WhatsApp templates: drafts (NOT submitted)

Status 2026-11-06: drafts only. Do not submit to MSG91 or Meta until PJ says so.

## Consent check (why the opt-in ask is not on WhatsApp yet)

What creators agree to today:
- Signup screen: "By continuing, you agree to guapd's Terms and Privacy Policy."
- Onboarding: one required checkbox, "I agree to the Terms of Service and Privacy Policy".
- The Privacy Policy covers "sending notifications about your deals over WhatsApp, email and in the app" and login codes / deal notifications by WhatsApp and SMS (MSG91).
- There is NO marketing or product-update consent: no checkbox, no stored flag, no opt-out.

So a WhatsApp asking creators to switch on Guapd AI search is a promotional message they have not agreed to (and Meta would likely class it as Marketing, not Utility). The opt-in ask runs **in the app only** (creator home card + Settings) until a separate, optional "product updates on WhatsApp" consent exists and is recorded with a timestamp. Only creators who tick it would get template 1.

## 1. `guapd_ai_optin` (Marketing; blocked on consent)

Button: URL, dynamic. Base `https://guapd.com/{{1}}`, value `creator/settings?tab=connected&ai=1` (opens the switch).

EN:
> Hi {{1}}, brands on Guapd can now describe the creators they want and Guapd suggests matches. You only show up if you switch this on. Brands see your name, photo, handle, city, niches and numbers, never your phone number or email.
Button: **Switch it on**

HI:
> नमस्ते {{1}}, Guapd पर ब्रांड अब बता सकते हैं कि उन्हें कैसे क्रिएटर चाहिए, और Guapd मैच सुझाता है। आप तभी दिखेंगे जब आप इसे चालू करेंगे। ब्रांड आपका नाम, फ़ोटो, हैंडल, शहर, niche और नंबर देखते हैं, आपका फ़ोन नंबर या ईमेल कभी नहीं।
Button: **चालू करें**

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

## In-app copy (live on staging, `apps/web/lib/ai/opt-in-copy.ts`)

Creator home card:
- Title: Let brands find you with Guapd AI
- Body: Brands describe the creators they want, and Guapd suggests matches. You only show up if you switch this on.
- Small print: Brands see your name, photo, handle, city, niches, and your numbers (marked verified if your Instagram is connected). They never see your phone number or email.
- Button: Switch it on → `/creator/settings?tab=connected&ai=1`; × dismisses (per browser)

Settings switch "Show me in Guapd AI search": same body and the same "Brands see / Brands never see" lines.
