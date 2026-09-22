#!/usr/bin/env bash
#
# Weekly creator-economy research brief.
#
# Runs Claude in print mode against a fixed research prompt and writes a dated
# markdown brief into docs/content/. Copy and research only — no designed
# slides, by design: the brief is the input to design, not a substitute for it.
#
#   ./scripts/weekly-brief.sh              # this week's brief
#   ./scripts/weekly-brief.sh 2026-09-15   # backfill a specific date
#
# Scheduled weekly by com.guapd.weekly-brief (launchd). See scripts/README-weekly-brief.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/docs/content"
DATE="${1:-$(date +%F)}"
OUT_FILE="$OUT_DIR/weekly-brief-$DATE.md"
LOG_FILE="$OUT_DIR/.weekly-brief.log"

mkdir -p "$OUT_DIR"

# Refuse rather than overwrite. A brief is a week's research and a rerun that
# silently replaced one would destroy work with no way to notice.
if [[ -e "$OUT_FILE" ]]; then
  echo "A brief for $DATE already exists: $OUT_FILE" >&2
  echo "Delete it first, or pass a different date." >&2
  exit 1
fi

command -v claude >/dev/null 2>&1 || { echo "claude CLI not found on PATH" >&2; exit 127; }

read -r -d '' PROMPT <<'PROMPT_END' || true
Research this week's creator economy news and produce a content brief for Guapd.

CONTEXT — who this is for:
Guapd is an India-based platform for brand–creator deals. Its positioning is
verified creator data (audience figures read from Instagram rather than typed
by the creator), a structured deal workflow from offer to delivery to payment,
and creator storefronts brands browse and send offers from. The audience for
the carousels is brands and creators on LinkedIn and Instagram.

WHAT TO RESEARCH (use web search; prefer the last 7-14 days):
1. Creator economy news and statistics, India-specific AND global.
2. Competitor and adjacent-platform moves: Passionfroot, #paid, Aspire,
   Grin, Upfluence, CreatorIQ, Cloutflow, Qoruz, and any notable new entrant.
3. Industry issues and trends relevant to Guapd's positioning specifically:
   influencer fraud and fake followers, verification and measurement, payment
   terms and creator payouts, ASCI/regulatory changes in India, platform API
   changes (Instagram/Meta) that affect measurement.

SOURCING RULES — these are not negotiable:
- Every statistic and claim carries an inline source: publication name, article
  title, date, and full URL.
- Only things you actually found and can cite. If a week is quiet, say so and
  return fewer items. A short honest brief beats a padded one.
- No invented numbers, no "industry estimates" without a named source, no
  statistics you cannot link to. If a figure appears only in an aggregator,
  trace it to the primary source or label it as unverified.
- Prefer primary sources (company announcements, regulator publications,
  original research) over commentary about them.
- Note the date of each item. A 2023 statistic resurfacing this week is not
  this week's news, and should be labelled as such if used at all.

OUTPUT — write the markdown to stdout and nothing else. No preamble, no
commentary, no "here is your brief". Structure:

# Weekly Content Brief — <today's date>

## This week's signal
One paragraph: what actually happened this week that matters to Guapd, and
why. If nothing much did, say that plainly.

## Sourced items
3-5 items. Each as:
### <headline>
- **What:** one or two sentences
- **Number:** the specific statistic, if there is one
- **Why it matters to Guapd:** one sentence tying it to verified data,
  deal workflow, or the India market
- **Source:** <Publication>, "<Title>", <date> — <URL>

## Carousel concepts
1-2 concepts. Each as:
### Concept: <working title>
- **Hook (slide 1):** the line that stops the scroll, under 12 words
- **Angle:** one sentence on the argument the carousel makes
- **Slides:** numbered slide-by-slide copy, 5-8 slides, each slide 1-2 short
  lines as they would actually appear
- **Closing slide:** the CTA
- **Sources used:** which of the items above this draws on
- **Do not claim:** anything the sources do not support, called out explicitly
  so the designer does not embellish it

## Angle worth watching
Anything notable that is not ready to post about yet but is worth tracking,
with a source. Omit this section if there is nothing.

---
*Research only. Copy is a starting point for design, not final slides.*
PROMPT_END

echo "Researching week of $DATE..." >&2

# WebSearch and WebFetch only: the research is read-only and the shell writes
# the file, so the model never needs write access to the repo.
if ! claude -p "$PROMPT" \
    --allowedTools "WebSearch,WebFetch" \
    --model claude-sonnet-5 \
    > "$OUT_FILE.tmp" 2>>"$LOG_FILE"; then
  rm -f "$OUT_FILE.tmp"
  echo "Research run failed. See $LOG_FILE" >&2
  exit 1
fi

# An empty or near-empty result is a failure wearing a success exit code —
# a rate limit or a refusal can both return 0 with nothing useful.
if [[ ! -s "$OUT_FILE.tmp" ]] || [[ $(wc -c <"$OUT_FILE.tmp") -lt 400 ]]; then
  echo "Output was empty or too short to be a brief; keeping it at $OUT_FILE.tmp for inspection" >&2
  exit 1
fi

mv "$OUT_FILE.tmp" "$OUT_FILE"
echo "Wrote $OUT_FILE" >&2

# Reveal it in Finder, selected, so the run announces itself.
#
# A scheduled job that succeeds silently is indistinguishable from one that
# never fired — and this one runs while you are doing something else on a
# Monday morning. `open -R` selects the new file rather than just opening the
# folder, so which week's brief is new is obvious at a glance.
#
# Skipped without a GUI session (SSH, CI), where it would fail noisily for no
# reason. The brief is already written by this point either way.
if [[ -z "${CI:-}" ]] && [[ -n "${HOME:-}" ]] && command -v open >/dev/null 2>&1; then
  open -R "$OUT_FILE" 2>/dev/null || true
fi
