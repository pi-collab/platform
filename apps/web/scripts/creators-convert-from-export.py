import re, sys
S="/private/tmp/claude-501/-Users-palakjain/98efe6a8-2823-4c79-8309-ba18d97dc82d/scratchpad"
html=open(f"{S}/creators-body.html").read()

IMG={"2c329c59-320d-4a60-a93a-55c687b58442":"/guapd-wordmark.svg",
     "e8cbf72d-501b-4f37-8f79-16633933a63a":"/creators/hero.webp",
     "bcac9d1e-221a-40d5-baa9-6692f230a6ad":"/creators/mobile-app.webp",
     "14b030d6-8d3a-46da-9c18-8a07f6dda86e":"/creators/features.webp",
     "fa096e57-5e0b-4c1d-9bc2-f6442ead7b63":"/creators/grid-1.webp",
     "a6b21663-efa0-40f1-8cdb-7432b4081751":"/creators/grid-2.webp",
     "0d931cdd-8376-4687-840c-7b13048f43a6":"/creators/grid-3.webp",
     "32b41d45-6cf2-4d43-8baf-6e71b1cc0e00":"/creators/grid-4.webp",
     "c67ae34c-9008-4b90-81d5-d2f79987d984":"/creators/trust.webp",
     "87c2d2da-c78c-4082-bcbc-172635dd48fb":"/creators/testimonials.webp"}
for k,v in IMG.items(): html=html.replace(k,v)

# ── 1. x-import → real elements, matching close tags by scanning ────────────
def replace_ximports(s):
    out=''; i=0
    while True:
        m=re.search(r'<x-import\b([^>]*)>', s[i:])
        if not m: out += s[i:]; break
        start=i+m.start(); attrs=m.group(1)
        out += s[i:start]
        # find matching </x-import>
        depth=1; j=i+m.end()
        while depth:
            nxt=re.search(r'<x-import\b|</x-import>', s[j:])
            if not nxt: break
            if nxt.group(0)=='</x-import>': depth-=1
            else: depth+=1
            j += nxt.end()
        inner=s[i+m.end(): j-len('</x-import>')]
        comp=re.search(r'\.([A-Za-z]+)"', attrs)
        comp=comp.group(1) if comp else '?'
        cls=re.search(r'class="([^"]*)"', attrs)
        cls=cls.group(1) if cls else ''
        sty=re.search(r'style="([^"]*)"', attrs)
        sty=f' style="{sty.group(1)}"' if sty else ''
        if comp=='Button':
            out += f'<a href="/signup/brand" className="bp-btn"{sty}>{replace_ximports(inner)}</a>'
        else:  # GlassCard and anything else: a container, never a link
            klass=" ".join(dict.fromkeys(("fgcard "+cls).split()))
            out += f'<div className="{klass}"{sty}>{replace_ximports(inner)}</div>'
        i=j
    return out
html=replace_ximports(html)

# ── 2. inline <style> blocks (already in brands-page.css) ───────────────────
html=re.sub(r'<style>.*?</style>','',html,flags=re.S)
# ── 3. the export's malformed duplicate style attribute on the hero h1 ──────
# The export emitted a broken attribute on the hero h1: a stray `style=` INSIDE
# the style value, leaving `;style=" --sr-delay:0s;"=""`. Fold the custom
# property back into the same declaration list, which is the evident intent.
html=html.replace(';style=" --sr-delay:0s;"=""', ';--sr-delay:0s;"')
# NOTE: the earlier overlap tweak (moving the image top and fade up, shrinking
# the band) is deliberately gone. The new export addresses the same feedback in
# the design itself — a taller, softer fade (20% -> 34% with an extra stop) —
# so the page should follow the export rather than carry a local override.

# ── 6g. Value ticker: eyebrow type, and a track wide enough to actually loop.
#
# The chips were sentence-case 12px body text; PJ wants them set as eyebrow
# labels — uppercase, small, letter-spaced — matching .t-meta in the design
# system. Rewritten in the inline style so no !important is needed.
html = html.replace(
    'font-family:var(--font-ui);font-size:12px;color:var(--ink-soft);background:var(--card);'
    'border:1.2px solid var(--hairline);border-radius:var(--radius-pill);padding:9px 16px;',
    'font-family:var(--font-ui);font-size:9.5px;font-weight:500;letter-spacing:.14em;'
    'text-transform:uppercase;color:var(--ink-soft);background:var(--card);'
    'border:1.2px solid var(--hairline);border-radius:var(--radius-pill);padding:10px 16px;')

# The marquee animates translateX(0 -> -50%), which is seamless ONLY if half the
# track is at least as wide as the viewport. The export ships two copies of five
# chips: 1298px total, so half is 649px against a 1440px viewport — the chips run
# out and a blank stretch scrolls past before the cycle repeats. Repeating the
# whole track content four times keeps the two-copy symmetry the -50% relies on
# while making each half ~2600px, enough for any realistic desktop.
_open = '<div style="display:flex;width:max-content;gap:0;animation:mqMove 32s linear infinite;">'
_i = html.find(_open)
if _i != -1:
    _start = _i + len(_open)
    _depth, _j = 1, _start
    while _depth:
        _nd = html.find('<div', _j); _cd = html.find('</div>', _j)
        if _cd == -1: break
        if _nd != -1 and _nd < _cd: _depth += 1; _j = _nd + 4
        else:
            _depth -= 1; _j = _cd + 6
    _inner = html[_start:_j - 6]
    html = html[:_start] + (_inner * 4) + html[_j - 6:]

# -- 6h. Reveal the elements the export's own script animated in.
#
# Six elements (pvEyebrow / pvHead / pvBody and three pv-rows) carry an inline
# opacity:0 with a transition, and were faded in by the export's runtime, which
# is not ported. They are not .sr elements, so the observer never touched them
# and the whole "As private as your spreadsheet" section rendered blank.
#
# Inline opacity beats any class, so the declaration has to come OUT of the
# style attribute; the motion is reinstated via .pv-reveal, which the observer
# handles alongside .sr.
def _reveal(m):
    tag, style = m.group(0), m.group(1)
    new = re.sub(r'opacity:0;?', '', style)
    new = re.sub(r'transform:translateY\([^)]*\);?', '', new)
    tag = tag.replace(style, new)
    if 'class="' in tag:
        return re.sub(r'class="([^"]*)"', lambda c: 'class="%s pv-reveal"' % c.group(1), tag, count=1)
    return re.sub(r'^<(\w+)', lambda t: '<%s class="pv-reveal"' % t.group(1), tag)

html = re.sub(r'<(?:div|h2|p)\b[^>]*style="([^"]*opacity:0;[^"]*transition:opacity[^"]*)"[^>]*>',
              _reveal, html)

# -- 6i. "See what's working, at a glance" wrapped onto two lines in its column.
# Shortened, keeping the serif accent the design puts on the second half.
html = html.replace(
    '>See what\'s working, <span class="t-accent">at a glance</span>',
    '>See what\'s <span class="t-accent">working</span>')

# The privacy block's copy was capped at 460px, which set it in a narrow column
# against a full-width card. Widened so the heading and the sentence below it
# use the space they are sitting in.
html = html.replace('text-align:left;max-width:460px;', 'text-align:left;max-width:760px;')

# The testimonials copy sat at 17% from the top, which was right when three
# review cards filled the space beneath it. With the cards gone it reads as
# stranded, so it is centred in the frame instead.
html = html.replace(
    'position:absolute;left:0;right:0;top:17%;text-align:center;padding:0 20px;',
    'position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;padding:0 20px;')

# -- 6k. Match the export's actual rendered weight.
#
# The markup asks for font-weight:800 in twenty places, but the export only
# EMBEDS Schibsted Grotesk at 400/500/600/700 — so every one of those renders as
# 700 in the design. next/font loads a genuine 800, so the same markup came out
# noticeably bolder here than in the file it was ported from.
#
# Measured on "Everything your team needs," at 46.08px: the export renders 606.3px
# at both 700 and 800 (no 800 face to switch to), while this page rendered 620.2px
# at 800. The heading was 10px wider and visibly heavier.
#
# Mapped to 700 so the page matches the design. If the intent was genuinely 800,
# the fix belongs in the export's embedded weights, not here.
html = html.replace('font-weight:800', 'font-weight:700')

# The export is a mockup: "Create deal" and both "Book demo" buttons do nothing.
# "Create deal" now sends people to brand signup, which is what the deal builder
# is a preview of; "Book demo" opens the request form.
html = html.replace('>Create deal</button>', ' onClick={goToSignup}>Create deal</button>')
html = html.replace('>Book demo</button>', ' onClick={openDemo}>Book demo</button>')
html = html.replace('>Book a demo</button>', ' onClick={openDemo}>Book a demo</button>')

# ── 4. style="..." → JSX object ─────────────────────────────────────────────
def camel(p):
    p=p.strip()
    return f"'{p}'" if p.startswith('--') else re.sub(r'-([a-z])',lambda m:m.group(1).upper(),p)
def style_to_jsx(s):
    out=[]
    for d in s.split(';'):
        if ':' not in d: continue
        k,v=d.split(':',1)
        if not k.strip(): continue
        out.append(f"{camel(k)}: '{v.strip()}'".replace("\\","\\\\"))
    return "{{"+", ".join(out)+"}}"
html=re.sub(r'style="([^"]*)"',lambda m:'style='+style_to_jsx(m.group(1)),html)
# ── 5. remaining attrs ──────────────────────────────────────────────────────
html=re.sub(r'\bclass="','className="',html)
html=re.sub(r'<!--(.*?)-->',lambda m:'{/*'+m.group(1).replace('*/','* /')+'*/}',html,flags=re.S)
html=re.sub(r'sc-camel-on-click="\{\{ fillFromChip \}\}"\s*data-fill="([^"]*)"',
            lambda m:f'onClick={{() => fillFromChip("{m.group(1)}")}}',html)
html=re.sub(r'rows="(\d+)"',lambda m:'rows={'+m.group(1)+'}',html)
html=html.replace('<textarea id="dealInput" rows={1}','<textarea id="dealInput" rows={1} ref={inputRef} onChange={onType}')
# ── 6. image-slot → img (has src) or empty sized box (no asset yet) ─────────
def slot(m):
    t=m.group(0)
    src=re.search(r'src="([^"]+)"',t); sty=re.search(r'style=(\{\{.*?\}\})',t,re.S)
    ph=re.search(r'placeholder="([^"]*)"',t); idm=re.search(r'id="([^"]*)"',t)
    st=sty.group(1) if sty else "{{width: '100%', height: '100%'}}"
    if src:
        return f'<img src="{src.group(1)}" alt="{ph.group(1) if ph else ""}" style={{{{...{st[1:-1]}, objectFit: \'cover\'}}}} />'
    return f'<div id="{idm.group(1) if idm else ""}" aria-hidden="true" data-placeholder="{ph.group(1) if ph else ""}" style={st} />'
html=re.sub(r'<image-slot\b[^>]*?/?>',slot,html); html=html.replace('</image-slot>','')
# ── 6b. SVG attributes must be camelCase in JSX. React silently DROPS
# hyphenated ones, so stroke-width etc. would be lost and every icon would
# render with default strokes.
SVG_ATTRS = ['stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray',
             'stroke-dashoffset','stroke-opacity','stroke-miterlimit','fill-rule',
             'clip-rule','fill-opacity','stop-color','stop-opacity','text-anchor',
             'clip-path','vector-effect','paint-order','dominant-baseline']
for a in SVG_ATTRS:
    camel_a = re.sub(r'-([a-z])', lambda m: m.group(1).upper(), a)
    html = html.replace(f'{a}="', f'{camel_a}="')

# ── 6c. Design-tool attribute prefixes. sc-camel-view-box is really viewBox —
# React drops the unknown attribute, and an SVG without a viewBox does not
# scale. The sc-camel-on-mouse-* handlers call tool-internal logic that does
# not exist here, so they are removed rather than rewired.
html = re.sub(r'sc-camel-on-[a-z-]+="\{\{[^}]*\}\}"\s*', '', html)
html = re.sub(r'sc-camel-([a-z-]+)=',
              lambda m: re.sub(r'-([a-z])', lambda g: g.group(1).upper(), m.group(1)) + '=',
              html)

# ── 6d. Inline DOM event handlers. The export wrote hover/press effects as
# on*="this.style.transform=..." strings, which React cannot accept (they are
# handler props, not attributes). They are replaced with a data-lift hook and
# reproduced in CSS, which is where a hover effect belongs anyway — it also
# keeps working for keyboard focus, which the inline version never did.
had_lift = 'onMouseOver="this.style.transform' in html
html = re.sub(r'\s*on(?:MouseOver|MouseOut|MouseDown|MouseUp)="this\.style\.transform=[^"]*"', '', html)
if had_lift:
    html = html.replace('<button ', '<button data-lift ', 0) if False else html

# ── 6e. Heading hierarchy for SEO/a11y. The export uses <h1> for several
# section headings, which gives the page three H1s and starts the outline at
# H2. Demote every export H1 to H2, then promote the opening headline — the
# page's actual subject — to the single H1.
html = html.replace('<h1 ', '<h2 ').replace('</h1>', '</h2>')
_first = html.find('<h2 ')
if _first != -1:
    html = html[:_first] + '<h1 ' + html[_first+4:]
    _close = html.find('</h2>', _first)
    html = html[:_close] + '</h1>' + html[_close+5:]

# ── 7. void elements ────────────────────────────────────────────────────────
for tag in ['img','br','hr','input','source']:
    html=re.sub(rf'<{tag}\b([^>]*?)\s*/?>',lambda m:f'<{tag}{m.group(1).rstrip()} />',html)
# ── 6f. Image attributes. Intrinsic width/height let the browser reserve space
# (no layout shift), and everything below the fold can load lazily.
IMG_DIMS = {'hero.webp':(1672,941), 'mobile-app.webp':(1672,941),
            'features.webp':(1254,1254), 'grid-1.webp':(1024,1536), 'grid-2.webp':(1024,1536),
            'grid-3.webp':(1024,1536), 'grid-4.webp':(1024,1536), 'trust.webp':(2139,1204),
            'testimonials.webp':(1536,1024)}
def _imgattrs(m):
    tag = m.group(0)
    for name,(w,h) in IMG_DIMS.items():
        if name not in tag or 'width=' in tag:
            continue
        lazy = '' if name == 'hero.webp' else ' loading="lazy"'
        # Only add intrinsic width/height where the style does NOT already
        # declare aspect-ratio or an explicit height. The HTML attributes map to
        # a presentational `height`, which OVERRIDES CSS aspect-ratio — adding
        # them to a slot styled `width:100%; aspect-ratio:1672/941` rendered the
        # image at its full 941px instead of the 675px the ratio implies, and
        # stretched that section by 265px. Where aspect-ratio is present it
        # already prevents layout shift, so the attributes add nothing.
        has_ratio = 'aspectRatio' in tag or 'aspect-ratio' in tag
        dims = '' if has_ratio else f' width={{{w}}} height={{{h}}}'
        return tag[:-2].rstrip() + f'{dims}{lazy} decoding="async" />'
    return tag
html = re.sub(r'<img\b[^>]*?/?>', _imgattrs, html)

# ── 8. hide sections whose content is not real yet ──────────────────────────
# ── 8c. Sections removed outright, not flagged. "Creators on guapd / Find
# creators for every campaign" advertises a roster that does not exist yet;
# unlike the flagged sections it is not a matter of missing copy, so it is cut
# rather than hidden. Re-add from the export when there are creators to show.
REMOVE = []
marks=[(m.start(),m.group(1).strip()) for m in re.finditer(r'\{/\* =+ ([^=]+?) =+ \*/\}',html)]
bounds=[(marks[i][0], marks[i+1][0] if i+1<len(marks) else len(html), marks[i][1]) for i in range(len(marks))]
for a,b,name in reversed(bounds):
    if any(name.startswith(k) for k in REMOVE):
        html = html[:a] + html[b:]

HIDE={'BRANDS WE WORK WITH':'SHOW_BRAND_LOGOS','TESTIMONIALS':'SHOW_TESTIMONIALS'}
# Splice by index, back to front. Doing this with str.replace() put the second
# wrapper INSIDE the first section, because positions shift after each edit and
# replace() hits the first match rather than the intended one.
marks=[(m.start(),m.group(1).strip()) for m in re.finditer(r'\{/\* =+ ([^=]+?) =+ \*/\}',html)]
bounds=[(marks[i][0], marks[i+1][0] if i+1<len(marks) else len(html), marks[i][1]) for i in range(len(marks))]
for a,b,name in reversed(bounds):
    for k,flag in HIDE.items():
        if name.startswith(k):
            html = html[:a] + f"{{{flag} && (<>\n" + html[a:b] + f"\n</>)}}\n" + html[b:]

# ── 8b. Drop the export's own nav. PJ wants the site-wide <Nav> here so the
# header stays consistent with the rest of staging; rendering both would stack
# two headers. Removed from the comment banner up to the next section.
nav_start = html.index('{/* ============ NAV')
nav_end = html.index('{/*', nav_start + 10)
html = html[:nav_start] + html[nav_end:]

# ("Run deals directly. Stay calm.") on the page, but the three quotes are not
# real yet. Each card is the div wrapping a five-star run, removed by scanning
# for its matching close rather than by regex, since the cards nest.
while chr(9733)*5 in html:
    i = html.index(chr(9733)*5)
    start = html.rfind('<div', 0, i)
    depth, j = 1, html.index('>', start) + 1
    while depth:
        nd, cd = html.find('<div', j), html.find('</div>', j)
        if cd == -1: break
        if nd != -1 and nd < cd: depth += 1; j = nd + 4
        else: depth -= 1; j = cd + 6
    html = html[:start] + html[j:]

# ── 9. ghost text ───────────────────────────────────────────────────────────
html=re.sub(r'(<div id="dealGhost"[^>]*>)(</div>)',r'\1{ghost}\2',html)
open(f"{S}/creators-final.txt","w").write(html)
print(f"  converted: {len(html):,} chars")
print(f"  bp-btn links : {html.count('className=\"bp-btn\"')}  (expect 1)")
print(f"  fgcard divs  : {html.count('fgcard')}  (expect 9)")
print(f"  x-import left: {html.count('<x-import')}   image-slot left: {html.count('<image-slot')}")
