import re, sys
S="/private/tmp/claude-501/-Users-palakjain/98efe6a8-2823-4c79-8309-ba18d97dc82d/scratchpad"
html=open(f"{S}/body-raw.html").read()

IMG={"e81e2a6c-5776-43d5-8770-0cba20cb6292":"/guapd-wordmark.svg",
     "70029eda-cccf-4b9d-b8f5-46b05cccbe15":"/brands/glass-panel.webp",
     "8ed9710e-c83e-4cde-ab5c-10a1425a4600":"/brands/showcase-a.webp",
     "9279e4cd-3585-4ec0-b6ef-0bf0ff52bb48":"/brands/showcase-b.webp",
     "97368813-21d5-4ef7-8f67-ea5dfcfe8514":"/brands/showcase-c.webp"}
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
# ── 6c2. Overlap the "operating system" headline with its image.
#
# The design coordinates THREE values with the same clamp:
#   container  padding-top : reserves the band, so the image starts at y = H
#   heading    height      : the band, text bottom-aligned inside it
#   fade       top         : white->transparent gradient placed exactly at the
#                            image's top edge, so the image dissolves into white
#
# To overlap the headline onto the image, the image must start ABOVE the band's
# bottom — so padding-top shrinks to X — and the fade has to follow it to X, or
# the gradient sits below the image's edge and a hard seam appears. The band's
# own height stays at H so the headline does not move.
#
# Changing padding-top alone (the first attempt) is exactly that seam.
BAND = 'clamp(320px,40vh,480px)'
IMG_TOP = 'clamp(210px,26vh,330px)'
html = html.replace(f'padding-top:{BAND}', f'padding-top:{IMG_TOP}')
html = html.replace(f'top:{BAND};left:0;right:0;height:20%', f'top:{IMG_TOP};left:0;right:0;height:20%')
# The band's own height is what holds the headline down the page (its content is
# bottom-aligned), so shrinking it lifts the whole block and closes the gap to
# the ticker above. Kept comfortably taller than IMG_TOP so the overlap remains.
html = html.replace(f'height:{BAND};display:flex', 'height:clamp(250px,31vh,390px);display:flex')

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
IMG_DIMS = {'glass-panel.webp':(2825,1806), 'showcase-a.webp':(1672,941),
            'showcase-b.webp':(1672,941),  'showcase-c.webp':(1536,1024)}
def _imgattrs(m):
    tag = m.group(0)
    for name,(w,h) in IMG_DIMS.items():
        if name in tag and 'width=' not in tag:
            lazy = '' if name == 'glass-panel.webp' else ' loading="lazy"'
            return tag[:-2].rstrip() + f' width={{{w}}} height={{{h}}}{lazy} decoding="async" />'
    return tag
html = re.sub(r'<img\b[^>]*?/?>', _imgattrs, html)

# ── 8. hide sections whose content is not real yet ──────────────────────────
# ── 8c. Sections removed outright, not flagged. "Creators on guapd / Find
# creators for every campaign" advertises a roster that does not exist yet;
# unlike the flagged sections it is not a matter of missing copy, so it is cut
# rather than hidden. Re-add from the export when there are creators to show.
REMOVE = ['CREATORS & BRANDS']
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

# ── 9. ghost text ───────────────────────────────────────────────────────────
html=re.sub(r'(<div id="dealGhost"[^>]*>)(</div>)',r'\1{ghost}\2',html)
open(f"{S}/body-final.txt","w").write(html)
print(f"  converted: {len(html):,} chars")
print(f"  bp-btn links : {html.count('className=\"bp-btn\"')}  (expect 1)")
print(f"  fgcard divs  : {html.count('fgcard')}  (expect 9)")
print(f"  x-import left: {html.count('<x-import')}   image-slot left: {html.count('<image-slot')}")
