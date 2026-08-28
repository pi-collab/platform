#!/usr/bin/env python3
"""
Convert the DESKTOP "Brand Dashboard - Empty" export into a component.

Third sibling of creator-deals/-inbox-desktop-from-export.py and inherits every
trap those two paid for: a brace-walking scoper (line matchers miss minified
rules), comments lifted out of the prelude before anything reads it as a
selector, entity-aware declaration splitting, and `disabled=""` converted to a
real JSX boolean.

Every check is FATAL. A converter that warns and writes anyway is one whose
warnings nobody reads.

Run:  python3 scripts/brand-dashboard-desktop-from-export.py <export.html>
"""

import html
import tempfile
import json
import re
import sys
from pathlib import Path

SCOPE = '.bdash-desk'
steps = []


def step(label, before, after):
    steps.append(f'  {label}: {before} -> {after}')


SRC = Path(sys.argv[1] if len(sys.argv) > 1
           else '/Users/palakjain/Downloads/Brand Dashboard - Empty Standalone.html')
OUT_DIR = Path(__file__).resolve().parent.parent / 'app' / 'dashboard'

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

# Font tokens are dropped, not scoped. The export declares them by family NAME
# ("Schibsted Grotesk"), which only resolves if its @font-face blocks come too —
# and those are dropped above because next/font already serves the same faces.
# Kept, they override the app's tokens with a name nothing loads, and every
# heading silently falls back to system-ui. Removing them lets the app's own
# definitions cascade in.
n = len(re.findall(r'--font-(?:display|ui|serif|body|heading)\s*:', css))
css = re.sub(r'\s*--font-(?:display|ui|serif|body|heading)\s*:[^;]+;', '', css)
step('font tokens removed (app :root provides them)', n, 0)

n = len(re.findall(r':root\s*\{', css))
css = css.replace(':root', SCOPE)
step(f'":root" rewritten to {SCOPE}', n, 0)


# ── The scoper ──────────────────────────────────────────────────────────────
# A BRACE WALKER, not a line matcher. The previous version matched a selector
# alone on a line ending in "{", which misses every minified rule -- and this
# export is full of them:
#
#     .g-card{ background:var(--card); border-radius:20px; }
#     *{box-sizing:border-box;}
#
# 41 rules including `*`, `.g-card` and `.g-wordmark` sailed through unscoped and
# would have restyled the whole site. The shopfront port lost a day to exactly
# this, and its leak check reported "0 unscoped" while 77 rules leaked, because
# the check only inspected line-leading selectors too.

BLOCK_AT_RULES = {'media', 'supports', 'container', 'layer', 'scope'}


def read_block(text, open_idx):
    """Content between the braces at open_idx, and the index just past the close."""
    depth, i = 0, open_idx
    while i < len(text):
        c = text[i]
        if c in '"\'':
            q, i = c, i + 1
            while i < len(text) and text[i] != q:
                i += 2 if text[i] == '\\' else 1
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return text[open_idx + 1:i], i + 1
        i += 1
    return text[open_idx + 1:], len(text)


def split_selectors(sel):
    """Split on commas at paren depth 0, so :is(a, b) survives intact."""
    parts, buf, depth = [], '', 0
    for c in sel:
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
        if c == ',' and depth == 0:
            parts.append(buf); buf = ''
        else:
            buf += c
    parts.append(buf)
    return [p for p in parts if p.strip()]


def scope_selector(sel):
    out = []
    for part in split_selectors(sel):
        p = part.strip()
        if not p or p.startswith(SCOPE) or p in ('from', 'to') or re.match(r'^\d+%', p):
            out.append(p)
        elif p.startswith(('html', ':root')):
            out.append(SCOPE)   # the scope element stands in for the document root
        else:
            out.append(f'{SCOPE} {p}')
    return ', '.join(out)


def scope_css(text):
    res, prelude, i = [], '', 0
    while i < len(text):
        if text.startswith('/*', i):
            j = text.find('*/', i + 2)
            j = len(text) if j == -1 else j + 2
            prelude += text[i:j]; i = j
        elif text[i] == ';':
            res.append(prelude + ';'); prelude = ''; i += 1
        elif text[i] == '{':
            body, after = read_block(text, i)
            # Comments come OUT of the prelude before anything reads it as a
            # selector. Left in, a leading /* ... */ becomes part of the
            # selector: it gets split on the commas INSIDE the comment, each
            # fragment gets the scope prefixed, and the parser then sees
            # `.scope <comment> .scope` -- a DESCENDANT selector needing the
            # wrapper inside itself, which never matches. That silently killed
            # every :root token block, i.e. the entire design system.
            comments = re.findall(r'/\*.*?\*/', prelude, re.S)
            sel = re.sub(r'/\*.*?\*/', ' ', prelude, flags=re.S).strip()
            for c in comments:
                res.append(c)
            if sel.startswith('@'):
                m2 = re.match(r'@([\w-]+)', sel)
                name = m2.group(1).lower() if m2 else ''
                # @media and friends CONTAIN rules, so recurse into them.
                # @keyframes contains percentage steps, which must NOT be scoped.
                inner = scope_css(body) if name in BLOCK_AT_RULES else body
                res.append(f'{sel} {{{inner}}}')
            else:
                res.append(f'{scope_selector(sel)} {{{body}}}')
            prelude = ''; i = after
        else:
            prelude += text[i]; i += 1
    if prelude.strip():
        res.append(prelude)
    return '\n'.join(res)


def leaks(text):
    """Selectors that would still match outside the scope. Must be able to FAIL."""
    found, prelude, i = [], '', 0
    while i < len(text):
        if text.startswith('/*', i):
            j = text.find('*/', i + 2)
            i = len(text) if j == -1 else j + 2
        elif text[i] == '{':
            body, after = read_block(text, i)
            sel = prelude.strip()
            if sel.startswith('@'):
                m2 = re.match(r'@([\w-]+)', sel)
                if m2 and m2.group(1).lower() in BLOCK_AT_RULES:
                    found += leaks(body)
            else:
                for part in split_selectors(sel):
                    p = part.strip()
                    if p and not p.startswith(SCOPE) and p not in ('from', 'to') and not re.match(r'^\d+%', p):
                        found.append(p)
            prelude = ''; i = after
        elif text[i] == ';':
            prelude = ''; i += 1
        else:
            prelude += text[i]; i += 1
    return found


before = len(leaks(css))
css = scope_css(css)
step('every rule scoped (brace walker)', before, len(leaks(css)))

# Deliberately FATAL. A converter that prints a warning and writes the file
# anyway is a converter whose warning nobody reads.
embedded = re.findall(r'(?m)^[^@{}\n]*\*/[^{}\n]*\{', css)
if embedded:
    print(f'  ABORT - {len(embedded)} selector(s) still contain a comment:')
    for e in embedded[:10]:
        print(f'    {e.strip()[:90]}')
    sys.exit(1)

# A rule whose selector repeats the scope needs the wrapper nested inside itself
# and can never match. This is what the comment bug produced.
nested = re.findall(rf'(?m)^{re.escape(SCOPE)}\s+{re.escape(SCOPE)}\s*\{{', css)
if nested:
    print(f'  ABORT - {len(nested)} rule(s) require {SCOPE} inside {SCOPE}')
    sys.exit(1)

# Content the export only reveals with JavaScript.
#
# These exports hide elements at opacity 0 and add a class on scroll from an
# inline <script>, which is stripped. The class still applies, the reveal never
# runs, and the page renders mostly blank -- seven of eight sections vanished on
# the brand dashboard and it looked like the conversion had dropped them.
#
# Warned, not fatal: the fix is a one-line override in the scoped CSS, and which
# way to resolve it is a judgement (show it, or reimplement the reveal).
_hidden = re.findall(r'\.([a-z][\w-]*)\s*\{[^}]*opacity\s*:\s*0[^}]*\}', css)
_revealed = set(re.findall(r'\.([a-z][\w-]*)\.\w+\s*\{[^}]*opacity\s*:\s*1', css))
_needs_js = sorted({c for c in _hidden if c in _revealed})
if _needs_js:
    print('  NOTE - hidden until a class is added by script, which is stripped:')
    for c in _needs_js:
        print(f'    .{c}  -> override it in the scoped CSS or nothing will show')

bad = sorted(set(leaks(css)))
if bad:
    print(f'  ABORT - {len(bad)} selector(s) would leak site-wide:')
    for b in bad[:30]:
        print(f'    {b}')
    sys.exit(1)


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
# General, not just view-box: this export also carries baseFrequency,
# numOctaves and stitchTiles inside an inline SVG data URI.
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

ROUTES = {
    'Creator Dashboard.dc.html': '/creator/dashboard',
    'Browse Creators.dc.html': '/browse',
    'Brand Dashboard.dc.html': '/dashboard',
    'Brand Deals.dc.html': '/deals',
    'Brand Payments.dc.html': '/payments',
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
step('design links to app routes', n, doc.count('.dc.html'))


def _split_decls(text):
    """Split on ';' at paren depth 0 and outside quotes.

    A naive text.split(';') breaks on the ';' that ENDS an HTML entity, so
    url(&quot;data:image/svg+xml,...&quot;) became two declarations and the value
    was silently truncated to `url(&quot`.
    """
    out, buf, depth, quote, entity = [], '', 0, None, False
    for ch in text:
        if quote:
            buf += ch
            if ch == quote:
                quote = None
            continue
        if ch in '"\'':
            quote = ch; buf += ch; continue
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == '&':
            entity = True
        if ch == ';' and entity:
            # The ';' that ENDS an entity is part of the value, not a separator.
            entity = False; buf += ch; continue
        if ch == ';' and depth == 0:
            out.append(buf); buf = ''
        else:
            buf += ch
    out.append(buf)
    return out


def style_to_jsx(match):
    decls = [d for d in _split_decls(match.group(1)) if d.strip()]
    pairs = []
    for d in decls:
        if ':' not in d:
            continue
        prop, val = d.split(':', 1)
        prop = prop.strip()
        key = re.sub(r'-([a-z])', lambda m: m.group(1).upper(), prop)
        if prop.startswith('--'):
            key = f"'{prop}'"
        # Single quotes delimit the string below, so any inside the value would
        # close it early -- a data: URI is full of them.
        # Unescaped HERE, per value, not globally: a global pass runs before
        # style="..." is parsed and &quot; -> " ends the attribute early.
        safe = html.unescape(val.strip()).replace('\\', '\\\\').replace("'", "\\'")
        pairs.append(f"{key}: '{safe}'")
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

# HTML boolean attributes arrive as `disabled=""`. In JSX that is
# disabled={""}, which is FALSY -- the control ships interactive while the
# design shows it inert. Silent: it type-checks, renders, and looks right
# until someone clicks the search box the design disabled on purpose.
BOOL_ATTRS = ('disabled', 'readonly', 'checked', 'required', 'selected',
              'multiple', 'autofocus', 'novalidate', 'hidden')
_n = sum(doc.count(f'{a}=""') for a in BOOL_ATTRS)
for _a in BOOL_ATTRS:
    _jsx = {'readonly': 'readOnly', 'autofocus': 'autoFocus',
            'novalidate': 'noValidate'}.get(_a, _a)
    doc = doc.replace(f'{_a}=""', _jsx)
step('boolean attributes (disabled="" is FALSY in JSX)', _n,
     sum(doc.count(f'{a}=\"\"') for a in BOOL_ATTRS))

# The exporter's cross-file include. It renders nothing and is not a valid
# component; the app supplies its own footer.
_n = len(re.findall(r'<dc-import', doc))
doc = re.sub(r'<dc-import[^>]*>.*?</dc-import>', '', doc, flags=re.S)
doc = re.sub(r'<dc-import[^>]*/?>', '', doc)
step('dc-import removed', _n, len(re.findall(r'<dc-import', doc)))

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

# Checked HERE, after the nav and footer are gone. Those carry design links
# that never reach the output, so reporting them trained the eye to skip this
# warning entirely. Anything still present now really would 404.
leftover = sorted(set(re.findall(r'href="([^"]*\.dc\.html)"', doc)))
if leftover:
    print(f'  ABORT - {len(leftover)} link(s) would 404:')
    for l in leftover:
        print(f'    {l}')
    sys.exit(1)

OUT_DIR.mkdir(parents=True, exist_ok=True)
(OUT_DIR / 'brand-dashboard-empty.css').write_text(css.strip() + '\n')
# The JSX scratch goes to a TEMP dir, never into app/. Written there it gets
# regenerated by the next run and swept up by a `git add <dir>`, which is how a
# 76-line copy of the markup ended up committed and deployed once already.
JSX_OUT = Path(tempfile.gettempdir()) / f'{OUT_DIR.name}-desktop-body.jsx.txt'
JSX_OUT.write_text(doc.strip() + '\n')

print('\n'.join(steps))
print(f'\n  css  -> {OUT_DIR / "brand-dashboard-empty.css"}  ({len(css)} chars)')
print(f'  jsx  -> {JSX_OUT}  ({len(doc)} chars)')
print('\n  Next: wrap the body in a component, replace the placeholder identity')
print('  with props, and delete the .jsx.txt scratch file.')
