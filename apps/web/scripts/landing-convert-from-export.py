#!/usr/bin/env python3
"""
Convert the "Landing - desktop" design export into the JSX body of
app/LandingPageClient.tsx.

Same shape as the brands and creators converters, and the same hard-won rule
ORDERING: anything matching raw CSS text must run BEFORE style="…" becomes a
JSX object, and anything matching the converted form must run after. Getting
that backwards is always a silent no-op — the only way to catch it is to count
what each rule changed, which is what every step below prints.

Run from apps/web:  python3 scripts/landing-convert-from-export.py
"""
import json
import os
import re

S = "/private/tmp/claude-501/-Users-palakjain/98efe6a8-2823-4c79-8309-ba18d97dc82d/scratchpad"
html = open(f"{S}/landing-body.html").read()
ASSETS = json.load(open(f"{S}/landing-assets.json"))

steps = []
def step(label, before, after):
    """Record what a rule changed. Every rule reports, because the failure mode
    here is a silent no-op — a rule that matched nothing looks identical to one
    that worked until you count."""
    steps.append((label, before, after))

# ── 1. Drop the export's own <nav>. ────────────────────────────────────────
# The page renders the shared <MarketingNav>, so that every marketing surface
# carries one header with one set of behaviours (the capsule that splits on
# scroll). The export's nav is the same design but a second implementation.
n0 = html.count('<nav')
i = html.find('<nav')
if i != -1:
    j = html.index('</nav>', i) + len('</nav>')
    html = html[:i] + html[j:]
step("export nav removed", n0, html.count('<nav'))

# ── 1b. Repair the export's tag structure. ─────────────────────────────────
# The export ships six unbalanced tags. A browser silently repairs them; JSX is
# parsed, not scavenged, so each one is a hard build error — the surplus </div>
# inside #how re-parents the whole rest of the section, and </x-dc>, </body>
# and </html> belong to wrappers that sit outside the slice we extract.
#
# The rule is narrow on purpose: drop a closing tag ONLY when nothing matching
# is open. That leaves every legitimately nested tag alone, and it repairs both
# failure modes — the stray closers at the end and the surplus one mid-document.
VOID = {'img', 'br', 'hr', 'input', 'source', 'path', 'circle', 'rect', 'line',
        'polyline', 'ellipse', 'stop', 'use', 'polygon', 'meta', 'link'}

def repair_structure(src):
    stack, drop = [], []
    for m in re.finditer(r'<(/?)([A-Za-z][\w-]*)([^>]*?)(/?)>', src):
        closing, tag, _attrs, selfclose = m.groups()
        if selfclose or tag in VOID:
            continue
        if closing:
            # Nearest matching opener, if any.
            idx = next((n for n in range(len(stack) - 1, -1, -1) if stack[n][0] == tag), None)
            # Would unwinding to it close a landmark on the way? The export's
            # surplus </div> sits inside <section id="how">, and an earlier
            # unclosed <div> means a naive "does anything match?" check pops the
            # section too — ending it early and orphaning its real </section>
            # further down. Either repair is a guess on malformed input; this
            # one keeps the section boundaries the design intends.
            crosses = idx is not None and any(
                t in ('section', 'main', 'footer', 'nav', 'article') for t, _ in stack[idx + 1:])
            if idx is not None and not crosses:
                del stack[idx:]
            else:
                drop.append((m.start(), m.end(), tag))
        else:
            stack.append((tag, m.start()))
    for start, end, _tag in reversed(drop):
        src = src[:start] + src[end:]
    return src, [t for _, _, t in drop]

before_len = len(html)
html, dropped = repair_structure(html)
step("unmatched closers dropped", len(dropped), 0)
if dropped:
    print(f"    (dropped: {', '.join('</' + d + '>' for d in dropped)})")

# ── 1c. The export's own footer placeholder. ───────────────────────────────
# <dc-import name="Site Footer"> is the design tool's reference to the footer
# file we already ported; the page renders the real <Footer> component instead.
n_foot = html.count('<dc-import')
i = html.find('<div id="landingFooter"')
if i != -1:
    depth, k = 0, i
    while True:
        m = re.compile(r'<(/?)div\b[^>]*>').search(html, k)
        depth += -1 if m.group(1) else 1
        k = m.end()
        if depth == 0:
            break
    html = html[:i] + html[k:]
step("export footer placeholder removed", n_foot, html.count('<dc-import'))

# ── 1d. Sections with no real data behind them. ───────────────────────────
# Each of these is a shell in the export: campaigns names three brands that are
# not ours, recent deals has nothing to show and real deal data is confidential
# anyway, and the creator roster and brand logos are both still behind their
# feature flags. They render as empty card frames, so they are removed rather
# than shipped blank.
#
# Removal is INDEX-BASED and runs BACK TO FRONT. Doing it with str.replace on
# the brands page spliced one section's wrapper inside another's, because the
# offsets of everything after a removal shift.
HIDE = [
    'Recent deals on',      # Deals on guapd
    'Featured',             # Featured campaigns  (id="campaigns")
    'Find vetted',          # Creators on guapd
    'Brands you',           # Brands we work with
]
spans = []
for needle in HIDE:
    at = html.find(needle)
    if at == -1:
        print(f"    WARNING: section marker not found: {needle!r}")
        continue
    start = html.rfind('<section', 0, at)
    if start == -1:
        print(f"    WARNING: no <section> wraps: {needle!r}")
        continue
    # Match the closing tag by scanning, so a nested <section> cannot end it early.
    depth, k = 0, start
    while True:
        m = re.compile(r'<(/?)section\b[^>]*>').search(html, k)
        depth += -1 if m.group(1) else 1
        k = m.end()
        if depth == 0:
            break
    spans.append((start, k, needle))
for start, end, needle in sorted(spans, reverse=True):
    html = html[:start] + html[end:]
step("data-less sections removed", len(spans), 0)

# ── 1e. The scroll-progress bar takes the brand colour. ───────────────────
# The export draws it in --ink, which reads as a black hairline creeping across
# the top. Neon is the brand's own accent and is what the rest of the page uses
# to mark progress.
before = html.count('id="scrollProgress"')
html = re.sub(r'(id="scrollProgress"[^>]*?)background:var\(--ink\)', r'\1background:var(--neon-deep)', html)
step("progress bar → brand colour", before, len(re.findall(r'id="scrollProgress"[^>]*background:var\(--neon-deep\)', html)))

# ── 1f. FAQ answers fill their column. ────────────────────────────────────
# The export caps each answer at 520px inside a 942px column, so every answer
# wraps early and leaves 400px of empty space to its right. Matching the export
# here reproduces the defect rather than the design intent; the cap is lifted so
# the text uses the column it is given.
before = html.count("max-width:520px")
html = re.sub(r'(<p style="[^"]*?)max-width:520px;?', r'\1max-width:none;', html)
step("FAQ answer width uncapped", before, html.count("max-width:520px"))

# ── 1g. The opening headline holds two lines. ─────────────────────────────
# "The operating system for creator deals." sits in a min(46%,520px) column
# while its font scales to 56px, so it broke to three lines at 1440 and 1920 and
# four at 900. The column is widened enough for the designed two-line break to
# hold, and the break is made explicit rather than left to chance.
before = html.count("width:min(46%,520px)")
html = html.replace("width:min(46%,520px)", "width:min(58%,700px)")
# The export breaks after "system", not after "for" — "The operating system /
# for creator deals." Breaking after "for" leaves a preposition stranded at the
# end of the line, which is what the design avoids.
html = html.replace("The operating system for <span", "The operating system<br />for <span")
step("headline column widened", before, html.count("width:min(46%,520px)"))

# ── 1h. The converge section's call to action is not a control. ───────────
# The export draws it as <div id="cvBtn"><span>Book demo</span></div> — styled
# like a button but with nothing to click. It becomes a real button that opens
# the same dialog as the header, keeping the export's own pill styling on the
# inner span.
before = html.count('id="cvBtn"')
html = html.replace('<div id="cvBtn"', '<button type="button" id="cvBtn" onClick="__DEMO__"')
if before:
    # close the matching </div> as </button>
    at = html.index('id="cvBtn"')
    depth, k = 0, html.rindex('<', 0, at)
    while True:
        m = re.compile(r'<(/?)(?:div|button)\b[^>]*>').search(html, k)
        depth += -1 if m.group(1) else 1
        k = m.end()
        if depth == 0:
            break
    html = html[:k - len('</div>')] + '</button>' + html[k:]
    # Strip the browser's own button chrome — it was drawing a grey box around
    # the export's pill — and make the pill neon, like every other Book demo on
    # the site. The export draws this one white-on-outline, which reads as a
    # secondary action when it is the page's closing call to action.
    html = html.replace(
        'background:#FFFFFF;border:1px solid #12151C;color:#12151C;',
        'background:var(--neon);border:none;color:var(--ink);', 1)
    html = html.replace(
        '<button type="button" id="cvBtn"',
        '<button type="button" id="cvBtn" class="cv-cta"', 1)
step("end-of-page CTA made clickable", before, html.count('<button type="button" id="cvBtn"'))

# ── 2. x-import → a real element. ──────────────────────────────────────────
# Every one on this page is the design system's primary Button. They are all
# calls to action, so they become links rather than buttons.
def replace_ximports(s):
    out, count = [], 0
    while True:
        m = re.search(r'<x-import\b[^>]*>', s)
        if not m:
            out.append(s)
            break
        tag = m.group(0)
        end = s.index('</x-import>', m.end())
        label = s[m.end():end].strip()
        style = re.search(r'style="([^"]*)"', tag)
        sty = f' style="{style.group(1)}"' if style else ''
        out.append(s[:m.start()])
        # "Book demo" opens the dialog, as it does in the header. The others are
        # navigation. Emitting a link for all of them left the one at the foot
        # of the page pointing at signup, which is not what it says it does.
        if label.strip().lower() == 'book demo':
            out.append(f'<button type="button" className="lp-btn" onClick={{() => setDemoOpen(true)}}{sty}>{label}</button>')
        else:
            out.append(f'<a href="__CTA__" className="lp-btn"{sty}>{label}</a>')
        s = s[end + len('</x-import>'):]
        count += 1
    return ''.join(out), count
before = html.count('<x-import')
html, _n = replace_ximports(html)
step("x-import → CTA links", before, html.count('<x-import'))

# ── 3. sc-for → a React map. ───────────────────────────────────────────────
# The export binds these to placeholder arrays that live in its own script; the
# data moves into the component and the loop becomes a real map. Done BEFORE
# the style conversion so the `{{ p.top }}` inside a style value is still raw
# text and can be handled as an interpolation rather than a quoted literal.
def convert_sc_for(s):
    count = 0
    while True:
        m = re.search(r'<sc-for\s+list="\{\{\s*(\w+)\s*\}\}"\s+as="(\w+)"[^>]*>', s)
        if not m:
            break
        lst, alias = m.group(1), m.group(2)
        # Match the closing tag by scanning, so a nested sc-for cannot end the
        # outer one early.
        depth, k = 1, m.end()
        while depth:
            nxt = re.search(r'<sc-for\b|</sc-for>', s[k:])
            k += nxt.end()
            depth += 1 if nxt.group(0).startswith('<sc-for') else -1
        inner = s[m.end():k - len('</sc-for>')]
        s = (s[:m.start()]
             + '{' + lst + '.map((' + alias + ', i) => (' + inner + '))}'
             + s[k:])
        count += 1
    return s, count
html, n_for = convert_sc_for(html)
step("sc-for → .map()", n_for, html.count('<sc-for'))

# ── 4. Image sources → the converted WebP assets. ──────────────────────────
before = sum(html.count(f'src="{k}"') for k in ASSETS)
for src, out in ASSETS.items():
    html = html.replace(f'src="{src}"', f'src="{out}"')
step("image srcs remapped", before, len(re.findall(r'src="(?!/landing/)[^"]*\.(?:png|jpe?g)"', html)))

# ── 5. The FAQ toggle. ─────────────────────────────────────────────────────
# The export writes it as onClick="{{ f.toggle }}", which React cannot accept.
before = html.count('onClick="{{')
html = re.sub(r'onClick="\{\{\s*\w+\.toggle\s*\}\}"', 'onClick={() => setOpenFaq(openFaq === i ? -1 : i)}', html)
step("FAQ toggle wired", before, html.count('onClick="{{'))

# ── 5b. Bindings in text and attribute position → JSX expressions.
# MUST run BEFORE the style conversion. It ran after, and its regex ate the
# `{{ … }}` that style_to_jsx had just produced — turning every style object
# back into a bare block and breaking the whole file. This is the ordering trap
# the docstring warns about, and it is invisible without reading the output.
before = html.count('{{')
html = re.sub(r'\{\{\s*([^}]+?)\s*\}\}', lambda m: '{' + m.group(1) + '}', html)
step("{{ }} → { }", before, html.count('{{'))

# ── 5c. sc-if → a conditional render. ──────────────────────────────────────
def convert_sc_if(s):
    count = 0
    while True:
        m = re.search(r'<sc-if\s+value="\{([^}]+)\}"[^>]*>', s)
        if not m:
            break
        cond = m.group(1).strip()
        depth, k = 1, m.end()
        while depth:
            nxt = re.search(r'<sc-if\b|</sc-if>', s[k:])
            k += nxt.end()
            depth += 1 if nxt.group(0).startswith('<sc-if') else -1
        inner = s[m.end():k - len('</sc-if>')]
        s = s[:m.start()] + '{' + cond + ' && (<>' + inner + '</>)}' + s[k:]
        count += 1
    return s, count
before = html.count('<sc-if')
html, _ = convert_sc_if(html)
step("sc-if → conditional", before, html.count('<sc-if'))

# ── 6. style="…" → a JSX object. ───────────────────────────────────────────
# EVERYTHING above this line matches raw CSS text; everything below matches the
# converted form.
def camel(p):
    p = p.strip()
    return f"'{p}'" if p.startswith('--') else re.sub(r'-([a-z])', lambda m: m.group(1).upper(), p)

def style_to_jsx(s):
    out = []
    for d in s.split(';'):
        if ':' not in d:
            continue
        k, v = d.split(':', 1)
        if not k.strip():
            continue
        # Escape for a single-quoted JS string. grid-template-areas values are
        # themselves quoted ('a a b' 'c d b'), so an unescaped value closes the
        # string early and the file stops parsing.
        v = v.strip().replace("\\", "\\\\").replace("'", "\\'")
        # A {{ expr }} inside a value is a binding, not text — emit a template
        # literal so it evaluates instead of rendering the braces.
        if '{{' in v:
            expr = re.sub(r'\{\{\s*([^}]+?)\s*\}\}', lambda m: '${' + m.group(1) + '}', v)
            out.append(f"{camel(k)}: `{expr}`")
        else:
            out.append(f"{camel(k)}: '{v}'")
    return "{{" + ", ".join(out) + "}}"
before = len(re.findall(r'style="', html))
html = re.sub(r'style="([^"]*)"', lambda m: 'style=' + style_to_jsx(m.group(1)), html)
step("style → JSX object", before, len(re.findall(r'style="', html)))

# ── 7b. Attribute values that are a single binding. ────────────────────────
# `d="{f.icon}"` passes the literal seven characters to SVG, which then logs
# `Expected moveto path command ('M' or 'm'), "{f.icon}"` and draws nothing. In
# JSX the braces have to replace the quotes, not sit inside them.
before = len(re.findall(r'=\"\{[^"{}]+\}\"', html))
html = re.sub(r'=\"\{([^"{}]+)\}\"', lambda m: '={' + m.group(1) + '}', html)
step("attr=\"{expr}\" → attr={expr}", before, len(re.findall(r'=\"\{[^"{}]+\}\"', html)))

# ── 8. Attributes React spells differently. ────────────────────────────────
before = html.count('class="')
html = re.sub(r'\bclass="', 'className="', html)
html = re.sub(r'\bfor="', 'htmlFor="', html)
step("class → className", before, html.count('class="'))

# SVG attributes must be camelCase. React silently DROPS the hyphenated form,
# so every icon would lose its strokes and a missing viewBox would not scale.
SVG_ATTRS = ['stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
             'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit', 'fill-rule',
             'clip-rule', 'fill-opacity', 'stop-color', 'stop-opacity', 'text-anchor',
             'clip-path', 'vector-effect', 'paint-order', 'dominant-baseline',
             'view-box', 'stroke-width']
before = sum(html.count(f'{a}="') for a in SVG_ATTRS)
for a in SVG_ATTRS:
    html = html.replace(f'{a}="', re.sub(r'-([a-z])', lambda m: m.group(1).upper(), a) + '="')
step("SVG attrs camelCased", before, sum(html.count(f'{a}="') for a in SVG_ATTRS))

# Design-tool prefixes: sc-camel-view-box really means viewBox.
before = len(re.findall(r'sc-camel-', html))
html = re.sub(r'sc-camel-on-[a-z-]+="[^"]*"\s*', '', html)
html = re.sub(r'sc-camel-([a-z-]+)=',
              lambda m: re.sub(r'-([a-z])', lambda g: g.group(1).upper(), m.group(1)) + '=',
              html)
step("sc-camel-* resolved", before, len(re.findall(r'sc-camel-', html)))

# Inline DOM handlers are attribute strings the export used for hover effects.
# React cannot take them, and hover belongs in CSS anyway.
before = len(re.findall(r'\son[A-Za-z]+="this\.', html))
html = re.sub(r'\son[A-Za-z]+="this\.[^"]*"', '', html)
step("inline handlers stripped", before, len(re.findall(r'\son[A-Za-z]+="this\.', html)))

# ── 8b. image-slot → a real box. ───────────────────────────────────────────
# The design tool's placeholder element. There is no asset behind these — they
# are the campaign card images — so each becomes a labelled empty box at the
# same size, rather than a broken <img>. They carry the placeholder text as a
# data attribute so it is obvious in the DOM what is still missing.
def _slot(m):
    tag = m.group(0)
    sty = re.search(r'style=(\{\{.*?\}\})', tag, re.S)
    ph = re.search(r'placeholder="([^"]*)"', tag)
    idm = re.search(r'id="\{?([^"}]*)\}?"', tag)
    st = sty.group(1) if sty else "{{width: '100%', height: '100%'}}"
    label = ph.group(1) if ph else ''
    return (f'<div aria-hidden="true" data-placeholder="{label}" '
            f'style={{{{...{st[1:-1]}, background: \'var(--paper-2, #EDF0F5)\', borderRadius: \'28px\'}}}} />')
before = html.count('<image-slot')
html = re.sub(r'<image-slot\b[^>]*?>', _slot, html)
html = html.replace('</image-slot>', '')
step("image-slot → placeholder box", before, html.count('<image-slot'))

# ── 8c. Duplicate style properties. ────────────────────────────────────────
# The export writes e.g. `border-bottom:...;border-bottom:none` in one rule. CSS
# takes the last; a JS object literal is a TypeScript error. Keep the last, so
# the rendered result matches the browser's reading of the original.
def _dedupe(m):
    body = m.group(1)
    seen, keep = {}, []
    for part in re.findall(r"(?:[^,'`]|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`)+", body):
        if ':' not in part:
            continue
        key = part.split(':', 1)[0].strip()
        seen[key] = part.strip()
    return 'style={{' + ', '.join(seen.values()) + '}}'
before = len(re.findall(r'style=\{\{', html))
html = re.sub(r'style=\{\{(.*?)\}\}', _dedupe, html, flags=re.S)
step("duplicate style props merged", before, len(re.findall(r'style=\{\{', html)))

# ── 9. HTML comments → JSX comments. ───────────────────────────────────────
before = len(re.findall(r'<!--', html))
html = re.sub(r'<!--(.*?)-->', lambda m: '{/*' + m.group(1).replace('*/', '* /') + '*/}', html, flags=re.S)
step("comments converted", before, len(re.findall(r'<!--', html)))

# ── 9b. Em dashes in visible copy. ────────────────────────────────────────
# The design leans on them as a general-purpose connector, which reads as a tic
# when there are seven on one page. A dash joining two clauses becomes a comma;
# dashes standing in for an absent value are left alone, as are the ones inside
# JSX comments, which nobody reads on the page.
def _dedash(chunk):
    chunk = chunk.replace('&mdash;', '\u2014')
    # " word — word " → " word, word ". Requires spaces on both sides so an
    # em dash used as a value placeholder ("—" alone in a cell) is untouched.
    return re.sub(r'(\w)\s+\u2014\s+(\w)', r'\1, \2', chunk)

parts = re.split(r'(\{/\*.*?\*/\})', html, flags=re.S)
before = sum(p.count('\u2014') + p.count('&mdash;') for p in parts[::2])
parts[::2] = [_dedash(p) for p in parts[::2]]
html = ''.join(parts)

# One dash was doing real work and a comma broke the sentence. In
# "in one shared space \u2014 offers, approvals, deliverables and payments" the dash
# introduces the list; swapping it for a comma made "space" read as the first
# item of that list. A colon does the job the dash was doing.
html = html.replace('in one shared space, offers,', 'in one shared space: offers,')
step("em dashes in copy → commas", before, sum(p.count('\u2014') for p in html.split('{/*')[:1]))

# ── 10. Void elements must be self-closed. ─────────────────────────────────
for tag in ['img', 'br', 'hr', 'input', 'source', 'path', 'circle', 'rect', 'line', 'polyline', 'ellipse', 'stop', 'use']:
    html = re.sub(rf'<{tag}\b([^>]*?)\s*/?>', lambda m: f'<{tag}{m.group(1).rstrip()} />', html)
html = re.sub(r'</(?:path|circle|rect|line|polyline|ellipse|stop|use)>', '', html)

# ── 11. Below-the-fold images load lazily; the hero does not. ──────────────
EAGER = ('hero-outer-bg', 'hero-inner-mascot', 'gemini-generated-image')
def _img(m):
    tag = m.group(0)
    if 'loading=' in tag:
        return tag
    eager = any(e in tag for e in EAGER)
    extra = ' decoding="async"' + ('' if eager else ' loading="lazy"')
    return tag[:-2].rstrip() + extra + ' />'
before = len(re.findall(r'<img\b', html))
html = re.sub(r'<img\b[^>]*/>', _img, html)
step("img loading hints", before, len(re.findall(r'loading="lazy"', html)))

# ── 11b. Intrinsic dimensions on every image. ─────────────────────────────
# A lazy image with `width:100%;height:auto` and no width/height attributes has
# no aspect ratio to reserve space with, so it lays out at zero until it loads —
# which collapsed the "Everything, always in view" section to 0px high, because
# its only content is one such image and it sits far enough down the page never
# to have loaded by the time it is measured.
#
# Added ONLY where the style declares neither aspect-ratio nor an explicit
# height: the HTML attributes map to a presentational `height` that OVERRIDES
# CSS aspect-ratio, and on the brands page that stretched a section by 265px.
from PIL import Image as _PILImage
def _dims(m):
    tag = m.group(0)
    src = re.search(r'src="(/landing/[^"]+)"', tag)
    if not src or 'width=' in tag:
        return tag
    if 'aspectRatio' in tag or re.search(r"height: '(?!auto)", tag):
        return tag
    path = os.path.join(os.path.dirname(__file__), '..', 'public', src.group(1).lstrip('/'))
    if not os.path.exists(path):
        return tag
    w, h = _PILImage.open(path).size
    return tag[:-2].rstrip() + f' width={{{w}}} height={{{h}}} />'
before = len(re.findall(r'<img\b[^>]*width=', html))
html = re.sub(r'<img\b[^>]*/>', _dims, html)
step("intrinsic image dimensions", before, len(re.findall(r'<img\b[^>]*width=', html)))

# ── 12. Heading hierarchy. ─────────────────────────────────────────────────
# The export already marks the page's actual subject — "Creator deals without
# the chaos." — as its single <h1>, so this leaves it alone. Promoting the
# first heading instead, as the brands converter does, would demote that
# headline and hand the H1 to the section above it, which is an eyebrow.
# Only step in if the export ever ships zero or several.
h1s = len(re.findall(r'<h1\b', html))
if h1s != 1:
    html = html.replace('<h1 ', '<h2 ').replace('</h1>', '</h2>')
    first = html.find('<h2 ')
    if first != -1:
        close = html.find('</h2>', first)
        html = html[:first] + '<h1 ' + html[first + 4:close] + '</h1>' + html[close + 5:]
step("single H1", h1s, len(re.findall(r'<h1\b', html)))

# ── 13. Calls to action. ───────────────────────────────────────────────────
before = html.count('__CTA__')
html = html.replace('href="__CTA__"', 'href="/signup/brand"')
html = html.replace('onClick="__DEMO__"', 'onClick={() => setDemoOpen(true)}')
html = html.replace('href="For Brands.dc.html"', 'href="/brands"')
html = html.replace('href="For Creators.dc.html"', 'href="/creators"')
html = html.replace('href="#login"', 'href="/login/brand"')
step("CTAs pointed at real routes", before, html.count('__CTA__'))

# ── 14. Reveal-on-scroll. ──────────────────────────────────────────────────
# The export's script adds .sr-in when an element enters the viewport; the CSS
# for both states is already ported. The component does the same with an
# IntersectionObserver, so nothing here needs to change — this only counts them
# so a future edit that drops the class is visible.
n_sr = len(re.findall(r'className="[^"]*\bsr\b', html))

out = f"{S}/landing-final.txt"
open(out, 'w').write(html)

print(f"  ── conversion ──")
for label, b, a in steps:
    print(f"    {label:<32} {b:>5} → {a}")
print(f"    reveal elements (.sr)            {n_sr}")
print(f"    written: {out}  ({len(html):,} chars)")
