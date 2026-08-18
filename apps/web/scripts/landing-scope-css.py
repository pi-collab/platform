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
"""

open(OUT, 'w').write(HEADER + scoped + FOOTER)

leaked = [s.strip() for s in re.findall(r'(?m)^\s*([^@{}\n][^{}\n]*)\{', scoped)
          if SCOPE not in s and not re.match(r'^\s*(\d+%|from|to)', s.strip())]
print(f"    skin tokens folded in, @import rules dropped: {n_imports}")
print(f"    scoped selectors: {scoped.count(SCOPE)}")
print(f"    orphan blocks dropped: {len(dropped_orphans)}")
print(f"    @keyframes left intact: {len(re.findall(r'@keyframes', scoped))}")
print(f"    unscoped selectors remaining: {len(leaked)}")
for l in leaked[:8]:
    print("      ", l[:70])
print(f"    written: app/landing-page.css ({os.path.getsize(OUT):,}b)")
