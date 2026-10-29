#!/usr/bin/env python3
"""Create local development secrets once; never overwrite existing settings."""
from pathlib import Path
import os
import secrets

root = Path(__file__).resolve().parent.parent
target = root / ".env"
if target.exists():
    print(".env already exists; left unchanged")
else:
    content = (root / ".env.example").read_text()
    for key in ("MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD", "REDIS_PASSWORD"):
        lines = content.splitlines()
        content = "\n".join(
            f"{key}={secrets.token_hex(24)}" if line.startswith(f"{key}=") else line
            for line in lines
        ) + "\n"
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        handle.write(content)
    print("Created .env with random local development passwords")
