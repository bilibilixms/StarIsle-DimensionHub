#!/usr/bin/env python3
"""Mirror compiled Weixin apps to a Windows-local preview directory."""
from argparse import ArgumentParser
from pathlib import Path
import hashlib
import json
import shutil
import time


def digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def sync(root: Path, target: Path) -> int:
    changed = 0
    for role in ("user", "merchant"):
        source = root / "apps" / f"{role}-miniapp" / "dist/dev/mp-weixin"
        if not (source / "app.json").is_file():
            raise FileNotFoundError(f"Build the {role} miniapp first: {source}")
        destination = target / f"{role}-miniapp"
        for path in source.rglob("*"):
            if not path.is_file() or path.name == "project.private.config.json":
                continue
            output = destination / path.relative_to(source)
            if path.name == "project.config.json" and output.is_file():
                config = json.loads(path.read_text())
                local_config = json.loads(output.read_text())
                local_appid = local_config.get("appid", "")
                if config.get("appid", "") in ("", "touristappid") and local_appid not in ("", "touristappid"):
                    config["appid"] = local_appid
                    content = json.dumps(config, ensure_ascii=False, indent=2) + "\n"
                    if output.read_text() == content:
                        continue
                    temporary = output.with_name(output.name + ".starisle-tmp")
                    temporary.write_text(content)
                    temporary.replace(output)
                    changed += 1
                    continue
            if output.is_file() and output.stat().st_size == path.stat().st_size:
                if digest(path) == digest(output):
                    continue
            output.parent.mkdir(parents=True, exist_ok=True)
            # Replace each file atomically; preserve DevTools' private settings.
            temporary = output.with_name(output.name + ".starisle-tmp")
            shutil.copyfile(path, temporary)
            temporary.replace(output)
            changed += 1
    return changed


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    target = args.target.resolve()
    if target == root or target in root.parents:
        parser.error("Preview target must be a separate directory")
    target.mkdir(parents=True, exist_ok=True)
    try:
        while True:
            try:
                changed = sync(root, target)
                if changed:
                    print(f"Synced {changed} files to {target}", flush=True)
            except (FileNotFoundError, PermissionError) as error:
                if not args.watch:
                    raise
                print(f"Waiting for build or file unlock: {error}", flush=True)
            if not args.watch:
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("Preview sync stopped", flush=True)


if __name__ == "__main__":
    main()
