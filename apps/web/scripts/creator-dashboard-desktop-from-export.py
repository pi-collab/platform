#!/usr/bin/env python3
"""
Convert the DESKTOP "Creator Dashboard - Empty State" export into a component.

Sibling of creator-dashboard-convert-from-export.py, which handles the mobile
exports. Two differences matter:

  * The mobile exports wrap the screen in a 390x844 phone frame that has to be
    stripped. This one does not.

  * The mobile converter DROPS the export's stylesheets, and recovering the six
    classes it needed by hand was the most expensive part of that port — the
    markup keeps its classNames either way, so a dropped stylesheet renders a
    flat page with no error anywhere. This one KEEPS the CSS and scopes every
    selector under .cdash-desk instead.

Scoping is not cosmetic. The export ships `body`, `a`, `a:hover` and ten :root
blocks holding 286 custom properties. Left alone, those redefine the palette for
the entire site.

Run:  python3 scripts/creator-dashboard-desktop-from-export.py <export.html>
"""
import json
import re
import sys
from pathlib import Path

SCOPE = '.cdash-desk'
steps = []


def step(label, before, after):
    steps.append(f'  {label}: {before} -> {after}')


SRC = Path(sys.argv[1] if len(sys.argv) > 1
           else '/Users/palakjain/Downloads/Creator Dashboard - Empty State.html')
OUT_DIR = Path(__file__).resolve().parent.parent / 'app' / 'creator' / 'dashboard'

# ── 0. The payload ──────────────────────────────────────────────────────────
# It is a JSON string literal, not markup — reading the file as HTML finds
# almost nothing, because the real document lives in here.
raw = SRC.read_text(encoding='utf-8', errors='replace')
m = re.search(r'<script[^>]*type="__bundler/template"[^>]*>(.*?)</script>', raw, re.S)
if not m:
    sys.exit('No __bundler/template block — is this an export?')
doc = json.loads(m.group(1).strip())
step('template decoded', len(raw), len(doc))

# ── 1. Split the stylesheet off ─────────────────────────────────────────────
css = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', doc, re.S))
doc = re.sub(r'<style[^>]*>.*?</style>', '', doc, flags=re.S)
step('stylesheet extracted', 0, len(css))

# ── 2. Scope the CSS ────────────────────────────────────────────────────────
n = len(re.findall(r'@font-face', css))
# next/font already serves Schibsted Grotesk and Instrument Serif. Shipping
# these would refetch the same faces from a second source.
css = re.sub(r'@font-face\s*\{[^}]*\}', '', css)
step('@font-face dropped (next/font serves these)', n, 0)

n = len(re.findall(r'(?m)^\s*body\s*\{', css))
# A global reset the app already has. Scoped, it would put page margins on a div.
css = re.sub(r'(?m)^\s*body\s*\{[^}]*\}', '', css)
step('bare body reset dropped', n, 0)

n = len(re.findall(r':root\s*\{', css))
css = css.replace(':root', SCOPE)
step(f'":root" rewritten to {SCOPE}', n, 0)


def scope_selector(sel: str) -> str:
    out = []
    for part in sel.split(','):
        p = part.strip()
        if not p or p.startswith(('@', '%', SCOPE)) or p in ('from', 'to') or re.match(r'^\d', p):
            out.append(part)
        else:
            out.append(f'{SCOPE} {p}')
    return ', '.join(out)


lines, out, depth, in_kf = css.split('\n'), [], 0, False
for line in lines:
    if re.match(r'\s*@keyframes', line):
        in_kf = True
    sel = re.match(r'^([^@{}/][^{}]*?)\s*\{\s*$', line)
    out.append(line if (in_kf or not sel)
               else line.replace(sel.group(1), scope_selector(sel.group(1)), 1))
    depth += line.count('{') - line.count('}')
    if in_kf and depth == 0:
        in_kf = False
css = '\n'.join(out)
# Selectors inside @media sit indented, so the line matcher above skips them.
css = re.sub(r'(?m)^(\s+)(a(?::hover)?)\s*\{', rf'\1{SCOPE} \2 {{', css)

unscoped = [s.strip() for s in re.findall(r'(?m)^\s*([a-z][^{@\n]{0,60}?)\s*\{', css)]
if unscoped:
    print('  WARNING — selectors that would leak site-wide:')
    for u in sorted(set(unscoped)):
        print(f'    {u}')

# ── 3. Markup to JSX ────────────────────────────────────────────────────────
body = re.search(r'<body[^>]*>(.*?)</body>', doc, re.S)
doc = body.group(1) if body else doc
doc = re.sub(r'<script.*?</script>', '', doc, flags=re.S)
doc = re.sub(r'<link[^>]*>', '', doc)
doc = re.sub(r'<!--.*?-->', '', doc, flags=re.S)

# MUST precede the SVG pass: that pass rewrites the tail of these names, after
# which this replacement stops matching. The same ordering bug cost 24
# attributes on an earlier export, and it fails silently.
n = doc.count('sc-camel-')
doc = doc.replace('sc-camel-view-box', 'viewBox')
step('sc-camel-* restored', n, doc.count('sc-camel-'))

SVG_ATTRS = {
    'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap',
    'stroke-linejoin': 'strokeLinejoin', 'stroke-dasharray': 'strokeDasharray',
    'stroke-dashoffset': 'strokeDashoffset', 'fill-rule': 'fillRule',
    'clip-rule': 'clipRule', 'stop-color': 'stopColor', 'stop-opacity': 'stopOpacity',
    'stroke-opacity': 'strokeOpacity', 'fill-opacity': 'fillOpacity',
    'clip-path': 'clipPath', 'text-anchor': 'textAnchor',
}
n = sum(doc.count(k + '=') for k in SVG_ATTRS)
for k, v in SVG_ATTRS.items():
    doc = doc.replace(f'{k}=', f'{v}=')
doc = doc.replace('class=', 'className=').replace(' for=', ' htmlFor=')
step('svg + html attributes to JSX', n, sum(doc.count(k + '=') for k in SVG_ATTRS))

ROUTES = {
    'Creator Deals.dc.html': '/creator/deals',
    'Creator Deals - Empty State.dc.html': '/creator/deals',
    'Creator Inbox.dc.html': '/creator/inbox',
    'Creator Payments.dc.html': '/creator/payments',
    'Creator Profile.dc.html': '/creator/settings',
    'Creator Shopfront.dc.html': '/creator/storefront',
    'Creator Notifications.dc.html': '/creator/notifications',
    'For Brands.dc.html': '/brands',
    'For Creators.dc.html': '/creators',
}
n = doc.count('.dc.html')
for k, v in ROUTES.items():
    doc = doc.replace(f'href="{k}"', f'href="{v}"')
leftover = sorted(set(re.findall(r'href="([^"]*\.dc\.html)"', doc)))
step('design links to app routes', n, doc.count('.dc.html'))
if leftover:
    print('  UNMAPPED LINKS (these would 404):')
    for l in leftover:
        print(f'    {l}')


def style_to_jsx(match):
    decls = [d for d in match.group(1).split(';') if d.strip()]
    pairs = []
    for d in decls:
        if ':' not in d:
            continue
        prop, val = d.split(':', 1)
        prop = prop.strip()
        key = re.sub(r'-([a-z])', lambda m: m.group(1).upper(), prop)
        if prop.startswith('--'):
            key = f"'{prop}'"
        pairs.append(f"{key}: '{val.strip()}'")
    return 'style={{' + ', '.join(pairs) + '}}'


n = len(re.findall(r'style="[^"]*"', doc))
doc = re.sub(r'style="([^"]*)"', style_to_jsx, doc)
step('inline styles to JSX objects', n, len(re.findall(r'style="[^"]*"', doc)))

# The export writes SVG children BOTH ways — <path d="..."/> and
# <path d="..."></path>. Collapsing the explicit pairs FIRST matters: a blanket
# self-closing pass turns <rect ...></rect> into <rect ... /></rect> and leaves
# an orphan closing tag, which is a JSX parse error a long way from its cause.
VOID = ('img', 'br', 'hr', 'input', 'path', 'circle', 'rect', 'line', 'polyline',
        'polygon', 'ellipse', 'use', 'stop', 'source')
n = 0
for tag in VOID:
    doc, k = re.subn(rf'<{tag}(\b[^>]*?)>\s*</{tag}>', rf'<{tag}\1 />', doc)
    n += k
step('explicit empty pairs collapsed', n, 0)

n = 0
for tag in VOID:
    doc, k = re.subn(rf'(<{tag}\b[^>]*?)(?<!/)>', r'\1 />', doc)
    n += k
step('remaining void elements self-closed', n, 0)

# Custom elements the exporter emits for form controls.
n = len(re.findall(r'<sc-raw-\w+', doc))
doc = doc.replace('<sc-raw-select', '<select').replace('</sc-raw-select>', '</select>')
doc = doc.replace('<sc-raw-input', '<input').replace('</sc-raw-input>', '</input>')
step('sc-raw-* to real elements', n, len(re.findall(r'<sc-raw-\w+', doc)))

doc = doc.replace('&nbsp;', ' ')
# The exporter's own wrappers, plus the marketing nav and footer around the
# screen. The creator layout already provides navigation; a second one inside
# the page is exactly what put two headers on the questions screen.
for _tag in ('x-dc', 'helmet'):
    doc = re.sub(rf'</?{_tag}[^>]*>', '', doc)
_n = len(re.findall(r'<(?:nav|footer)\b', doc))
doc = re.sub(r'<nav\b.*?</nav>', '', doc, flags=re.S)
doc = re.sub(r'<footer\b.*?</footer>', '', doc, flags=re.S)
step('export wrappers and site chrome removed', _n, len(re.findall(r'<(?:nav|footer)\b', doc)))

OUT_DIR.mkdir(parents=True, exist_ok=True)
(OUT_DIR / 'dashboard-desktop.css').write_text(css.strip() + '\n')
(OUT_DIR / '_desktop-body.jsx.txt').write_text(doc.strip() + '\n')

print('\n'.join(steps))
print(f'\n  css  -> {OUT_DIR / "dashboard-desktop.css"}  ({len(css)} chars)')
print(f'  jsx  -> {OUT_DIR / "_desktop-body.jsx.txt"}  ({len(doc)} chars)')
print('\n  Next: wrap the body in a component, replace the placeholder identity')
print('  with props, and delete the .jsx.txt scratch file.')
