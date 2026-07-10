#!/usr/bin/env python3
"""Print a small, read-only repository health report."""

from __future__ import annotations

import json
import os
from pathlib import Path


ROOT = Path.cwd()
IMPORTANT_FILES = (
    "README.md",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "Dockerfile",
    ".gitignore",
)
GENERATED_FOLDERS = {"node_modules", "dist", "build", ".next", "__pycache__"}
SECRET_NAMES = {".env", ".env.local", "credentials.json", "service-account.json"}
SECRET_SUFFIXES = {".pem", ".key"}


def section(title: str) -> None:
    print(f"\n{title}\n{'-' * len(title)}")


def status(level: str, message: str) -> None:
    print(f"[{level}] {message}")


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def scan_tree() -> tuple[list[Path], list[Path]]:
    risky_files: list[Path] = []
    generated_folders: list[Path] = []

    for current, directories, files in os.walk(ROOT):
        current_path = Path(current)
        kept_directories = []
        for name in directories:
            path = current_path / name
            if name in GENERATED_FOLDERS:
                generated_folders.append(path)
            elif name != ".git":
                kept_directories.append(name)
        directories[:] = kept_directories

        for name in files:
            if name in SECRET_NAMES or Path(name).suffix.lower() in SECRET_SUFFIXES:
                risky_files.append(current_path / name)

    return sorted(risky_files), sorted(generated_folders)


def project_types() -> list[str]:
    detected = []
    if (ROOT / "package.json").is_file():
        detected.append("Node.js / JavaScript")
    if (ROOT / "pyproject.toml").is_file() or (ROOT / "requirements.txt").is_file():
        detected.append("Python")
    if (ROOT / "Dockerfile").is_file():
        detected.append("Dockerized")
    return detected


def package_scripts() -> dict[str, str]:
    package_file = ROOT / "package.json"
    if not package_file.is_file():
        return {}
    try:
        data = json.loads(package_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {}
    scripts = data.get("scripts", {})
    return scripts if isinstance(scripts, dict) else {}


def main() -> int:
    print("Repository Doctor")
    print("=================")
    status("PASS", f"Scanning repository root: {ROOT}")

    section("Project Type")
    types = project_types()
    if types:
        status("PASS", f"Detected: {', '.join(types)}")
    else:
        status("WARN", "No common Node.js, Python, or Docker project markers found.")

    section("Important Files")
    for name in IMPORTANT_FILES:
        if (ROOT / name).is_file():
            status("PASS", f"Found {name}")
        else:
            status("WARN", f"Missing {name}")

    section("Build/Test Config")
    scripts = package_scripts()
    build_commands = sorted(name for name in scripts if name == "build" or name.startswith("build:"))
    test_commands = sorted(name for name in scripts if name == "test" or name.startswith("test:"))
    if build_commands:
        status("PASS", f"Package build script(s): {', '.join(build_commands)}")
    else:
        status("WARN", "No package build script found.")
    if test_commands:
        status("PASS", f"Package test script(s): {', '.join(test_commands)}")
    else:
        status("WARN", "No package test script found.")
    for name in ("pyproject.toml", "requirements.txt", "Dockerfile"):
        if (ROOT / name).is_file():
            status("PASS", f"Found configuration file: {name}")

    risky_files, generated_folders = scan_tree()
    section("Safety Check")
    if risky_files:
        for path in risky_files:
            status("FAIL", f"Potential secret file present: {relative(path)}")
    else:
        status("PASS", "No common secret filenames detected.")
    if generated_folders:
        for path in generated_folders:
            status("WARN", f"Generated/dependency folder present: {relative(path)}")
    else:
        status("PASS", "No common generated/dependency folders detected.")

    section("Final Summary")
    if risky_files:
        status("FAIL", "Review potential secret files and ensure they are not committed.")
    elif generated_folders or not test_commands:
        status("WARN", "Repository is usable, with informational items to review.")
    else:
        status("PASS", "No common repository health issues detected.")
    status("PASS", "Informational check complete; no files were uploaded or changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
