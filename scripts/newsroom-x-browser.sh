#!/usr/bin/env bash
# The profile is exclusive across manual login and timer/manual collection.
set -euo pipefail
umask 077
case "${1:-run}" in
  run|login) mode=${1:-run} ;;
  *) echo 'Usage: newsroom-x-browser.sh [run|login]' >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo 'Expected only run or login.' >&2; exit 2; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
state="$HOME/.local/state/omarchy-command-center"
mkdir -p -- "$state"
exec 9>"$state/browser-x-profile.lock"
if ! flock --nonblock 9; then
  echo 'X collector: profile is busy (login or collection in progress); skipped.'
  exit 75
fi
export NEWSROOM_X_PROFILE_LOCK=held
exec "${NEWSROOM_X_NODE:-node}" "$root/newsroom-x-playwright.mjs" "$mode"
