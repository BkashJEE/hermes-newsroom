#!/usr/bin/env python3
"""Install only collector scripts and user units. Never start or enable a timer."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile


def atomic_write(target, content, mode):
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=target.name + ".", dir=target.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            os.fchmod(stream.fileno(), mode)
        os.replace(name, target)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'


def main():
    source = Path(__file__).resolve().parent.parent
    deploy = Path.home() / ".local/share/omarchy-command-center"
    units = Path.home() / ".config/systemd/user"
    node = shutil.which("node")
    if not node or not (deploy / "node_modules/playwright-core").is_dir():
        raise SystemExit("Deploy the Newsroom app with its existing playwright-core dependency first.")
    if not Path("/usr/bin/chromium").is_file():
        raise SystemExit("Expected Chromium at /usr/bin/chromium.")
    for unit in ("newsroom-x-collector.timer", "newsroom-x-collector.service"):
        result = subprocess.run(["systemctl", "--user", "is-active", "--quiet", unit])
        if result.returncode == 0:
            raise SystemExit(f"Stop {unit} before replacing the collector files.")
    rendered = {}
    for suffix in ("service", "timer"):
        name = f"newsroom-x-collector.{suffix}"
        text = (source / "deploy" / name).read_text()
        # WorkingDirectory is a single literal path, not an ExecStart-style list.
        text = text.replace("WorkingDirectory=@DEPLOY@", "WorkingDirectory=" + str(deploy).replace('%', '%%'))
        text = text.replace("Environment=NEWSROOM_X_NODE=@NODE@", "Environment=" + quote("NEWSROOM_X_NODE=" + node))
        text = text.replace("@DEPLOY@/scripts/newsroom-x-browser.sh", quote(deploy / "scripts/newsroom-x-browser.sh"))
        rendered[name] = text.encode()
    with tempfile.TemporaryDirectory(prefix="newsroom-x-units-") as scratch:
        for name, content in rendered.items():
            Path(scratch, name).write_bytes(content)
        subprocess.run(["systemd-analyze", "--user", "verify", *[str(Path(scratch, name)) for name in rendered]], check=True)
    for name in ("newsroom-x-collector.mjs", "newsroom-x-playwright.mjs", "newsroom-x-browser.sh"):
        atomic_write(deploy / "scripts" / name, (source / "scripts" / name).read_bytes(), 0o755 if name.endswith(".sh") else 0o644)
    for name, content in rendered.items():
        atomic_write(units / name, content, 0o644)
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    print("Installed collector scripts and user units. No timer was enabled or started; no Codex permissions were changed.")


if __name__ == "__main__":
    main()
