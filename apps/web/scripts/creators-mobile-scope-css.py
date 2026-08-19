#!/usr/bin/env python3
"""
Scope the mobile For Creators export's stylesheet to .creators-mobile and write
app/creators-mobile.css.

Run from apps/web:  python3 scripts/creators-mobile-scope-css.py

Two things this has to undo, both artefacts of the export being a DEVICE PREVIEW
rather than a page:

  .mobile-frame  is a 390px phone-shaped card with a 36px radius and a drop
                 shadow, centred on a grey field. On a real phone the page has
                 to fill the viewport, so the frame is flattened rather than
                 removed — the markup nests inside it and unwrapping in CSS is
                 safer than restructuring the DOM.

  body/html      the export paints them #EDEDE8 and centres the frame with
                 flex. Scoped onto .creators-mobile that would tint our page
                 grey, so the page-level rules become rules on the scope and the
                 flex centring is dropped.

Same at-rule handling as the landing scoper: @keyframes and @font-face contain
no element selectors and are copied through verbatim; only @media/@supports are
descended into.
"""
import os
import re

SCOPE = '.creators-mobile'
S = "/private/tmp/claude-501/-Users-palakjain/98efe6a8-2823-4c79-8309-ba18d97dc82d/scratchpad"
OUT = os.path.join(os.path.dirname(__file__), '..', 'app', 'creators-mobile.css')

body = open(f"{S}/creators-mobile-body.html").read()
css = "\n".join(re.findall(r'<style[^>]*>(.*?)</style>', body, re.S))
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)

IMPORT_RE = r'''@import\s+(?:url\([^)]*\)|'[^']*'|"[^"]*")[^;]*;'''
n_imports = len(re.findall(IMPORT_RE, css))
css = re.sub(IMPORT_RE, '', css)

# @font-face blocks go entirely. The export ships 66 of them, each pointing at a
# bundle UUID that does not exist as a file — webpack tries to resolve every one
# and the build fails on the first. Schibsted Grotesk and Instrument Serif are
# already self-hosted through next/font, and the token binding at the foot of
# this file points the design's families at them.
n_faces = len(re.findall(r'@font-face', css))
def _strip_faces(src):
    out, i = [], 0
    while True:
        at = src.find('@font-face', i)
        if at == -1:
            out.append(src[i:]); break
        j = src.index('{', at)
        depth, k = 0, j
        while k < len(src):
            if src[k] == '{': depth += 1
            elif src[k] == '}':
                depth -= 1
                if depth == 0: break
            k += 1
        out.append(src[i:at])
        i = k + 1
    return ''.join(out)
css = _strip_faces(css)

# Any remaining url() pointing at a bundle UUID is an asset we did not extract
# (a background image on a decorative rule). Webpack cannot resolve it, so the
# declaration goes rather than the build failing on it.
n_urls = len(re.findall(r'url\(["\']?[0-9a-f-]{36}["\']?\)', css))
css = re.sub(r'[^;{}]*url\(["\']?[0-9a-f-]{36}["\']?\)[^;}]*;?', '', css)

# 800 renders as 700 in the design — same as the landing page, and for the same
# reason: the export's font is loaded without an 800 face.
n_800 = len(re.findall(r'font-weight:\s*800', css))
css = re.sub(r'font-weight:\s*800', 'font-weight:700', css)


def scope_selector(sel):
    out = []
    for part in sel.split(','):
        p = part.strip()
        if not p:
            continue
        if p in ('html', 'body'):
            out.append(SCOPE)
        elif p == '*':
            out.append(f'{SCOPE} *')
        elif p.startswith(':root'):
            out.append(SCOPE + p[len(':root'):])
        else:
            out.append(f'{SCOPE} {p}')
    return ', '.join(out)


def matching_brace(src, open_at):
    depth = 0
    for k in range(open_at, len(src)):
        if src[k] == '{':
            depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0:
                return k
    return len(src) - 1


dropped_orphans = []


def scope_block(src):
    out, i = [], 0
    while i < len(src):
        at = src.find('@', i)
        brace = src.find('{', i)
        if brace == -1:
            out.append(src[i:])
            break
        if at != -1 and at < brace:
            j = src.index('{', at)
            k = matching_brace(src, j)
            name = src[at:j]
            if re.match(r'@(media|supports|container)\b', name.strip()):
                out.append(src[i:at])
                out.append(name + '{')
                out.append(scope_block(src[j + 1:k]))
                out.append('}')
            else:
                out.append(src[i:k + 1])
            i = k + 1
            continue
        sel = src[i:brace]
        if not sel.strip():
            k = matching_brace(src, brace)
            dropped_orphans.append(src[brace:k + 1][:40])
            out.append(sel)
            i = k + 1
            continue
        end = src.index('}', brace)
        out.append(sel.replace(sel.strip(), scope_selector(sel.strip())))
        out.append(src[brace:end + 1])
        i = end + 1
    return ''.join(out)


scoped = scope_block(css).strip()

HEADER = """/* ── For Creators (mobile), ported from the design export ───────────────────
 *
 * GENERATED by scripts/creators-mobile-scope-css.py — edit the script, not this
 * file.
 *
 * Shown below 820px; the desktop port in creators-page.css takes over above it.
 * Every selector is scoped to .creators-mobile so the two layouts cannot reach
 * into each other, and so neither can restyle the app behind them.
 *
 * Fonts are bound to next/font at the foot of this file. Declaring the family
 * by literal name resolves to nothing, because next/font self-hosts under an
 * obfuscated name — that is how the brands page silently rendered in system-ui.
 */

"""

FOOTER = """

/* ── The export is a device preview, not a page ────────────────────────────
   .mobile-frame is a 390px phone-shaped card with a radius, a shadow and a grey
   field around it. On a real phone the page fills the viewport, so the frame is
   flattened here rather than unwrapped in the markup: the content nests inside
   it, and changing CSS is safer than restructuring the DOM. */
.creators-mobile .mobile-frame {
  width: 100%;
  max-width: none;
  border-radius: 0;
  box-shadow: none;
  overflow: visible;
}

/* The export's body rule centred the frame with flex and painted the page grey.
   Scoped onto .creators-mobile that tints our page; the layout belongs to the
   page, not to the preview. */
.creators-mobile {
  display: block;
  padding: 0;
  background: #FFFFFF;
}

/* ── Bind the design tokens to the real webfonts ─────────────────────────── */
.creators-mobile {
  --font-display: var(--font-schibsted), system-ui, sans-serif;
  --font-ui: var(--font-schibsted), system-ui, sans-serif;
  --font-body: var(--font-schibsted), system-ui, sans-serif;
  --font-serif: var(--font-instrument-serif), Georgia, serif;
  font-family: var(--font-ui);
}

/* Never scrolls sideways. `clip` rather than `hidden`, which would create a
   scroll container and break any sticky inside it. */
.creators-mobile { overflow-x: clip; }

/* ── Which layout is shown ─────────────────────────────────────────────────
   One breakpoint, declared once, so the two ports cannot both appear or both
   vanish. 820px matches the footer's own breakpoint. */
.creators-mobile { display: none; }
@media (max-width: 820px) {
  .creators-mobile { display: block; }
  .creators-page { display: none; }
}
"""

open(OUT, 'w').write(HEADER + scoped + FOOTER)

leaked = [s.strip() for s in re.findall(r'(?m)^\s*([^@{}\n][^{}\n]*)\{', scoped)
          if SCOPE not in s and not re.match(r'^\s*(\d+%|from|to)', s.strip())]
print(f"    @font-face blocks dropped: {n_faces}   unresolvable url() dropped: {n_urls}")
print(f"    @import dropped: {n_imports}   font-weight 800 → 700: {n_800}")
print(f"    scoped selectors: {scoped.count(SCOPE)}")
print(f"    orphan blocks dropped: {len(dropped_orphans)}")
print(f"    @keyframes left intact: {len(re.findall(r'@keyframes', scoped))}")
print(f"    unscoped selectors remaining: {len(leaked)}")
for l in leaked[:6]:
    print("      ", l[:70])
print(f"    written: app/creators-mobile.css ({os.path.getsize(OUT):,}b)")
