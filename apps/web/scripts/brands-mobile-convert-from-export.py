#!/usr/bin/env python3
"""
Convert the mobile "For Brands" export into the JSX body of
app/creators/BrandsMobileClient.tsx.

Run from apps/web:  python3 scripts/brands-mobile-convert-from-export.py

Same rule ORDERING discipline as the other converters: anything matching raw CSS
text runs BEFORE style="…" becomes a JSX object; anything matching the converted
form runs after. Getting that backwards is always a silent no-op, so every step
prints what it changed.

This export is a DEVICE PREVIEW — the page is nested inside a 390px phone frame.
The frame is flattened in CSS rather than unwrapped here, because the content
sits inside it and restructuring the DOM is the riskier of the two.
"""
import json
import os
import re

S = "/private/tmp/claude-501/-Users-palakjain/98efe6a8-2823-4c79-8309-ba18d97dc82d/scratchpad"
html = open(f"{S}/brands-mobile-body.html").read()
ASSETS = json.load(open(f"{S}/brands-mobile-assets.json"))

steps = []
def step(label, before, after):
    """Record what a rule changed. The failure mode here is a silent no-op — a
    rule that matched nothing looks identical to one that worked until you
    count."""
    steps.append((label, before, after))

# ── 0. Take only the page. ─────────────────────────────────────────────────
# The decoded bundle is a whole document — <html>, <head>, the loader <script>
# tags and a <helmet> block. Everything before the body is scaffolding, and its
# script srcs are asset UUIDs that would otherwise look like unmapped images.
before = len(re.findall(r'<script|<helmet|<head', html))
for marker in ('</helmet>', '<body>', '</head>'):
    if marker in html:
        html = html[html.index(marker) + len(marker):]
        break
html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S)
html = re.sub(r'</?(?:x-dc|helmet|body|html)[^>]*>', '', html)
step("document scaffolding removed", before, len(re.findall(r'<script|<helmet|<head', html)))

# ── 1. The export's own <style> blocks. ────────────────────────────────────
# They are scoped into app/creators-mobile.css by the sibling script; leaving
# them inline would put unscoped html/body rules into the page.
before = len(re.findall(r'<style', html))
html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.S)
step("inline <style> stripped", before, len(re.findall(r'<style', html)))

# ── 1i. The page wrapper must not become a scroll container. ──────────────
# The export's outermost div carries overflow-x:hidden. CSS then computes
# overflow-y as `auto` — a visible/non-visible pair is not permitted — so the
# whole page became a ~5,000px scroll container nested inside the window.
# Scrolling moved that div, not the page: it read as sticking, and the
# scroll-progress bar (which measures documentElement) never moved either.
#
# `clip` gives the same visual containment with no scroll container. Same fix as
# the landing page, and the same root cause as the carousels swallowing vertical
# swipes.
before = html.count("overflow-x:hidden")
html = html.replace("overflow-x:hidden", "overflow-x:clip")
step("page wrapper clip, not hidden", before, html.count("overflow-x:hidden"))

# ── 2. The export's own <nav>. ─────────────────────────────────────────────
# The page renders the shared <MarketingNav>, so every marketing surface carries
# one header with one set of behaviours.
n0 = html.count('<nav')
i = html.find('<nav')
if i != -1:
    j = html.index('</nav>', i) + len('</nav>')
    html = html[:i] + html[j:]
step("export nav removed", n0, html.count('<nav'))

# ── 3. Repair the export's tag structure. ──────────────────────────────────
# Browsers silently fix unbalanced tags; JSX is parsed, not scavenged. Drop a
# closing tag ONLY when nothing matching is open, and never let one unwind past
# a landmark — otherwise a section ends early and orphans its own </section>.
VOID = {'img', 'br', 'hr', 'input', 'source', 'path', 'circle', 'rect', 'line',
        'polyline', 'ellipse', 'stop', 'use', 'polygon', 'meta', 'link'}

def repair_structure(src):
    stack, drop = [], []
    for m in re.finditer(r'<(/?)([A-Za-z][\w-]*)([^>]*?)(/?)>', src):
        closing, tag, _attrs, selfclose = m.groups()
        if selfclose or tag in VOID:
            continue
        if closing:
            idx = next((n for n in range(len(stack) - 1, -1, -1) if stack[n][0] == tag), None)
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

html, dropped = repair_structure(html)
step("unmatched closers dropped", len(dropped), 0)
if dropped:
    print(f"    (dropped: {', '.join('</' + d + '>' for d in dropped)})")

# ── 4. Sections with nothing real behind them. ─────────────────────────────
# The creator roster and the brand logos are both still behind their feature
# flags. Testimonials goes too: there are no brand quotes to show, and the
# desktop page does not carry the section either. Index-based and
# back to front, because every offset after a removal shifts.
HIDE = ['Find creators for every', 'Trusted by', 'Run deals directly']
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
    depth, k = 0, start
    while True:
        m = re.compile(r'<(/?)section\b[^>]*>').search(html, k)
        depth += -1 if m.group(1) else 1
        k = m.end()
        if depth == 0:
            break
    spans.append((start, k, needle))
for start, end, _needle in sorted(spans, reverse=True):
    html = html[:start] + html[end:]
step("flagged-off sections removed", len(spans), 0)

# ── 4b. The export's own footer. ───────────────────────────────────────────
# The page renders the site <Footer>, the one ported from the footer design.
# Leaving the export's would put two footers on every phone.
n_foot = html.count('<footer')
i = html.find('<footer')
if i != -1:
    depth, k = 0, i
    while True:
        m = re.compile(r'<(/?)footer\b[^>]*>').search(html, k)
        depth += -1 if m.group(1) else 1
        k = m.end()
        if depth == 0:
            break
    html = html[:i] + html[k:]
step("export footer removed", n_foot, html.count('<footer'))

# ── 4c. Reviews. ──────────────────────────────────────────────────────────
# Left as the export ships them. The desktop brands page shows its testimonial
# section without review cards — there are no brand quotes to use yet — so the
# handles that the creators port normalises have no equivalent here.

# ── 4d. Ticker chips set as eyebrows. ──────────────────────────────────────
# Same treatment as the desktop page: uppercase, small, letter-spaced, matching
# .t-meta in the design system rather than sentence-case body text.
before = html.count("font-size:11.5px;color:var(--ink-soft)")
html = html.replace(
    "font-family:var(--font-ui);font-size:11.5px;color:var(--ink-soft);",
    "font-family:var(--font-ui);font-size:9.5px;font-weight:500;letter-spacing:.14em;"
    "text-transform:uppercase;color:var(--ink-soft);")
step("ticker chips → eyebrow type", before, html.count("font-size:11.5px;color:var(--ink-soft)"))

# ── 4e. The reviews heading sits closer to its cards. ──────────────────────
# 20px above the heading and 32px below it pushed the section down far enough
# that the heading and the first card did not read as one block.
# The rule has to run on the RAW markup: at this point class= has not yet become
# className= and the style is still a CSS string.
before = html.count("line-height:1.2;font-size:23px;margin:20px 0 0;")
html = html.replace("line-height:1.2;font-size:23px;margin:20px 0 0;",
                    "line-height:1.2;font-size:23px;margin:6px 0 0;")
html = html.replace('class="snap-track" style="gap:20px;padding:0 24px;margin-top:32px;"',
                    'class="snap-track" style="gap:20px;padding:0 24px;margin-top:20px;"')
step("reviews heading raised", before, html.count("line-height:1.2;font-size:23px;margin:20px 0 0;"))

# ── 4f. Ticker speed. ──────────────────────────────────────────────────────
# The export's 32s crawl reads as static on a phone, where much less of the
# track is on screen at once. The duration is inline, so it is set here rather
# than in the stylesheet, which it would outrank.
# The export runs two tracks at different speeds (22s and 26s); both are cut by
# roughly a third rather than flattened to one number, so the two keep the
# offset that stops them reading as a single band.
SPEEDS = {'mqMove 22s': 'mqMove 14s', 'mqMove 26s': 'mqMove 17s'}
before = sum(html.count(k) for k in SPEEDS)
for slow, quick in SPEEDS.items():
    html = html.replace(slow, quick)
step("ticker speed increased", before, sum(html.count(k) for k in SPEEDS))

# ── 4g. Reveal-on-scroll, as the desktop page has. ────────────────────────
# The mobile export ships no .sr elements at all — its sections simply appear.
# The desktop port reveals 14 of them, so the same page animated on one layout
# and not the other. Every top-level section gets the class; the component's
# observer adds .sr-in as each comes into view, and creators-mobile.css carries
# both states.
before = len(re.findall(r'class="[^"]*\bsr\b', html))
html = re.sub(r'<section\b(?![^>]*class=)', '<section class="sr"', html)
html = re.sub(r'<section\b([^>]*?)class="([^"]*)"', r'<section\1class="sr \2"', html)
step("sections given reveals", before, len(re.findall(r'class="sr', html)))

# ── 4h. Scroll progress, in the brand colour. ─────────────────────────────
# The landing page has one and this page is ~7,000px on a phone, so there was no
# read on how far through you are. Same element and same colour as the landing
# page's, driven by the component.
before = html.count('id="brandProgress"')
html = ('<div id="brandProgress" style="position:fixed;top:0;left:0;height:2px;width:0%;'
        'background:var(--neon-deep);z-index:200;transition:width .1s linear;"></div>\n' + html)
step("scroll progress added", before, html.count('id="brandProgress"'))

# ── 4j. Comparison-table rows and card copy. ──────────────────────────────
# The same rewrite the desktop ports carry, so the two layouts of one page do
# not make different claims.
#
# The row that mattered: "Money released on approval" is FALSE. We track
# payment, we do not hold or release it — escrow is the single biggest thing
# the roadmap defers, because holding funds is RBI payment-aggregator
# territory. A creator would join expecting protection we do not provide.
COPY = {
    'Offers in one place': 'Every offer with rate, scope and dates',
    'Written, locked terms': 'Terms locked the moment you accept',
    'Revision tracking': 'Revisions counted against what you agreed',
    'Real-time payment status': 'Payment terms agreed before you shoot',
    'Counter any offer': 'Counter a price without an awkward DM',
    'No content buried in DMs': 'Usage rights and boosting, with an end date',
    'Money released on approval': 'Every change timestamped, by both sides',
    'Same format, every time.': 'No scope argument three weeks in.',
    'Locked the moment you agree.': 'Neither side can quietly move them.',
    'Approve and revise in one place.': 'Revisions counted against the limit you set.',
    'Agreed to closed, live.': 'Nobody has to ask where the money is.',
    'Re-run a deal in one tap.': 'Previous terms pre-filled, nothing renegotiated.',
}
before = sum(html.count(f'>{k}<') for k in COPY)
for old, new in COPY.items():
    html = html.replace(f'>{old}<', f'>{new}<')
step("comparison rows rewritten", before, sum(html.count(f'>{k}<') for k in COPY))

# ── 4k. The guapd vs agency table. ────────────────────────────────────────
# Same rewrite as the desktop page. The row that mattered: "One contract, both
# sign" is an OVERCLAIM — nothing in the product signs anything. Aadhaar eSign
# is on the deferred list and the brief says explicitly not to treat a
# click-accept screen as definitively legally binding. What IS true is that the
# terms are written, agreed by both parties and timestamped.
AGENCY_ROWS = {
    'Message creators directly': 'Talk to the creator, not a middleman',
    'One contract, both sides sign': 'Terms in writing, agreed by both sides',
    'One contract, both sign': 'Terms in writing, agreed by both sides',
    'Your data stays private': 'No middleman knows what you pay',
    'One workflow, start to finish': 'Brief to payout in one place',
    'Every approval on record': 'Every approval timestamped, not remembered',
    'Multiple deals at once': 'A whole campaign from one brief',
}
before = sum(html.count(f'>{k}<') for k in AGENCY_ROWS)
for old, new in AGENCY_ROWS.items():
    html = html.replace(f'>{old}<', f'>{new}<')
step("agency-table rows rewritten", before, sum(html.count(f'>{k}<') for k in AGENCY_ROWS))

# ── 5. Images → the converted assets. ──────────────────────────────────────
before = sum(html.count(f'src="{k}"') for k in ASSETS)
for uid, out in ASSETS.items():
    html = html.replace(f'src="{uid}"', f'src="{out}"')
step("image srcs remapped", before, len(re.findall(r'src="[0-9a-f\-]{36}"', html)))

# ── 5b. image-slot → a real <img>. ─────────────────────────────────────────
# The design tool's own element. React would render <image-slot> as an unknown
# custom element and show nothing, so the ones carrying a src become images and
# the placeholder text becomes their alt.
def _slot(m):
    tag = m.group(0)
    src = re.search(r'src="([^"]+)"', tag)
    sty = re.search(r'style=("[^"]*"|\{\{.*?\}\})', tag, re.S)
    ph = re.search(r'placeholder="([^"]*)"', tag)
    if not src:
        return ''
    st = sty.group(1) if sty else '"width:100%;height:auto"'
    return f'<img src="{src.group(1)}" alt="{ph.group(1) if ph else ""}" style={st} />'
before = html.count('<image-slot')
html = re.sub(r'<image-slot\b[^>]*?/?>', _slot, html)
html = html.replace('</image-slot>', '')
step("image-slot → img", before, html.count('<image-slot'))

# ── 6. Real companies out of the mockups. ──────────────────────────────────
# Same substitution as the landing page: these are real Indian fintechs and none
# of them is a customer, so on a public page they read as a client list.
FAKE_BRANDS = {'Groww': 'Glow Labs', 'Zerodha': 'Move Athletics', 'Fi Money': 'Bawa Labs'}
before = sum(html.count(f'>{k}<') for k in FAKE_BRANDS)
for real, invented in FAKE_BRANDS.items():
    html = html.replace(f'>{real}<', f'>{invented}<')
step("real company names replaced", before, sum(html.count(f'>{k}<') for k in FAKE_BRANDS))

# ── 7. Testimonial handles. ────────────────────────────────────────────────
# The desktop page carries the same three reviews under the same two handles.
before = len(re.findall(r'@[a-z_]+', html))
html = html.replace('@creator_handle', '@uvichar_')
step("handles normalised", before, len(re.findall(r'@[a-z_]+', html)))

# ── 8. font-weight 800 renders as 700. ─────────────────────────────────────
# The export's font is loaded without an 800 face, so every 800 in the design
# renders at 700 in the file it was signed off against. next/font DOES ship 800,
# which would render heavier than the design.
before = html.count('font-weight:800')
html = html.replace('font-weight:800', 'font-weight:700')
step("font-weight 800 → 700", before, html.count('font-weight:800'))

# ── 9. Em dashes in visible copy. ──────────────────────────────────────────
def _dedash(chunk):
    chunk = chunk.replace('&mdash;', '—')
    return re.sub(r'(\w)\s+—\s+(\w)', r'\1, \2', chunk)
before = html.count('—') + html.count('&mdash;')
html = _dedash(html)
step("em dashes in copy → commas", before, html.count('—'))

# ── 10. Bindings, then style. ──────────────────────────────────────────────
# MUST run before the style conversion: this regex would otherwise eat the
# {{ … }} that style_to_jsx produces and turn every style object into a bare
# block.
before = html.count('{{')
html = re.sub(r'\{\{\s*([^}]+?)\s*\}\}', lambda m: '{' + m.group(1) + '}', html)
step("{{ }} → { }", before, html.count('{{'))

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
        # Escaped for a single-quoted JS string: values such as
        # grid-template-areas are themselves quoted and would close it early.
        v = v.strip().replace("\\", "\\\\").replace("'", "\\'")
        out.append(f"{camel(k)}: '{v}'")
    return "{{" + ", ".join(out) + "}}"

before = len(re.findall(r'style="', html))
html = re.sub(r'style="([^"]*)"', lambda m: 'style=' + style_to_jsx(m.group(1)), html)
step("style → JSX object", before, len(re.findall(r'style="', html)))

# ── 11. Attributes React spells differently. ───────────────────────────────
before = html.count('class="')
html = re.sub(r'\bclass="', 'className="', html)
html = re.sub(r'\bfor="', 'htmlFor="', html)
step("class → className", before, html.count('class="'))

before = len(re.findall(r'=\"\{[^"{}]+\}\"', html))
html = re.sub(r'=\"\{([^"{}]+)\}\"', lambda m: '={' + m.group(1) + '}', html)
step('attr="{expr}" → attr={expr}', before, len(re.findall(r'=\"\{[^"{}]+\}\"', html)))

# React silently DROPS hyphenated SVG attributes, so icons lose their strokes
# and a missing viewBox does not scale.
before = len(re.findall(r'sc-camel-', html))
html = re.sub(r'sc-camel-on-[a-z-]+="[^"]*"\s*', '', html)
html = re.sub(r'sc-camel-([a-z-]+)=',
              lambda m: re.sub(r'-([a-z])', lambda g: g.group(1).upper(), m.group(1)) + '=',
              html)
step("sc-camel-* resolved", before, len(re.findall(r'sc-camel-', html)))
# NOTE: 'view-box' is deliberately absent — sc-camel-view-box is resolved
# above, and listing it here rewrote that to sc-camel-viewBox, which the
# lowercase-only sc-camel rule then never matched.
SVG_ATTRS = ['stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
             'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit', 'fill-rule',
             'clip-rule', 'fill-opacity', 'stop-color', 'stop-opacity', 'text-anchor',
             'clip-path', 'vector-effect', 'paint-order', 'dominant-baseline']
before = sum(html.count(f'{a}="') for a in SVG_ATTRS)
for a in SVG_ATTRS:
    html = html.replace(f'{a}="', re.sub(r'-([a-z])', lambda m: m.group(1).upper(), a) + '="')
step("SVG attrs camelCased", before, sum(html.count(f'{a}="') for a in SVG_ATTRS))


# Inline DOM handlers are attribute strings React cannot take, and a string ref
# in a function component crashes hydration outright — which is what blanked the
# desktop creators page once.
before = len(re.findall(r'\son[A-Za-z]+="', html)) + len(re.findall(r'\bref="', html))
html = re.sub(r'\son[A-Za-z]+="[^"]*"', '', html)
html = re.sub(r'\sref="[^"]*"', '', html)
step("inline handlers + string refs stripped", before,
     len(re.findall(r'\son[A-Za-z]+="', html)) + len(re.findall(r'\bref="', html)))

# ── 11b. The two accordion rows. ───────────────────────────────────────────
# The export binds them to its own toggleRowN / rowNOpen handles and wraps each
# body in <sc-if>. React would render sc-if as an unknown element and the
# handles do not exist, so both become real state on the component.
def convert_sc_if(src):
    count = 0
    while True:
        m = re.search(r'<sc-if\s+value=\{([^}]+)\}[^>]*>', src)
        if not m:
            break
        cond = m.group(1).strip()
        depth, k = 1, m.end()
        while depth:
            nxt = re.search(r'<sc-if\b|</sc-if>', src[k:])
            k += nxt.end()
            depth += 1 if nxt.group(0).startswith('<sc-if') else -1
        inner = src[m.end():k - len('</sc-if>')]
        src = src[:m.start()] + '{' + cond + ' && (<>' + inner + '</>)}' + src[k:]
        count += 1
    return src, count
before = html.count('<sc-if')
html, _n = convert_sc_if(html)
step("sc-if → conditional", before, html.count('<sc-if'))

before = len(re.findall(r'toggleRow\d', html))
html = re.sub(r'onClick=\{toggleRow(\d)\}', r'onClick={() => setOpenRow(openRow === \1 ? 0 : \1)}', html)
html = re.sub(r'\brow(\d)Open\b', r'(openRow === \1)', html)
step("accordion rows wired to state", before, len(re.findall(r'toggleRow\d|row\dOpen', html)))

# ── 11c. The deal-builder mockup's own controls. ──────────────────────────
# It ships a <textarea rows="1"> and chips wired to the export's fillFromChip
# handler. rows must be a number in JSX, and the handler does not exist here.
#
# The chips are stripped rather than rewired: this whole block is an
# illustration of the product, not the product. Left as buttons they would be
# focusable no-ops that a screen reader announces, so they are taken out of the
# tab order and hidden from it.
before = len(re.findall(r'rows="\d+"', html)) + html.count('fillFromChip')
html = re.sub(r'rows="(\d+)"', r'rows={\1}', html)
html = re.sub(r'onClick=\{fillFromChip\}\s*', 'tabIndex={-1} aria-hidden="true" ', html)
html = re.sub(r'\sdata-fill="[^"]*"', '', html)
step("mockup controls neutralised", before,
     len(re.findall(r'rows="\d+"', html)) + html.count('fillFromChip'))

# ── 12. Comments, void elements, CTAs. ─────────────────────────────────────
before = len(re.findall(r'<!--', html))
html = re.sub(r'<!--(.*?)-->', lambda m: '{/*' + m.group(1).replace('*/', '* /') + '*/}', html, flags=re.S)
step("comments converted", before, len(re.findall(r'<!--', html)))

for tag in ['img', 'br', 'hr', 'input', 'source', 'path', 'circle', 'rect', 'line',
            'polyline', 'ellipse', 'stop', 'use', 'polygon']:
    html = re.sub(rf'<{tag}\b([^>]*?)\s*/?>', lambda m: f'<{tag}{m.group(1).rstrip()} />', html)
html = re.sub(r'</(?:path|circle|rect|line|polyline|ellipse|stop|use|polygon)>', '', html)

before = html.count('.dc.html') + html.count('href="#')
html = html.replace('href="For Brands.dc.html"', 'href="/brands"')
html = html.replace('href="For Creators.dc.html"', 'href="/creators"')
html = html.replace('href="Creator Signup - Paged Flow.dc.html"', 'href="/signup/creator"')
html = html.replace('href="#login"', 'href="/login/creator"')
# "Browse creators" is dropped rather than pointed somewhere: /browse redirects
# anonymous visitors to /login/brand, so in public copy it is a login wall. The
# site footer omits it for the same reason.
html = re.sub(r'<a href="Creator Shopfront\.dc\.html"[^>]*>.*?</a>', '', html, flags=re.S)
step("CTAs pointed at real routes", before, html.count('.dc.html'))

# Below-the-fold images load lazily; intrinsic dimensions stop a lazy image with
# height:auto laying out at zero before it loads.
from PIL import Image as _PILImage
def _img(m):
    tag = m.group(0)
    src = re.search(r'src="(/brands-mobile/[^"]+)"', tag)
    extra = ' decoding="async" loading="lazy"'
    if src and 'width=' not in tag and 'aspectRatio' not in tag:
        path = os.path.join(os.path.dirname(__file__), '..', 'public', src.group(1).lstrip('/'))
        if os.path.exists(path):
            w, h = _PILImage.open(path).size
            extra = f' width={{{w}}} height={{{h}}}' + extra
    return tag[:-2].rstrip() + extra + ' />'
before = len(re.findall(r'<img\b', html))
html = re.sub(r'<img\b[^>]*/>', _img, html)
step("img hints + dimensions", before, len(re.findall(r'loading="lazy"', html)))

# ── 13. Heading hierarchy. ─────────────────────────────────────────────────
# This layout renders alongside the desktop one, and only one is displayed at a
# time — but both are in the DOM, so a second <h1> would give the page two.
# Every heading here stays at h2 or below; the desktop port owns the h1.
n_h1 = len(re.findall(r'<h1\b', html))
html = html.replace('<h1 ', '<h2 ').replace('</h1>', '</h2>')
step("h1 demoted (desktop owns the page h1)", n_h1, len(re.findall(r'<h1\b', html)))

out = f"{S}/brands-mobile-final.txt"
open(out, 'w').write(html)

print("  ── conversion ──")
for label, b, a in steps:
    print(f"    {label:<40} {b:>5} → {a}")
print(f"    written: {out}  ({len(html):,} chars)")
