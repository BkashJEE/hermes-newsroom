"""Install portable controls and the skill into existing Hermes profiles only."""
from pathlib import Path
import datetime
import json
import os
import shutil
import sys
import shlex

source = Path(sys.argv[1]).resolve()
runtime = Path.home() / '.local/share/omarchy-command-center'
state = Path.home() / '.local/state/omarchy-command-center'
state.mkdir(parents=True, exist_ok=True)

def write(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text() != content:
        shutil.copy2(path, str(path) + '.bak.' + datetime.datetime.now().strftime('%Y%m%d%H%M%S%f'))
    path.write_text(content)
    path.chmod(mode)

write(state / 'installation.json', json.dumps({'source': str(source), 'runtime': str(runtime), 'url': 'http://127.0.0.1:3520/newsroom', 'workspace': 8, 'service': 'omarchy-command-center.service'}, indent=2) + '\n')
node = shutil.which('node')
if not node:
    raise SystemExit('Node is unavailable')
write(Path.home() / '.local/bin/hermes-newsroom', '#!/bin/sh\nexec ' + shlex.quote(node) + ' ' + shlex.quote(str(runtime / 'scripts/newsroom-control.mjs')) + ' "$@"\n', 0o755)
hermes = Path.home() / '.hermes'
profiles = [hermes] + sorted((hermes / 'profiles').glob('*'))
for profile in profiles:
    if not (profile / 'skills').is_dir():
        continue
    write(profile / 'skills/productivity/hermes-newsroom/SKILL.md', (source / 'skills/hermes-newsroom/SKILL.md').read_text())
print('Installed Newsroom controls, installation record, and skill into existing Hermes profiles.')
