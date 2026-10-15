#!/usr/bin/env python3
"""Install the per-user Framer broker at login without touching Framer projects."""
import os
import plistlib
import subprocess
from pathlib import Path

label = "com.taylor.framer-broker"
home = Path.home()
source = Path(__file__).with_name("service.mjs")
destination = home / "Library" / "LaunchAgents" / f"{label}.plist"
logs = home / "Library" / "Logs" / "TaylorFramer"
logs.mkdir(parents=True, exist_ok=True)
destination.parent.mkdir(parents=True, exist_ok=True)
payload = {
    "Label": label,
    "ProgramArguments": ["/usr/bin/env", "-i", f"HOME={home}", "PATH=/opt/homebrew/bin:/usr/bin:/bin", "/opt/homebrew/bin/node", str(source)],
    "RunAtLoad": True,
    "KeepAlive": True,
    "ProcessType": "Background",
    "StandardOutPath": str(logs / "stdout.log"),
    "StandardErrorPath": str(logs / "stderr.log"),
}
data = plistlib.dumps(payload)
if destination.exists() and destination.read_bytes() != data:
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{label}"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
destination.write_bytes(data)
subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(destination)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
subprocess.run(["launchctl", "enable", f"gui/{os.getuid()}/{label}"], check=True)
subprocess.run(["launchctl", "kickstart", "-k", f"gui/{os.getuid()}/{label}"], check=True)
print(f"Installed and started {label}")
