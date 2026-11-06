#!/bin/bash
# "Nothing sends, nothing runs" audit of a release branch vs origin/main.
cd "$1" || exit 1
d() { git diff origin/main..HEAD "$@"; }
echo "== files changed: $(d --name-only | wc -l | tr -d ' ') ($(d --name-only --diff-filter=A | wc -l | tr -d ' ') new)"
echo "== cron / scheduler / sender modules touched:"
d --name-only | grep -E "vercel\.json|app/api/cron|instagram-sync|instagram-break-notify|creator-whatsapp|lib/whatsapp|lib/email|account-emails|lib/notifications\.ts|experience-.*-notify" || echo "   none"
echo "== added lines that call a sender, job or the Instagram sync:"
d -U0 -- apps/web | grep "^+" | grep -nE "sendWhatsApp|sendWhatsAppTemplate|notifyCreator|notifyOther|notifyDealParty|notifyBoth|sendEmail|resend\.|sendSms|msg91|interakt|refreshAndSync|markConnectionBroken|syncFeaturedReels|setInterval|cron" || echo "   none"
echo "== in-app notifications added (createNotification):"
d -U0 -- apps/web | grep "^+" | grep -n "createNotification(" || echo "   none"
echo "== migrations: triggers, pg_cron, pg_net, http, NOTIFY:"
d -- supabase/migrations | grep "^+" | grep -inE "create trigger|cron\.|pg_net|net\.http|http_post|\bnotify\b" || echo "   none"
echo "== outbound hosts in added server code:"
d -U0 -- apps/web/lib apps/web/app/api apps/web/app/ai | grep "^+" | grep -oE "https://[a-zA-Z0-9.-]+" | sort | uniq -c
echo "== Anthropic / Graph call sites:"
d -U0 -- apps/web | grep "^+" | grep -nE "new Anthropic\(|messages\.parse|graph\(|fetch\(\`\\\$\{graphBase" || echo "   none"
