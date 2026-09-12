#!/bin/sh
# Renders the crontab from environment variables and runs busybox crond.
# Calls the Memex cron route on a schedule so scheduled emails, digests, and
# token cleanup run without any external cron service.
set -eu

: "${CRON_TARGET_URL:?CRON_TARGET_URL must be set}"
SCHEDULE="${CRON_SCHEDULE:-*/10 * * * *}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "WARNING: CRON_SECRET is empty; requests will be rejected if the app requires it."
  AUTH_LINE=""
else
  AUTH_LINE="--header=Authorization:\\ Bearer\\ ${CRON_SECRET}"
fi

echo "$SCHEDULE wget -qO- $AUTH_LINE $CRON_TARGET_URL >/dev/null 2>&1" | crontab -
echo "Scheduler armed: [$SCHEDULE] -> $CRON_TARGET_URL"
exec crond -f -l 2
