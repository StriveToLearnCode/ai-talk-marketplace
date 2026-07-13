#!/usr/bin/env python3
"""Collect bounded project context for the AI Talk skill."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


SKILL_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PREFERENCES_PATH = SKILL_ROOT / "references" / "default-preferences.json"
USER_PREFERENCES_PATH = Path.home() / ".codex" / "ai-talk" / "preferences.json"

SUPPORTED_PREFERENCES = {
    "language": lambda value: isinstance(value, str) and bool(value.strip()),
    "default_mode": lambda value: value
    in {"analysis-only", "plan-first", "direct-execution"},
    "minimal_change": lambda value: isinstance(value, bool),
    "explain_commands": lambda value: isinstance(value, bool),
    "require_verification": lambda value: isinstance(value, bool),
    "avoid_unrelated_files": lambda value: isinstance(value, bool),
    "output_style": lambda value: value in {"concise", "enhanced"},
}

IGNORED_DIRECTORIES = {
    ".git",
    ".next",
    ".nuxt",
    ".output",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "target",
}

SENSITIVE_NAMES = {
    "credentials",
    "credentials.json",
    "id_dsa",
    "id_ed25519",
    "id_rsa",
    "private_key",
    "secrets",
    "secrets.json",
}

PROJECT_MARKERS = {
    "node": ("package.json",),
    "python": ("pyproject.toml", "setup.py", "requirements.txt"),
    "rust": ("Cargo.toml",),
    "go": ("go.mod",),
    "java": ("pom.xml", "build.gradle", "build.gradle.kts"),
    "swift": ("Package.swift", "Podfile"),
    "flutter": ("pubspec.yaml",),
}

LOCKFILES = (
    ("pnpm", "pnpm-lock.yaml"),
    ("yarn", "yarn.lock"),
    ("npm", "package-lock.json"),
    ("bun", "bun.lock"),
    ("bun", "bun.lockb"),
)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_preferences(
    preferences_path: Path | None,
) -> tuple[dict[str, Any], dict[str, Any], list[str], list[str]]:
    warnings: list[str] = []
    errors: list[str] = []

    try:
        defaults = read_json(DEFAULT_PREFERENCES_PATH)
    except (OSError, json.JSONDecodeError) as exc:
        return {}, {
            "path": str(DEFAULT_PREFERENCES_PATH),
            "source": "unavailable",
        }, warnings, [f"Bundled preferences could not be loaded: {exc}"]

    if not isinstance(defaults, dict):
        return {}, {
            "path": str(DEFAULT_PREFERENCES_PATH),
            "source": "unavailable",
        }, warnings, ["Bundled preferences must be a JSON object."]

    selected_path = preferences_path or USER_PREFERENCES_PATH
    source = "defaults"
    overrides: dict[str, Any] = {}

    if selected_path.exists():
        try:
            raw_overrides = read_json(selected_path)
            if isinstance(raw_overrides, dict):
                overrides = raw_overrides
                source = "custom" if preferences_path else "user"
            else:
                warnings.append(
                    f"Preferences at {selected_path} must be a JSON object; defaults were used."
                )
        except (OSError, json.JSONDecodeError) as exc:
            warnings.append(
                f"Preferences at {selected_path} could not be loaded; defaults were used: {exc}"
            )
    elif preferences_path is not None:
        warnings.append(
            f"Preferences file {selected_path} does not exist; defaults were used."
        )

    effective = dict(defaults)
    for key, value in overrides.items():
        validator = SUPPORTED_PREFERENCES.get(key)
        if validator is None:
            warnings.append(f"Unknown preference '{key}' was ignored.")
        elif validator(value):
            effective[key] = value
        else:
            warnings.append(
                f"Invalid value for preference '{key}' was ignored; the default was used."
            )

    return effective, {"path": str(selected_path), "source": source}, warnings, errors


def is_sensitive_path(path: Path) -> bool:
    for part in path.parts:
        lowered = part.lower()
        if lowered in IGNORED_DIRECTORIES or lowered.startswith(".env"):
            return True
        if lowered in SENSITIVE_NAMES or "secret" in lowered or "credential" in lowered:
            return True
    return path.suffix.lower() in {".key", ".pem", ".p12", ".pfx"}


def detect_project(root: Path, warnings: list[str]) -> dict[str, Any]:
    project_types = [
        project_type
        for project_type, markers in PROJECT_MARKERS.items()
        if any((root / marker).is_file() for marker in markers)
    ]
    manifests = sorted(
        {
            marker
            for markers in PROJECT_MARKERS.values()
            for marker in markers
            if (root / marker).is_file()
        }
    )

    package_scripts: dict[str, str] = {}
    package_manager: str | None = None
    package_manager_source: str | None = None
    package_json = root / "package.json"

    if package_json.is_file():
        try:
            package_data = read_json(package_json)
            if not isinstance(package_data, dict):
                raise ValueError("the root value is not an object")

            scripts = package_data.get("scripts", {})
            if isinstance(scripts, dict):
                package_scripts = {
                    str(key): str(value)
                    for key, value in scripts.items()
                    if isinstance(key, str) and isinstance(value, str)
                }
            else:
                warnings.append("package.json 'scripts' is not an object and was ignored.")

            declared_manager = package_data.get("packageManager")
            if isinstance(declared_manager, str) and declared_manager.strip():
                package_manager = declared_manager.split("@", 1)[0]
                package_manager_source = "package.json#packageManager"
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            warnings.append(f"package.json could not be parsed: {exc}")
    else:
        warnings.append("package.json was not found; package scripts are unavailable.")

    if package_manager is None:
        for manager, lockfile in LOCKFILES:
            if (root / lockfile).is_file():
                package_manager = manager
                package_manager_source = lockfile
                break

    if package_json.is_file() and package_manager is None:
        warnings.append(
            "The package manager could not be determined from packageManager or a lockfile."
        )

    return {
        "root": str(root),
        "types": project_types,
        "manifests": manifests,
        "package_manager": package_manager,
        "package_manager_source": package_manager_source,
        "package_scripts": package_scripts,
    }


def git_command(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
        timeout=5,
    )


def collect_git(root: Path, warnings: list[str]) -> dict[str, Any]:
    result = {
        "is_repository": False,
        "branch": None,
        "changed_files": [],
    }

    try:
        top_level = git_command(root, "rev-parse", "--show-toplevel")
    except (OSError, subprocess.TimeoutExpired) as exc:
        warnings.append(f"Git context is unavailable: {exc}")
        return result

    if top_level.returncode != 0:
        warnings.append("The project root is not inside a Git repository.")
        return result

    result["is_repository"] = True
    branch = git_command(root, "branch", "--show-current")
    if branch.returncode == 0 and branch.stdout.strip():
        result["branch"] = branch.stdout.strip()
    else:
        revision = git_command(root, "rev-parse", "--short", "HEAD")
        if revision.returncode == 0 and revision.stdout.strip():
            result["branch"] = f"detached:{revision.stdout.strip()}"

    status = git_command(root, "status", "--short", "--untracked-files=all")
    if status.returncode != 0:
        warnings.append("Git status could not be read.")
        return result

    changed_files: list[dict[str, str]] = []
    hidden_sensitive_count = 0
    for line in status.stdout.splitlines():
        if len(line) < 4:
            continue
        status_code = line[:2].strip() or line[:2]
        changed_path = line[3:].strip()
        candidate = changed_path.rsplit(" -> ", 1)[-1]
        if is_sensitive_path(Path(candidate)):
            hidden_sensitive_count += 1
            continue
        changed_files.append({"status": status_code, "path": changed_path})

    if hidden_sensitive_count:
        warnings.append(
            f"{hidden_sensitive_count} sensitive or generated Git path(s) were omitted."
        )
    result["changed_files"] = changed_files
    return result


def collect_context_files(root: Path) -> list[dict[str, str]]:
    files: list[dict[str, str]] = []
    candidates: list[tuple[Path, str]] = [
        (root / "AGENTS.md", "instructions"),
        (root / "package.json", "package-manifest"),
    ]
    candidates.extend(
        (path, "readme")
        for path in sorted(root.iterdir())
        if path.is_file() and path.name.lower().startswith("readme")
    )

    seen: set[Path] = set()
    for path, kind in candidates:
        if path in seen or not path.is_file() or is_sensitive_path(path.relative_to(root)):
            continue
        seen.add(path)
        files.append({"path": str(path.relative_to(root)), "kind": kind})
    return files


def collect_related(
    root: Path, related_paths: list[str], warnings: list[str]
) -> list[dict[str, str]]:
    related: list[dict[str, str]] = []
    seen: set[Path] = set()

    for raw_path in related_paths:
        candidate = Path(raw_path).expanduser()
        if not candidate.is_absolute():
            candidate = root / candidate
        candidate = candidate.resolve(strict=False)

        if not candidate.is_relative_to(root):
            warnings.append(f"Related path '{raw_path}' is outside the project root and was ignored.")
            continue

        relative = candidate.relative_to(root)
        if is_sensitive_path(relative):
            warnings.append(f"Related path '{raw_path}' is sensitive or generated and was ignored.")
            continue
        if not candidate.exists():
            warnings.append(f"Related path '{raw_path}' does not exist and was ignored.")
            continue
        if candidate in seen:
            continue

        seen.add(candidate)
        related.append(
            {
                "path": str(relative) if str(relative) else ".",
                "kind": "directory" if candidate.is_dir() else "file",
            }
        )
    return related


def collect_context(
    root: Path,
    related_paths: list[str] | None = None,
    preferences_path: Path | None = None,
) -> tuple[dict[str, Any], int]:
    warnings: list[str] = []
    errors: list[str] = []
    root = root.expanduser().resolve(strict=False)

    preferences, preference_meta, preference_warnings, preference_errors = (
        load_preferences(preferences_path)
    )
    warnings.extend(preference_warnings)
    errors.extend(preference_errors)

    payload: dict[str, Any] = {
        "project": {
            "root": str(root),
            "types": [],
            "manifests": [],
            "package_manager": None,
            "package_manager_source": None,
            "package_scripts": {},
        },
        "preferences": {**preference_meta, "values": preferences},
        "git": {"is_repository": False, "branch": None, "changed_files": []},
        "context_files": [],
        "related_files": [],
        "warnings": warnings,
        "errors": errors,
    }

    if not root.is_dir():
        errors.append(f"Project root is not a directory: {root}")
        return payload, 2

    payload["project"] = detect_project(root, warnings)
    payload["git"] = collect_git(root, warnings)
    payload["context_files"] = collect_context_files(root)
    payload["related_files"] = collect_related(root, related_paths or [], warnings)
    return payload, 2 if errors else 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect bounded project context for AI Talk as JSON."
    )
    parser.add_argument("--root", required=True, type=Path, help="Project root directory.")
    parser.add_argument(
        "--related",
        action="append",
        default=[],
        help="Related file or directory inside the project root. Repeat as needed.",
    )
    parser.add_argument(
        "--preferences",
        type=Path,
        help="Optional preferences JSON path. Defaults to ~/.codex/ai-talk/preferences.json.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload, exit_code = collect_context(args.root, args.related, args.preferences)
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
