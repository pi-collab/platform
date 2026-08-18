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
