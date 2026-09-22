# Weekly content brief

Researches the creator economy and Guapd's competitive space once a week and
writes a dated, sourced markdown brief to `docs/content/`.

Research and copy only. It deliberately does not produce designed slides — the
brief is the input to design, not a replacement for it.

## Run it by hand

```bash
./scripts/weekly-brief.sh              # this week
./scripts/weekly-brief.sh 2026-09-15   # backfill a specific date
```

Writes `docs/content/weekly-brief-YYYY-MM-DD.md`. It refuses to overwrite an
existing brief: a week's research is not something a stray rerun should be
able to destroy silently.

## Schedule it weekly

```bash
cp scripts/com.guapd.weekly-brief.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.guapd.weekly-brief.plist
```

Mondays at 09:00 local.

**launchd rather than cron, deliberately.** `StartCalendarInterval` runs a
missed job once the machine wakes; a cron entry for 09:00 Monday simply skips
the week if the Mac was asleep at nine, and skips it silently. A laptop is
asleep at 09:00 more often than not.

Check, run now, or stop:

```bash
launchctl list | grep weekly-brief
launchctl start com.guapd.weekly-brief
launchctl unload ~/Library/LaunchAgents/com.guapd.weekly-brief.plist
```

Each successful run reveals the new file in Finder (`open -R`), so a Monday
morning run announces itself rather than finishing silently — a scheduled job
that succeeds quietly is indistinguishable from one that never fired.

Logs: `/tmp/guapd-weekly-brief.{out,err}.log`, and `docs/content/.weekly-brief.log`
for the research run's own stderr.

## What it will and will not do

The prompt forbids unsourced figures and tells it to return FEWER items in a
quiet week rather than pad. A three-item brief that cites everything is the
intended output; five items where two are invented is the failure this is
written to avoid. Every statistic carries publication, title, date and URL.

It exits non-zero on an empty or implausibly short result and keeps the
partial output at `.tmp` for inspection, because a rate limit and a refusal
both otherwise return success with nothing useful in the file.

## Known limits

- **Only runs when the Mac is on.** launchd catches up after sleep, but a
  machine that is off all Monday and Tuesday produces the brief on Wednesday.
  A cloud routine would not have this limit; it needs GitHub connected to the
  Claude account first (`/web-setup`).
- **Research quality varies with the week.** Sparse weeks genuinely exist in
  this space, and the brief is instructed to say so rather than invent.
- **Nothing is committed automatically.** The file lands in the working tree
  and it is up to you whether it goes in a commit.
