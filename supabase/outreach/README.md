# Outreach

One-off, scoped messages to people the product cannot reach in-app.

## `nudge_incomplete_creators.py`

A single WhatsApp message to creators who verified a phone and never finished
the profile step. They have a working login and no name, so they are invisible
to every in-product surface — not signed in, and no screen to nudge them on.
The verified signup phone is the only channel that reaches them.

```bash
# 1. Confirm the link. The script refuses anything else.
cat supabase/.temp/project-ref        # must read nxdxxkdlzjyxxgtppopb

# 2. Dry run — resolves and prints recipients, sends nothing.
python3 supabase/outreach/nudge_incomplete_creators.py --template finish_signup

# 3. A few first. Prove the template renders before spending the whole list.
python3 supabase/outreach/nudge_incomplete_creators.py --template finish_signup --limit 5 --confirm

# 4. The rest.
python3 supabase/outreach/nudge_incomplete_creators.py --template finish_signup --confirm
```

## Prerequisites

**An approved WhatsApp template.** Business-initiated messages must use one;
MSG91 rejects anything else. This is the long pole — it is an approval queue,
not a code change. Pass its name with `--template`.

**Environment**, in the shell that runs it: `MSG91_WHATSAPP_ENABLED=true`,
`MSG91_AUTH_KEY`, `MSG91_WHATSAPP_NUMBER`. Optional: `MSG91_WHATSAPP_LANG`,
`MSG91_WHATSAPP_NAMESPACE`, `MSG91_WHATSAPP_URL`. The payload mirrors
`apps/web/lib/whatsapp.ts`, so behaviour matches what the app already sends.

## What it will not do

- **No second message.** Every send writes a `creator.signup_nudge_sent` event
  and the recipient query excludes anyone who has one. A repeat run reaches only
  people added since. A sequence would need a deliberate second script — a drip
  to people who never opted into WhatsApp is how a sending number gets
  quality-rated down.
- **No sending to anyone who finished.** Recipients are defined by the absence of
  a name, the same condition the app uses to route someone back to onboarding.
- **No burst.** One send per second. A rush of identical templates to cold
  numbers is what triggers a quality review.
- The event is written **only on success**, so a failure retries next run rather
  than burning the single message that creator gets.

## Consent

These numbers were given for OTP, not marketing. One re-engagement message to
someone who began signing up is a defensible use of it; a campaign is not. That
was a deliberate decision, recorded here so it reads as a choice rather than an
oversight. DPDP is in scope for this product — revisit if the scope of these
messages ever widens.
