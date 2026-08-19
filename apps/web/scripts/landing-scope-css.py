#!/usr/bin/env python3
"""
Scope the landing export's stylesheet to .landing-page and write
app/landing-page.css.

Run from apps/web:  python3 scripts/landing-scope-css.py

The export ships a page-level stylesheet — it styles html, body and * — which
would restyle the whole app if it were dropped in as-is. Every selector is
rewritten to sit under .landing-page, the page-level ones becoming rules on that
element instead.

Two things must NOT be scoped, and both were bugs first:
  - @keyframes bodies. Their `0%,100%` and `from`/`to` are keyframe selectors,
    not element selectors. Scoping them produced `@keyframes floatY{0%,100%{…}
    .landing-page 50%{…}` — which is not parseable, and the build failed on it.
  - @font-face blocks, for the same reason: no selectors inside at all.
So at-rules that contain no element selectors are copied through verbatim, and
only @media/@supports are descended into.
"""
import os
import re

SCOPE = '.landing-page'
S = "/private/tmp/claude-501/-Users-palakjain/98efe6a8-2823-4c79-8309-ba18d97dc82d/scratchpad"
OUT = os.path.join(os.path.dirname(__file__), '..', 'app', 'landing-page.css')

# guapd-skin.css is the export's canonical token file — every --ink, --card,
# --hairline and --font-* the page uses is defined there, and its @import is the
# first line of the page's own stylesheet. It is folded in ahead of the page CSS
# rather than left as an import: an unresolvable @import fails the build, and
# resolving it would put an unscoped :root block of design tokens into the app.
SKIN = "/Users/palakjain/Downloads/GUAPD main (1)/guapd-skin.css"
css = open(SKIN).read() + "\n" + open(f"{S}/landing-css.css").read()

# Comments go first, so the scoper cannot rewrite a selector quoted inside one.
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)

# @import has to go. The skin is already inlined above, and the Google Fonts
# import would load Schibsted Grotesk and Instrument Serif a second time — over
# the network, in the render path — when next/font already self-hosts both.
# The URL itself contains semicolons — a Google Fonts request spells weights as
# `wght@400;500;600;700` — so a lazy [^;]* stops inside the quotes and leaves the
# rest of the URL behind as stray text, which then reads as a selector.
IMPORT_RE = r'''@import\s+(?:url\([^)]*\)|'[^']*'|"[^"]*")[^;]*;'''
n_imports = len(re.findall(IMPORT_RE, css))
css = re.sub(IMPORT_RE, '', css)


def scope_selector(sel):
    out = []
    for part in sel.split(','):
        p = part.strip()
        if not p:
            continue
        if p in ('html', 'body'):
            # The export's page-level rules become rules on the scope itself.
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
                out.append(scope_block(src[j + 1:k]))   # these DO contain selectors
                out.append('}')
            else:
                # @keyframes, @font-face, @page … no element selectors inside.
                out.append(src[i:k + 1])
            i = k + 1
            continue
        sel = src[i:brace]
        if not sel.strip():
            # An orphan block: a `{…}` with no selector in front of it. The
            # export has several, left behind where a selector was deleted but
            # its body was not — e.g. a duplicate @keyframes floatY body. There
            # is nothing to scope and nothing it can apply to, so it is dropped;
            # emitting it produced `.landing-page 50%{…}` inside a keyframes
            # block and the build failed to parse the file.
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


# font-weight:800 renders as 700 in the design — the export's Google Fonts
# import is wght@400;500;600;700, with no 800 face in it. next/font does ship
# 800, so declaring it here would render heavier than the page was signed off
# at. Measured at 56px: the export's "800" and our 700 are both 591.7px wide;
# our real 800 is 604.2px.
n_800 = len(re.findall(r'font-weight:\s*800', css))
css = re.sub(r'font-weight:\s*800', 'font-weight:700', css)

scoped = scope_block(css).strip()

HEADER = """/* ── Landing page, ported from the "Landing - desktop" design export ─────────
 *
 * GENERATED by scripts/landing-scope-css.py — edit the script, not this file.
 *
 * Every selector is scoped to .landing-page. The export's own page-level resets
 * (html, body, *) become rules on that scope instead, so a homepage stylesheet
 * cannot restyle the app behind it — the same containment the brands and
 * creators pages use.
 *
 * Webfonts are omitted: Schibsted Grotesk and Instrument Serif are already
 * loaded via next/font, and the token binding at the foot of this file points
 * the design's font variables at those families. Declaring them by literal name
 * resolves to nothing, because next/font self-hosts under an obfuscated family
 * — that is how the brands page silently rendered in system-ui.
 */

"""

FOOTER = """

/* ── Bind the design tokens to the real webfonts ───────────────────────────
   Declared last so these win over every token block ported above. See the note
   at the top of this file. */
.landing-page {
  --font-display: var(--font-schibsted), system-ui, sans-serif;
  --font-ui: var(--font-schibsted), system-ui, sans-serif;
  --font-body: var(--font-schibsted), system-ui, sans-serif;
  --font-serif: var(--font-instrument-serif), Georgia, serif;

  /* The export leaned on its own body rule for this and the scoper turned that
     into a .landing-page rule with no family in it, so anything that did not
     set a family explicitly rendered in system-ui. Measured: the page root came
     out at 538.6px for a string the real face sets at 591.3px. */
  font-family: var(--font-ui);
}

/* The page must never scroll sideways. `clip` rather than `hidden`: hidden
   creates a scroll container, and the pinned sections measure against the
   window. */
.landing-page { overflow-x: clip; }

/* The header floats OVER the hero artwork, which is what the export draws — its
   nav sits inside the page with the showcase running up behind it.
   <MarketingNav> is sticky, so it keeps its full height in flow and the page
   began 86px down: a white band above the capsule and another below it, with
   the artwork starting only after. Pulling the page up by exactly that height
   puts the artwork back under the header.

   The offset is the nav wrapper's 26px of top padding, NOT its full 86px
   height. Pulling by the full height over-corrected by exactly 60px — measured
   against the export at 1440, the heading sat 20px below the capsule instead of
   80, and the hero artwork started at -215 instead of -155. The capsule itself
   should still occupy its own 60px; only the padding above it is reclaimed, and
   the artwork runs up behind both. */
.landing-page { margin-top: -26px; }

/* The "How it works" heading sits at the top of a pinned section, where the
   sticky header passes over it. The export puts it at clamp(30px,6vh,60px) from
   the top of the pin, which on our page lands it under the capsule. Pushed down
   so it clears the header with room to breathe. */
.landing-page .hw-topbar { top: clamp(90px, 6vh + 60px, 120px); }

/* "Everything, in one place": the heading holds at the top while the cards pile
   up beneath it. It used to scroll away before the stacking even began, so the
   section's own title was gone by the time the thing it titles happened.

   The cards pin below it rather than behind it — 96px (the export's own offset)
   plus the heading's height and the gap under it. The heading carries the page
   background so anything travelling up to the stack disappears cleanly behind
   it rather than showing through. */
.landing-page .stack-head {
  position: sticky;
  top: 96px;
  z-index: 30;
  /* Opaque and full-width: cards travel up behind this, and they have to
     disappear cleanly rather than show through or peek out at the sides. The
     extra width either side covers the cards' own shadows. */
  background: var(--card);
  padding: 20px clamp(24px, 4vw, 64px) 22px;
  margin-left: calc(clamp(24px, 4vw, 64px) * -1);
  margin-right: calc(clamp(24px, 4vw, 64px) * -1);
}
/* Its own children keep the measure the design gave them. */
.landing-page .stack-head > * { max-width: 560px; margin-left: auto; margin-right: auto; }

/* The header steps aside while a pinned section owns the viewport.
   Deliberately NOT scoped to .landing-page: the header sits outside it. The
   attribute is set only by that page's own effect and removed on unmount, so
   this cannot fire anywhere else. */
/* Menu rows light up on hover AND on focus, so the keyboard path is not a
   second-class one. Unscoped for the same reason as .mnav-wrap: the header
   sits outside .landing-page. */
.mnav-item { transition: background .14s ease; }
.mnav-item:hover, .mnav-item:focus-visible { background: #F5F7FA; }

.mnav-wrap { transition: opacity .28s ease, transform .28s ease; }
html[data-lp-pinned] .mnav-wrap {
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .mnav-wrap { transition: none; }
}

/* The design system's primary button. The export renders these through an
   <x-import> that resolves to its Button component; the conversion turns them
   into links, which arrived unstyled — 20px of bare text where a 52px pill
   belongs. Neon, as the same component renders in the nav. */
.landing-page .lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 52px;
  padding: 0 26px;
  border: none;
  border-radius: 999px;
  background: var(--neon);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: transform .16s ease, box-shadow .16s ease;
}
.landing-page .lp-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 24px -12px rgba(40,45,25,.5); }

/* The converge section's CTA is a <button> wrapping the export's own pill, so
   the button itself must contribute nothing — otherwise the browser draws its
   default grey box around the pill. */
.landing-page .faqitem p a {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}
.landing-page .faqitem p a:hover { text-decoration-thickness: 2px; }

.landing-page .cv-cta {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .landing-page .lp-btn { transition: none; }
  .landing-page .lp-btn:hover { transform: none; }
}
"""

open(OUT, 'w').write(HEADER + scoped + FOOTER)

leaked = [s.strip() for s in re.findall(r'(?m)^\s*([^@{}\n][^{}\n]*)\{', scoped)
          if SCOPE not in s and not re.match(r'^\s*(\d+%|from|to)', s.strip())]
print(f"    skin tokens folded in, @import rules dropped: {n_imports}")
print(f"    font-weight 800 → 700: {n_800}")
print(f"    scoped selectors: {scoped.count(SCOPE)}")
print(f"    orphan blocks dropped: {len(dropped_orphans)}")
print(f"    @keyframes left intact: {len(re.findall(r'@keyframes', scoped))}")
print(f"    unscoped selectors remaining: {len(leaked)}")
for l in leaked[:8]:
    print("      ", l[:70])
print(f"    written: app/landing-page.css ({os.path.getsize(OUT):,}b)")
