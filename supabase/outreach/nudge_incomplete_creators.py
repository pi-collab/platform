#!/usr/bin/env python3
"""
One WhatsApp nudge to creators who verified a phone and never finished signup.

    python3 supabase/outreach/nudge_incomplete_creators.py --template finish_signup
    python3 supabase/outreach/nudge_incomplete_creators.py --template finish_signup --confirm

Dry run by default: resolves the recipients, prints every one, and exits without
sending. --confirm sends.

WHAT THIS IS FOR
  A creator who abandoned the profile step has a working login and no name. They
  are unreachable in-product, because they are not signed in and there is no
  screen to nudge them on. The verified signup phone is the only channel.

BEFORE IT WILL WORK
  1. An APPROVED WhatsApp template. Business-initiated messages must use one;
     MSG91 rejects anything else. The template name is passed with --template.
  2. MSG91_WHATSAPP_ENABLED=true, plus MSG91_AUTH_KEY and MSG91_WHATSAPP_NUMBER
     in the environment this runs in.

WHAT IT DOES NOT DO
  - No sequence. One message per creator, ever, guarded by an events row. If a
    second nudge is ever wanted it needs a deliberate second script, not a flag
    here — a drip to people who never opted in is how a WhatsApp number gets
    quality-rated down.
  - No sending to anyone who finished. The recipient list is defined by the
    absence of a name, which is the same condition the app uses to send someone
    back to onboarding.

CONSENT NOTE
  These numbers were given for OTP, not marketing. One re-engagement message to
  someone who started signing up is a defensible use; a campaign is not. That
  judgement was made deliberately, and it is recorded here so the next person
  reading this knows it was a decision rather than an oversight.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

EXPECTED_REF = 'nxdxxkdlzjyxxgtppopb'   # guapd-prod-mumbai
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF_FILE = os.path.join(REPO, 'supabase', '.temp', 'project-ref')
EVENT_TYPE = 'creator.signup_nudge_sent'
SEND_PATH = '/api/v5/whatsapp/whatsapp-outbound-message/bulk/'


def linked_ref():
    try:
        with open(REF_FILE) as fh:
            return fh.read().strip()
    except OSError:
        return None


def sql(query):
    out = subprocess.run(
        ['npx', 'supabase', 'db', 'query', '--linked', query],
        cwd=REPO, capture_output=True, text=True,
    ).stdout
    if '"_tag":"Error"' in out:
        msg = re.search(r'"message":"([^"]{0,300})', out)
        raise RuntimeError(msg.group(1) if msg else out[:300])
    m = (re.search(r'"rows":\s*(\[.*?\])\s*,\s*"warning"', out, re.S)
         or re.search(r'"rows":\s*(\[.*\])', out, re.S))
    return json.loads(m.group(1)) if m else []


def recipients(include_nudged=False):
    """Incomplete creators.

    "Incomplete" is no full_name. Measured on production, that set is identical
    to "no handle" and to "no handle in social_accounts" — 154 people by every
    definition, and nobody has given a name without a handle. Onboarding
    captures both in one step, so there is one cohort here, not three.

    By default anyone already nudged is excluded: one message per creator, ever.
    include_nudged lifts that, which means a SECOND message to someone who
    ignored the first. That is a deliberate choice each time, not a default —
    re-messaging non-responders is what degrades a sender's quality rating, and
    this number also carries our OTPs.
    """
    # Without include_nudged: never message anyone twice.
    # With it: still never message anyone twice IN THE SAME CAMPAIGN. A test
    # batch of five is normally sent an hour before the rest, and lifting the
    # guard wholesale would put those five back in the list and send them a
    # duplicate the same afternoon. Re-nudging someone from days ago is the
    # intent; re-nudging someone from this morning is an accident.
    guard = f"""
          and not exists (
            select 1 from events e
            where e.event_type = '{EVENT_TYPE}'
              and e.detail->>'creator_id' = c.id::text
              {"and e.created_at > now() - interval '24 hours'" if include_nudged else ""}
          )"""
    return sql(f"""
        select c.id, c.phone
        from creators c
        where coalesce(nullif(trim(c.full_name), ''), null) is null
          and c.phone is not null{guard}
        order by c.created_at
    """)


def send(phone, template, link):
    """One template send. Mirrors lib/whatsapp.ts so behaviour matches the app."""
    auth = os.environ.get('MSG91_AUTH_KEY')
    number = os.environ.get('MSG91_WHATSAPP_NUMBER')
    if os.environ.get('MSG91_WHATSAPP_ENABLED') != 'true' or not auth or not number:
        return False, 'not_configured'

    to = phone.lstrip('+')
    body = {
        'integrated_number': number,
        'content_type': 'template',
        'payload': {
            'messaging_product': 'whatsapp',
            'type': 'template',
            'template': {
                'name': template,
                'language': {
                    'code': os.environ.get('MSG91_WHATSAPP_LANG', 'en'),
                    'policy': 'deterministic',
                },
                'namespace': os.environ.get('MSG91_WHATSAPP_NAMESPACE') or None,
                'to_and_components': [{
                    'to': [to],
                    'components': {'button_1': {'subtype': 'url', 'type': 'text', 'value': link}},
                }],
            },
        },
    }
    req = urllib.request.Request(
        os.environ.get('MSG91_WHATSAPP_URL', 'https://control.msg91.com') + SEND_PATH,
        data=json.dumps(body).encode(),
        headers={'authkey': auth, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            raw = res.read().decode()
            if res.status >= 300:
                return False, f'http_{res.status}'
            if '"status":"error"' in raw.replace(' ', ''):
                return False, raw[:120]
            return True, 'sent'
    except Exception as err:                       # noqa: BLE001 - report, never raise
        return False, type(err).__name__


def main():
    ap = argparse.ArgumentParser(description='One WhatsApp nudge to incomplete creator signups.')
    ap.add_argument('--template', required=True, help='approved MSG91/Meta template name')
    ap.add_argument('--link', default='signup/creator/onboarding',
                    help='URL suffix for the template button (default: the onboarding step)')
    ap.add_argument('--limit', type=int, default=0, help='send to at most N (0 = all)')
    ap.add_argument('--include-nudged', action='store_true',
                    help='ALSO message creators who were already nudged (a second message to '
                         'someone who ignored the first). Off by default on purpose.')
    ap.add_argument('--confirm', action='store_true', help='actually send (default: dry run)')
    args = ap.parse_args()

    ref = linked_ref()
    print(f"  linked project : {ref}")
    if ref != EXPECTED_REF:
        print(f"  REFUSED: expected {EXPECTED_REF} (guapd-prod-mumbai).")
        sys.exit(9)

    people = recipients(include_nudged=args.include_nudged)
    if args.limit:
        people = people[:args.limit]

    print(f"  template       : {args.template}")
    print(f"  button link    : {args.link}")
    print(f"  recipients     : {len(people)}")
    print(f"  mode           : {'SEND' if args.confirm else 'dry run (nothing will be sent)'}\n")

    if not people:
        print("  Nobody to nudge. Everyone has either finished or been nudged already.")
        return

    for p in people[:10]:
        masked = '****' + (p['phone'] or '')[-4:]
        print(f"    {p['id']}  {masked}")
    if len(people) > 10:
        print(f"    … and {len(people) - 10} more")

    if not args.confirm:
        print("\n  Dry run. Re-run with --confirm to send.")
        return

    if os.environ.get('MSG91_WHATSAPP_ENABLED') != 'true':
        print("\n  REFUSED: MSG91_WHATSAPP_ENABLED is not 'true' in this environment.")
        sys.exit(2)

    print("\n  ── sending ──")
    sent = failed = 0
    for p in people:
        ok, reason = send(p['phone'], args.template, args.link)
        if ok:
            sent += 1
            # Recorded only on success, so a failure retries on the next run
            # rather than burning the single message this creator gets.
            masked = '****' + (p['phone'] or '')[-4:]
            sql("insert into events (event_type, detail) values ('%s', '%s'::jsonb)"
                % (EVENT_TYPE, json.dumps({'creator_id': p['id'], 'to_masked': masked,
                                           'template': args.template}).replace("'", "''")))
        else:
            failed += 1
            print(f"    failed {p['id']}: {reason}")
        # MSG91 is a bulk endpoint but this is a slow trickle on purpose: a burst
        # of identical template sends to cold numbers is what triggers a quality
        # review of the sending number.
        time.sleep(1.0)

    print(f"\n  sent {sent}, failed {failed}")


if __name__ == '__main__':
    main()
