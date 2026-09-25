#!/usr/bin/env bash
# Verify first; publish a separate release so development never changes the server.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
: "${HOME:?HOME must be set}"
for tool in npm node rsync python3 systemctl flock curl; do command -v "$tool" >/dev/null; done
install -d -m 700 "$HOME/.local/state/omarchy-command-center"
exec 9>"$HOME/.local/state/omarchy-command-center/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
npm run verify
release_root="$HOME/.local/share/omarchy-command-center-releases"
deploy="$HOME/.local/share/omarchy-command-center"
unit="$HOME/.config/systemd/user/omarchy-command-center.service"
if [[ -e "$deploy" && ! -L "$deploy" ]]; then
  echo "Refusing to replace a non-symlink deployment: $deploy" >&2; exit 1
fi
mkdir -p "$release_root" "$(dirname "$unit")"
release=$(mktemp -d "$release_root/release-XXXXXXXX")
rsync -a .next node_modules public scripts package.json package-lock.json next.config.ts "$release/"
# Local config is runtime-only and is never copied into the repository.
rsync -a config "$release/"
# Next loads the ignored server-only .env at runtime; never bake it into source.
if [[ -f .env ]]; then install -m 600 .env "$release/.env"; fi
node_path=$(command -v node)
previous=$(readlink "$deploy" || true)
python3 - "$PWD/deploy/omarchy-command-center.service" "$unit" "$deploy" "$node_path" <<'PY'
from pathlib import Path
import datetime, shutil, sys
source, target, deploy, node = sys.argv[1:]
p = Path(target)
# Escape systemd specifiers and quoted path values (including spaces).
def quote(value):
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'
text = Path(source).read_text().replace('WorkingDirectory=@DEPLOY@', 'WorkingDirectory=' + deploy.replace('%', '%%')).replace('@DEPLOY@/node_modules/next/dist/bin/next', quote(deploy + '/node_modules/next/dist/bin/next')).replace('@DEPLOY@', quote(deploy)).replace('@NODE@', quote(node))
if p.exists() and p.read_text() != text:
    shutil.copy2(p, str(p) + '.bak.' + datetime.datetime.now().strftime('%Y%m%d%H%M%S%f'))
p.write_text(text)
PY
# Atomic symlink swap; retain the previous release for rollback.
ln -s "$release" "$release_root/current-next"
mv -Tf "$release_root/current-next" "$deploy"
systemd-analyze --user verify "$unit"
systemctl --user daemon-reload
systemctl --user enable omarchy-command-center.service
systemctl --user restart omarchy-command-center.service
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3520/api/newsroom >/dev/null; then
    python3 scripts/install-newsroom-control.py "$PWD"
    echo "Newsroom deployed at http://127.0.0.1:3520/newsroom"
    exit 0
  fi
  sleep 1
done
if [[ -n "$previous" ]]; then
  ln -s "$previous" "$release_root/rollback-next"
  mv -Tf "$release_root/rollback-next" "$deploy"
  systemctl --user restart omarchy-command-center.service
fi
echo 'Deployment health check failed; restored the previous release if available.' >&2
exit 1
