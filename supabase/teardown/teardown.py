#!/usr/bin/env python3
"""
Remove named test accounts from PRODUCTION, leaving no orphans.

    python3 supabase/teardown/teardown.py --phone +9198… [--email a@b.com]
    python3 supabase/teardown/teardown.py --phone +9198… --confirm

Dry run by default: it resolves and prints everything it WOULD delete and exits
without touching anything. --confirm performs the deletion.

See README.md in this directory for the ordering rationale. The short version:
four foreign keys are RESTRICT/NO ACTION rather than CASCADE, so the order is
not optional — a plain `DELETE FROM creators` fails instead of tidying up. And
two things never cascade at all: the auth user, and uploaded files.

SAFETY
  - Refuses unless the linked project is EXPECTED_REF.
  - Scoped to accounts you name. No wildcards, no "all test accounts", no
    date ranges — nothing that could widen if run at the wrong moment.
  - Refuses if an identifier matches more than one creator or brand.
  - Prints every id before deleting.
"""
import argparse
import json
import os
import re
import subprocess
import sys

EXPECTED_REF = 'nxdxxkdlzjyxxgtppopb'   # guapd-prod-mumbai
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF_FILE = os.path.join(REPO, 'supabase', '.temp', 'project-ref')


# ── plumbing ────────────────────────────────────────────────────────────────

def linked_ref():
    try:
        with open(REF_FILE) as fh:
            return fh.read().strip()
    except OSError:
        return None


def sql(query):
    """Run one statement against the linked project and return its rows."""
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


def lit(values):
    """A SQL IN-list of quoted literals, or NULL when empty."""
    if not values:
        return "(NULL)"
    escaped = [str(v).replace("'", "''") for v in values]
    return "(" + ", ".join(f"'{e}'" for e in escaped) + ")"


# ── resolve ─────────────────────────────────────────────────────────────────

def resolve(phones, emails):
    """Find every id belonging to the named accounts, before anything is cut."""
    found = {k: [] for k in
             ('creator_ids', 'brand_ids', 'user_ids', 'auth_ids', 'deal_ids', 'item_ids')}

    if phones:
        found['creator_ids'] += [r['id'] for r in sql(
            f"select id from creators where phone in {lit(phones)}")]
        found['user_ids'] += [r['id'] for r in sql(
            f"select id from users where phone in {lit(phones)}")]
    if emails:
        found['user_ids'] += [r['id'] for r in sql(
            f"select id from users where lower(email) in {lit([e.lower() for e in emails])}")]
        found['brand_ids'] += [r['id'] for r in sql(
            f"select id from brands where lower(contact_email) in {lit([e.lower() for e in emails])}")]

    # A creator's profile row, and any brand this user is a member of.
    if found['user_ids']:
        found['creator_ids'] += [r['id'] for r in sql(
            f"select id from creators where user_id in {lit(found['user_ids'])}")]
        found['brand_ids'] += [r['brand_id'] for r in sql(
            f"select brand_id from brand_members where user_id in {lit(found['user_ids'])}")]
        found['auth_ids'] += [r['auth_id'] for r in sql(
            f"select auth_id from users where id in {lit(found['user_ids'])} and auth_id is not null")]

    # A creator row may carry the user link the other way round.
    if found['creator_ids']:
        found['user_ids'] += [r['user_id'] for r in sql(
            f"select user_id from creators where id in {lit(found['creator_ids'])} and user_id is not null")]

    for k in found:
        found[k] = sorted(set(x for x in found[k] if x))

    # Deals on either side, and their deliverable items — collected NOW, because
    # once the rows are gone the storage paths cannot be reconstructed.
    if found['creator_ids'] or found['brand_ids']:
        found['deal_ids'] = sorted({r['id'] for r in sql(
            f"select id from deals where creator_id in {lit(found['creator_ids'])} "
            f"or brand_id in {lit(found['brand_ids'])}")})
    if found['deal_ids']:
        found['item_ids'] = sorted({r['id'] for r in sql(
            f"select id from deal_deliverable_items where deal_id in {lit(found['deal_ids'])}")})

    return found


# ── plan ────────────────────────────────────────────────────────────────────

def build_plan(f):
    """Statements in dependency order. See README for why the order is fixed."""
    c, b, u, d = (lit(f['creator_ids']), lit(f['brand_ids']),
                  lit(f['user_ids']), lit(f['deal_ids']))
    plan = []

    # 1. notifications — NO ACTION on both deal_id and user_id, so these block
    #    the deletes below rather than following them.
    plan.append(("notifications",
                 f"delete from notifications where deal_id in {d} or user_id in {u}"))

    # 2. campaigns — campaign_drafts.creator_id is NO ACTION; drafts first.
    plan.append(("campaign_drafts",
                 f"delete from campaign_drafts where creator_id in {c} "
                 f"or campaign_id in (select id from campaigns where brand_id in {b})"))
    plan.append(("campaigns", f"delete from campaigns where brand_id in {b}"))

    # 3. brand_invites — invited_by / accepted_by are NO ACTION on users.
    plan.append(("brand_invites",
                 f"delete from brand_invites where brand_id in {b} "
                 f"or invited_by in {u} or accepted_by in {u}"))

    # 4. deals — RESTRICT from both sides, so they must go before their owners.
    #    Cascades to deal_deliverable_items, deal_reviews, deliverables, events,
    #    invoices, messages, payments.
    plan.append(("deals (cascades to items, reviews, deliverables, events, invoices, messages, payments)",
                 f"delete from deals where creator_id in {c} or brand_id in {b}"))

    # 5. owners. brands.signup_origin_creator_id is SET NULL, so a surviving
    #    real brand attributed to this creator simply loses the attribution
    #    rather than blocking the delete.
    plan.append(("creators (cascades to products, storefronts, rates, origin)",
                 f"delete from creators where id in {c}"))
    plan.append(("brands (cascades to members, invites, rates, origin)",
                 f"delete from brands where id in {b}"))

    # 6. profile rows.
    plan.append(("users", f"delete from users where id in {u}"))

    # 7. events that never had a deal to cascade from — welcome mails, SMS
    #    attempts, demo and contact submissions. Matched on their payload.
    ids = f['user_ids'] + f['creator_ids'] + f['brand_ids']
    if ids:
        conds = " or ".join(
            f"detail->>'{k}' in {lit(ids)}" for k in ('user_id', 'creator_id', 'brand_id'))
        plan.append(("events with no deal (welcome, sms, demo, contact)",
                     f"delete from events where deal_id is null and ({conds})"))

    return plan


def storage_prefixes(f):
    """Buckets and path prefixes to clear, on the conventions the app writes."""
    out = []
    for cid in f['creator_ids']:
        out.append(('storefronts', f'avatars/{cid}/'))
    for did in f['deal_ids']:
        out.append(('deliverables', f'{did}/'))
    return out


# ── main ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Remove named test accounts from production.")
    ap.add_argument('--phone', action='append', default=[], help='repeatable')
    ap.add_argument('--email', action='append', default=[], help='repeatable')
    ap.add_argument('--confirm', action='store_true', help='actually delete (default: dry run)')
    args = ap.parse_args()

    if not args.phone and not args.email:
        ap.error("name at least one --phone or --email. There is no wildcard mode.")

    ref = linked_ref()
    print(f"  linked project : {ref}")
    if ref != EXPECTED_REF:
        print(f"  REFUSED: expected {EXPECTED_REF} (guapd-prod-mumbai).")
        sys.exit(9)
    print(f"  targets        : {', '.join(args.phone + args.email)}")
    print(f"  mode           : {'DELETE' if args.confirm else 'dry run (nothing will change)'}\n")

    f = resolve(args.phone, args.email)

    for label, key in [('creators', 'creator_ids'), ('brands', 'brand_ids'),
                       ('users', 'user_ids'), ('auth users', 'auth_ids'),
                       ('deals', 'deal_ids'), ('deliverable items', 'item_ids')]:
        vals = f[key]
        print(f"  {label:<18} {len(vals)}" + (f"  {vals}" if vals and len(vals) <= 6 else ""))

    if not any(f[k] for k in ('creator_ids', 'brand_ids', 'user_ids')):
        print("\n  Nothing matched. No account with those identifiers exists.")
        return

    # Guard: an identifier that resolves to several accounts is ambiguous, and
    # guessing on a production database is not acceptable.
    for key, label in (('creator_ids', 'creators'), ('brand_ids', 'brands')):
        if len(f[key]) > 1:
            print(f"\n  REFUSED: {len(f[key])} {label} matched. Name them individually.")
            sys.exit(2)

    plan = build_plan(f)
    prefixes = storage_prefixes(f)

    print("\n  ── plan, in dependency order ──")
    for i, (label, stmt) in enumerate(plan, 1):
        print(f"    {i}. {label}")
    print(f"    {len(plan)+1}. auth.users  ({len(f['auth_ids'])})")
    print(f"    {len(plan)+2}. storage     ({len(prefixes)} prefix(es))")
    for bucket, prefix in prefixes:
        print(f"         {bucket}: {prefix}")

    if not args.confirm:
        print("\n  Dry run. Re-run with --confirm to delete.")
        return

    print("\n  ── deleting ──")
    for label, stmt in plan:
        sql(stmt)
        print(f"    done  {label}")

    # Storage first among the non-SQL steps: paths come from ids we still hold.
    for bucket, prefix in prefixes:
        subprocess.run(['npx', 'supabase', 'storage', 'rm', '-r',
                        f'ss://{bucket}/{prefix}', '--linked'],
                       cwd=REPO, capture_output=True, text=True)
        print(f"    done  storage {bucket}:{prefix}")

    # The auth user LAST, and explicitly: public.users → auth.users has no
    # cascade, so skipping this leaves a login that still works.
    for aid in f['auth_ids']:
        sql(f"delete from auth.users where id = '{aid}'")
        print(f"    done  auth.users {aid}")

    print("\n  ── verifying no orphans ──")
    checks = [
        ("creators", f"select count(*)::int as n from creators where id in {lit(f['creator_ids'])}"),
        ("brands", f"select count(*)::int as n from brands where id in {lit(f['brand_ids'])}"),
        ("users", f"select count(*)::int as n from users where id in {lit(f['user_ids'])}"),
        ("auth.users", f"select count(*)::int as n from auth.users where id in {lit(f['auth_ids'])}"),
        ("deals", f"select count(*)::int as n from deals where id in {lit(f['deal_ids'])}"),
    ]
    for label, stmt in checks:
        n = sql(stmt)[0]['n']
        print(f"    {label:<12} {n} remaining  {'✓' if n == 0 else '✗ STILL PRESENT'}")


if __name__ == '__main__':
    main()
