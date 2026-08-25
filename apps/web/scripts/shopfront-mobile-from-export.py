#!/usr/bin/env python3
"""
Convert the "Creator Shopfront Mobile Standalone" export into JSX + scoped CSS.

Third sibling of creator-dashboard-convert-from-export.py (mobile dashboards)
and creator-dashboard-desktop-from-export.py (desktop dashboard). What differs
here, and what cost time on the earlier two:

  * The payload is a JSON STRING inside <script type="__bundler/template">.
    Reading this file as HTML finds a wrapper and nothing else.

  * This export wraps the screen in a 390x844 phone frame. It has to go, or the
    component renders a phone inside a phone.

  * It ships a BOTTOM NAV. The creator layout already provides one; a second
    inside the page is exactly what put two headers on the questions screen.

  * Rule ORDER below is load-bearing and every mis-ordering fails SILENTLY:
    sc-camel-* must be restored before the SVG attribute pass rewrites their
    tails, and explicit <tag></tag> pairs must be collapsed before the blanket
    self-closing pass, or <rect ...></rect> becomes <rect ... /></rect>.

  * CSS is KEPT and scoped under .sfm. Dropping it leaves the classNames in
    place and renders a flat page with no error anywhere — the single most
    expensive mistake of the mobile dashboard port.

Run:  python3 scripts/shopfront-mobile-from-export.py <export.html>
"""
import json
import re
import sys
from pathlib import Path

SCOPE = '.sfm'
steps = []


def step(label, before, after):
    steps.append(f'  {label}: {before} -> {after}')


SRC = Path(sys.argv[1] if len(sys.argv) > 1
           else '/Users/palakjain/Downloads/Creator Shopfront Mobile Standalone.html')
OUT = Path(__file__).resolve().parent.parent / 'app' / 'creator' / 'storefront'

raw = SRC.read_text(encoding='utf-8', errors='replace')
m = re.search(r'<script[^>]*type="__bundler/template"[^>]*>(.*?)</script>', raw, re.S)
if not m:
    sys.exit('No __bundler/template block — is this an export?')
doc = json.loads(m.group(1).strip())
step('template decoded', len(raw), len(doc))

# ── Stylesheet off, and scoped ──────────────────────────────────────────────
css = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', doc, re.S))
doc = re.sub(r'<style[^>]*>.*?</style>', '', doc, flags=re.S)
step('stylesheet extracted', 0, len(css))

n = len(re.findall(r'@font-face', css))
css = re.sub(r'@font-face\s*\{[^}]*\}', '', css)
step('@font-face dropped (next/font serves these)', n, 0)

n = len(re.findall(r'(?m)^\s*body\s*\{', css))
css = re.sub(r'(?m)^\s*body\s*\{[^}]*\}', '', css)
step('bare body reset dropped', n, 0)

# Font tokens declared by FAMILY NAME only resolve with the @font-face blocks
# just dropped. Kept, they shadow the app's own tokens with a name nothing
# loads, and every heading silently falls back to system-ui.
n = len(re.findall(r'--font-(?:display|ui|serif|body|heading)\s*:', css))
css = re.sub(r'\s*--font-(?:display|ui|serif|body|heading)\s*:[^;]+;', '', css)
step('font tokens removed (app :root provides them)', n, 0)

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


# ── Scope every rule ────────────────────────────────────────────────────────
# Line-based scoping does not survive a MINIFIED sheet. This export writes
# `.sr{opacity:1;...}` — selector and body on one line — so a regex anchored on
# a selector that ENDS its line matched almost nothing and left the whole
# stylesheet global, redefining .t-meta and friends for the entire site.
#
# Walk the braces instead. Anything sitting where a selector can sit gets
# scoped; at-rule preludes and keyframe stops do not.
def scope_all(text: str) -> str:
    out, buf, depth = [], [], 0
    at_stack = []
    for ch in text:
        if ch == '{':
            sel = ''.join(buf).strip()
            buf = []
            if sel.startswith('@'):
                at_stack.append(sel.split()[0])
                out.append(sel + '{')
            elif at_stack and at_stack[-1] in ('@keyframes', '@-webkit-keyframes', '@property'):
                # 0%, from, to — offsets, not selectors.
                out.append(sel + '{')
                at_stack.append('_kf_child')
            else:
                out.append(scope_selector(sel) + '{')
                at_stack.append('_rule')
            depth += 1
        elif ch == '}':
            out.append(''.join(buf) + '}')
            buf = []
            depth -= 1
            if at_stack:
                at_stack.pop()
        else:
            buf.append(ch)
    out.append(''.join(buf))
    return ''.join(out)


css = scope_all(css)

# A check that CANNOT quietly pass. The previous one looked for selectors
# starting [a-zA-Z] — element selectors — so it never inspected a class and
# reported zero while the sheet was almost entirely unscoped.
leaks = []
for m in re.finditer(r'(?:^|\})\s*([^{}@]+?)\s*\{', css):
    for part in m.group(1).split(','):
        part = part.strip()
        if not part or part.startswith(SCOPE) or re.match(r'^(?:\d|from\b|to\b)', part):
            continue
        leaks.append(part)
if leaks:
    print(f'  WARNING — {len(leaks)} selector(s) would leak site-wide:')
    for u in sorted(set(leaks))[:12]:
        print(f'    {u}')
else:
    print(f'  scoping verified: every rule sits under {SCOPE}')

# ── Markup ──────────────────────────────────────────────────────────────────
body = re.search(r'<body[^>]*>(.*?)</body>', doc, re.S)
doc = body.group(1) if body else doc
doc = re.sub(r'<script.*?</script>', '', doc, flags=re.S)
doc = re.sub(r'<link[^>]*>', '', doc)

# The 390x844 phone frame. Unwrapped by keeping only what is inside it, so the
# component fills whatever it is given rather than drawing a handset.
frame = re.search(r'<div[^>]*style="[^"]*width:390px[^"]*"[^>]*>', doc)
if frame:
    inner = doc[frame.end():doc.rfind('</div>')]
    step('phone frame unwrapped', len(doc), len(inner))
    doc = inner

# MUST precede the SVG pass, which rewrites the tail of these names. Generic
# rather than a list: the earlier ports hard-coded sc-camel-view-box and left
# sc-camel-on-click and sc-camel-on-input behind as unknown attributes, which
# React drops in silence — a button that renders perfectly and does nothing.
n = doc.count('sc-camel-')
doc = re.sub(r'sc-camel-([a-z-]+)',
             lambda m: re.sub(r'-([a-z])', lambda g: g.group(1).upper(), m.group(1)),
             doc)
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


def style_to_jsx(match):
    raw = match.group(1).strip()
    # style="{{ igTabStyle }}" — the WHOLE value is a binding, so there is no
    # `prop: value` to split and the loop below produced style={{}}: an element
    # with every style silently dropped. That is how the platform toggle
    # rendered as two default browser buttons.
    whole = re.fullmatch(r'\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}', raw)
    if whole:
        return 'style={' + whole.group(1) + '}'
    pairs = []
    for d in match.group(1).split(';'):
        if ':' not in d:
            continue
        prop, val = d.split(':', 1)
        prop, val = prop.strip(), val.strip()
        key = f"'{prop}'" if prop.startswith('--') else re.sub(r'-([a-z])', lambda m: m.group(1).upper(), prop)
        # A binding used as a whole value becomes an expression, not a string.
        if val.startswith('{{') and val.endswith('}}'):
            pairs.append(f'{key}: {val[2:-2].strip()}')
        else:
            pairs.append(f"{key}: '{val}'")
    return 'style={{' + ', '.join(pairs) + '}}'


n = len(re.findall(r'style="[^"]*"', doc))
doc = re.sub(r'style="([^"]*)"', style_to_jsx, doc)
step('inline styles to JSX objects', n, len(re.findall(r'style="[^"]*"', doc)))

# Explicit pairs FIRST. A blanket self-closing pass on <rect ...></rect> leaves
# an orphan </rect> and a JSX parse error a long way from its cause.
VOID = ('img', 'br', 'hr', 'input', 'path', 'circle', 'rect', 'line', 'polyline',
        'polygon', 'ellipse', 'use', 'stop', 'source', 'image-slot')
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

n = len(re.findall(r'<sc-raw-\w+', doc))
doc = doc.replace('<sc-raw-select', '<select').replace('</sc-raw-select>', '</select>')
doc = doc.replace('<sc-raw-input', '<input').replace('</sc-raw-input>', '</input>')
step('sc-raw-* to real elements', n, len(re.findall(r'<sc-raw-\w+', doc)))

doc = doc.replace('&nbsp;', ' ')
for _tag in ('x-dc', 'helmet'):
    doc = re.sub(rf'</?{_tag}[^>]*>', '', doc)

# The creator layout already provides navigation. A second one inside the page
# is what put two headers on the questions screen.
_n = len(re.findall(r'<(?:nav|footer)\b', doc))
doc = re.sub(r'<nav\b.*?</nav>', '', doc, flags=re.S)
doc = re.sub(r'<footer\b.*?</footer>', '', doc, flags=re.S)
step('site chrome removed', _n, len(re.findall(r'<(?:nav|footer)\b', doc)))

# The export's bottom tab bar is plain divs, not a <nav>, so the rule above
# does not see it. CreatorTabBar already renders one at z-index 10000; a second
# would sit under it, legible enough to invite taps that go nowhere.
i = doc.find('>Dashboard<')
if i != -1:
    j = doc.rfind('<div', 0, doc.rfind('<div', 0, i))
    step('bottom tab bar removed', len(doc), len(doc[:j]))
    doc = doc[:j]

# Left in place on purpose: <sc-for> and {{ }} are the wiring points. Turning
# them into JSX loops needs to know which of OUR fields each maps to, and
# guessing that in a regex is how a card ends up bound to the wrong column.
loops = re.findall(r'<sc-for[^>]*>', doc)
binds = sorted(set(re.findall(r'\{\{\s*([a-zA-Z0-9_.]+)', doc)))

OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'shopfront-mobile.css').write_text(css.strip() + '\n')
(OUT / '_mobile-body.jsx.txt').write_text(doc.strip() + '\n')

print('\n'.join(steps))
print(f'\n  css  -> {OUT / "shopfront-mobile.css"}  ({len(css)} chars)')
print(f'  jsx  -> {OUT / "_mobile-body.jsx.txt"}  ({len(doc)} chars)')
print(f'\n  {len(loops)} sc-for loops and {len(binds)} bindings left for hand-wiring:')
for l in loops:
    print(f'    {l[:96]}')
