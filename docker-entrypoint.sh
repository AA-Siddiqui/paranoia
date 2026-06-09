#!/bin/sh

set -u

interval="${CHECK_INTERVAL_SECONDS:-300}"

case "$interval" in
  ''|*[!0-9]*)
    echo "CHECK_INTERVAL_SECONDS must be a positive integer; got '$interval'" >&2
    exit 64
    ;;
esac

if [ "$interval" -le 0 ]; then
  echo "CHECK_INTERVAL_SECONDS must be greater than zero; got '$interval'" >&2
  exit 64
fi

stop() {
  echo "Received shutdown signal; stopping scheduler."
  exit 0
}

trap stop INT TERM

while true; do
  echo "[$(date -Iseconds)] Starting paranoia check."

  if pnpm go; then
    echo "[$(date -Iseconds)] Paranoia check completed."
  else
    status="$?"
    echo "[$(date -Iseconds)] Paranoia check failed with exit code $status." >&2

    if [ "${STOP_ON_FAILURE:-0}" = "1" ]; then
      exit "$status"
    fi
  fi

  echo "[$(date -Iseconds)] Sleeping for $interval seconds."
  sleep "$interval" &
  wait "$!"
done
