#!/usr/bin/env python3
"""
Convert the Creator Dashboard (empty, mobile) export into JSX.

Same shape as the marketing converters in this directory, with one difference
worth knowing up front: this export's payload is GZIPPED and base64'd inside a
<script type="__bundler/manifest"> block. Reading the file as HTML finds almost
nothing — the visible markup lives in a second block,
<script type="__bundler/template">, which is what this reads.

RULE ORDERING IS LOAD BEARING. Rules that match RAW export syntax must run
BEFORE the style="..." -> style={{...}} conversion; rules that match the
CONVERTED form must run after. Getting this wrong is always a silent no-op,
which is why every step prints a before/after count. A step that reports 0 -> 0
when it should have changed something has failed, and the run should be
treated as broken even though it "succeeded".
"""
import html
import re
import sys
from pathlib import Path

SRC = Path('/Users/palakjain/Downloads/GUAPD Creator Dashboard Empty - Mobile.html')
OUT = Path('/private/tmp/claude-501/-Users-palakjain/98efe6a8-2823-4c79-8309-ba18d97dc82d/scratchpad/creator-dashboard-final.txt')

steps = []


def step(label, before, after):
    steps.append((label, before, after))


# ── 0. Pull the template block out of the export ────────────────────────────
raw = SRC.read_text(encoding='utf-8', errors='replace')
m = re.search(r'<script[^>]*type="__bundler/template"[^>]*>(.*?)</script>', raw, re.S)
if not m:
    sys.exit('no __bundler/template block — the export format has changed')
doc = m.group(1)

# The block is a JS string literal, so unescape it back to markup.
doc = doc.replace('\\n', '\n').replace('\\"', '"').replace('\\u002F', '/').replace("\\'", "'")

# ── 1. Keep only what is inside the iOS device frame ────────────────────────
# The export wraps the screen in a 390x844 phone mockup with a rounded border
# and a drop shadow. That is presentation of the design, not part of it.
i = doc.find('<x-import')
j = doc.find('>', i) + 1
doc = doc[j:]
doc = re.sub(r'</x-import>.*$', '', doc, flags=re.S)
step('device frame stripped', 1, doc.count('<x-import'))

# ── 2. Drop the export's own <style> blocks ─────────────────────────────────
# 50KB of design-system tokens, most of it for screens this file does not
# render.
#
# BUT the markup keeps its classNames, and dropping the stylesheet wholesale
# takes their definitions with it. The screen still renders — which is the
# trap: every card came out a flat white rectangle with no radius and no
# shadow, and it looked like a design choice rather than missing CSS.
#
# The six classes this markup uses (mcard, secline, tnum, t-meta, sr, tab) are
# transcribed into app/creator/creator-app.css. If a future export introduces
# another class, it must be added there too — check with:
#   grep -oE 'className="[^"]+"' <the generated component>
before = doc.count('<style')
doc = re.sub(r'<style[^>]*>.*?</style>', '', doc, flags=re.S)
step('export stylesheets removed', before, doc.count('<style'))

# ── 3. sc-camel-* attributes back to their real names ───────────────────────
# The exporter lowercases camelCase SVG attributes and prefixes them. This MUST
# run before the SVG attribute pass below, or that pass rewrites the tail of
# the name and this one stops matching. That exact ordering bug cost 24
# attributes on an earlier export.
before = doc.count('sc-camel-')
doc = doc.replace('sc-camel-view-box', 'viewBox')
step('sc-camel-* restored', before, doc.count('sc-camel-'))

# ── 4. Hyphenated attributes to JSX ─────────────────────────────────────────
SVG_ATTRS = {
    'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap',
    'stroke-linejoin': 'strokeLinejoin', 'stroke-dasharray': 'strokeDasharray',
    'fill-rule': 'fillRule', 'clip-rule': 'clipRule', 'stop-color': 'stopColor',
    'stop-opacity': 'stopOpacity', 'stroke-opacity': 'strokeOpacity',
    'fill-opacity': 'fillOpacity',
}
before = sum(doc.count(k) for k in SVG_ATTRS)
for k, v in SVG_ATTRS.items():
    doc = doc.replace(f'{k}=', f'{v}=')
doc = doc.replace('class=', 'className=').replace('for=', 'htmlFor=')
step('svg + html attributes to JSX', before, sum(doc.count(k) for k in SVG_ATTRS))

# ── 5. Local .dc.html links to real routes ─────────────────────────────────
# The export links to sibling design files. Every one of these has a route in
# the app already, so they become real navigation rather than dead ends.
ROUTES = {
    'Creator Dashboard - Empty Mobile.dc.html': '/creator/dashboard',
    'Creator Deals - Mobile.dc.html': '/creator/deals',
    'Creator Inbox.dc.html': '/creator/inbox',
    'Creator Payments.dc.html': '/creator/payments',
    'Creator Payments - Mobile.dc.html': '/creator/payments',
    'Creator Profile.dc.html': '/creator/settings',
    'Creator Shopfront.dc.html': '/creator/storefront',
    'Creator Notifications - Empty Mobile.dc.html': '/creator/notifications',
}
before = doc.count('.dc.html')
for k, v in ROUTES.items():
    doc = doc.replace(f'href="{k}"', f'href="{v}"')
leftover = re.findall(r'href="([^"]*\.dc\.html)"', doc)
step('design links to app routes', before, doc.count('.dc.html'))
if leftover:
    print('  UNMAPPED LINKS (these would 404):')
    for l in sorted(set(leftover)):
        print(f'    {l}')

# ── 6. style="..." to a JSX style object ───────────────────────────────────
def css_to_jsx(css: str) -> str:
    out = []
    for decl in css.split(';'):
        if ':' not in decl:
            continue
        prop, _, value = decl.partition(':')
        prop, value = prop.strip(), value.strip()
        if not prop or not value:
            continue
        # Custom properties keep their exact name and must stay quoted.
        if prop.startswith('--'):
            out.append(f"'{prop}': '{value}'")
            continue
        name = re.sub(r'-([a-z])', lambda m: m.group(1).upper(), prop)
        out.append(f"{name}: '{value}'")
    return '{{' + ', '.join(out) + '}}'


before = doc.count('style="')
doc = re.sub(r'style="([^"]*)"', lambda m: 'style=' + css_to_jsx(m.group(1)), doc)
step('style attributes to JSX objects', before, doc.count('style="'))

# ── 7. Self-close void elements ────────────────────────────────────────────
before = len(re.findall(r'<(br|img|input|hr)\b[^>]*[^/]>', doc))
doc = re.sub(r'<(br|img|input|hr)(\b[^>]*?)(?<!/)>', r'<\1\2 />', doc)
step('void elements self-closed', before, len(re.findall(r'<(br|img|input|hr)\b[^>]*[^/]>', doc)))

# ── 8. Comments out — JSX cannot hold raw HTML comments ────────────────────
before = doc.count('<!--')
doc = re.sub(r'<!--.*?-->', '', doc, flags=re.S)
step('html comments removed', before, doc.count('<!--'))

# ── 9. Placeholder identity out ────────────────────────────────────────────
# The export hardcodes a name, handle and follower count. Those become props,
# because a dashboard showing someone else's name is worse than showing none.
before = doc.count('Utkarsh') + doc.count('@uvichar_')
doc = doc.replace('>Utkarsh<', '>{firstName}<')
doc = doc.replace('@uvichar_ · 0 followers', '{handleLine}')
step('placeholder identity to props', before, doc.count('Utkarsh') + doc.count('@uvichar_'))

# ── 9b. sc-raw-* elements back to real ones ────────────────────────────────
# The exporter renames <select> so its own renderer does not style it. Left
# alone this reaches TypeScript as an unknown intrinsic element and fails the
# build — which is the good outcome, since a silent pass would ship a tag no
# browser renders.
before = doc.count('sc-raw-select')
doc = doc.replace('<sc-raw-select', '<select').replace('</sc-raw-select>', '</select>')
step('sc-raw-select restored', before, doc.count('sc-raw-select'))

# ── 9c. The header does not stick ──────────────────────────────────────────
# In the export the header is sticky inside a fixed-height scroll container, so
# it pins to the top of the phone frame. Ours scrolls with the page, where the
# same rule pins it to the VIEWPORT — the greeting then follows you down the
# screen and reprints over the content below it.
before = doc.count("position:sticky")
doc = doc.replace("position:sticky;top:0;z-index:6;background:#F5F7FA;", "background:#F5F7FA;")
step('sticky header released', before, doc.count("position:sticky"))

# ── 10. Entities ───────────────────────────────────────────────────────────
# JSX treats { and } as expression delimiters, so any literal brace left in
# copy would break the parse. None appear today; the guard is cheap.
doc = doc.replace('&nbsp;', ' ')
before = len(re.findall(r'(?<![{])[{}](?![}])', doc))
step('stray braces in copy', before, before)

OUT.write_text(doc)

print('  ── conversion ──')
for label, b, a in steps:
    print(f'    {label:<34} {b:>4} → {a}')
print(f'    written: {OUT}  ({len(doc):,} chars)')
print(f'    <a> links: {doc.count("<a ")}   svg: {doc.count("<svg")}   divs: {doc.count("<div")}')
