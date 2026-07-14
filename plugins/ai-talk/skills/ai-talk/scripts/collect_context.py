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
CAPABILITY_INDEX_SCRIPT = SKILL_ROOT / "scripts" / "build-capability-index.mjs"
DEFAULT_CAPABILITY_LIMIT = 30

TASK_SCENES = {
    "bug_debugging": ("bug", "报错", "异常", "失效", "不切换", "偶尔", "定位", "排查", "问题还在"),
    "ui_reconstruction": ("截图", "figma", "还原", "视觉", "样式", "切图"),
    "localization_migration": ("多语言", "语言包", "俄语", "法语", "迁移", "没替换", "未替换"),
    "api_integration": ("接口", "openapi", "请求", "响应", "联调", "字段"),
    "feature_development": ("帮我开发", "开发", "新页面", "独立页面", "新模块", "新增", "实现", "创建"),
}

CAPABILITY_CHOICES = ("prefer_reuse", "prefer_reference", "excluded")

SUPPORTED_PREFERENCES = {
    "language": lambda value: isinstance(value, str) and bool(value.strip()),
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


def context_file_summary(path: Path, limit: int = 600) -> str:
    try:
        content = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return ""
    return " ".join(content.split())[:limit]


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
        files.append(
            {
                "path": str(path.relative_to(root)),
                "kind": kind,
                "summary": context_file_summary(path),
            }
        )
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


def empty_capability_context(
    query: str | None,
    status: str = "not-requested",
) -> dict[str, Any]:
    return {
        "status": status,
        "query": query.strip() if isinstance(query, str) and query.strip() else None,
        "roots": [],
        "lifecycle": {
            "discovery_states": ["candidate_reuse", "candidate_reference", "low_relevance"],
            "selection_states": ["auto_selected", "choice_required", "low_relevance"],
            "skill_candidate_states": ["candidate"],
            "skill_invocation_states": ["not_invoked", "invoked", "failed", "empty"],
            "usage_preferences": ["apply", "prefer_reuse", "prefer_reference", "excluded"],
            "user_choice_states": ["prefer_reuse", "prefer_reference", "excluded"],
            "execution_validation_states": [
                "confirmed_reuse",
                "partial_reuse",
                "incompatible",
                "reference_only",
            ],
        },
        "stats": {
            "total": 0,
            "by_kind": {},
            "by_scope": {},
            "returned": 0,
            "truncated": False,
        },
        "selected": [],
        "automatic": [],
        "choice_required": [],
        "skill_candidates": [],
        "candidates": [],
        "warnings": [],
    }


def collect_capabilities(
    root: Path,
    query: str | None,
    source_roots: list[str],
    limit: int,
    warnings: list[str],
) -> dict[str, Any]:
    normalized_query = query.strip() if isinstance(query, str) else ""
    if not normalized_query:
        return empty_capability_context(query)

    command = [
        "node",
        str(CAPABILITY_INDEX_SCRIPT),
        "--root",
        str(root),
        "--query",
        normalized_query,
        "--limit",
        str(limit),
    ]
    for source_root in source_roots:
        command.extend(["--source-root", source_root])

    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        message = f"Capability index is unavailable: {exc}"
        warnings.append(message)
        capability_context = empty_capability_context(normalized_query, "unavailable")
        capability_context["warnings"].append(message)
        return capability_context

    if result.returncode != 0:
        detail = result.stderr.strip() or f"exit code {result.returncode}"
        message = f"Capability index failed and was skipped: {detail}"
        warnings.append(message)
        capability_context = empty_capability_context(normalized_query, "unavailable")
        capability_context["warnings"].append(message)
        return capability_context

    try:
        raw_payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        message = f"Capability index returned invalid JSON and was skipped: {exc}"
        warnings.append(message)
        capability_context = empty_capability_context(normalized_query, "unavailable")
        capability_context["warnings"].append(message)
        return capability_context

    if not isinstance(raw_payload, dict):
        message = "Capability index returned a non-object payload and was skipped."
        warnings.append(message)
        capability_context = empty_capability_context(normalized_query, "unavailable")
        capability_context["warnings"].append(message)
        return capability_context

    return {
        "status": "ready",
        "query": raw_payload.get("query") or normalized_query,
        "roots": raw_payload.get("roots", []),
        "lifecycle": raw_payload.get("lifecycle", empty_capability_context(None)["lifecycle"]),
        "stats": raw_payload.get("stats", empty_capability_context(None)["stats"]),
        "selected": raw_payload.get("selected", []),
        "automatic": raw_payload.get("automatic", []),
        "choice_required": raw_payload.get("choice_required", []),
        "skill_candidates": raw_payload.get("skill_candidates", []),
        "candidates": raw_payload.get("capabilities", []),
        "warnings": raw_payload.get("warnings", []),
    }


def infer_task(query: str | None, blocking_question: str | None) -> dict[str, Any]:
    text = query.strip() if isinstance(query, str) else ""
    lowered = text.lower()
    scenes = [
        scene
        for scene, terms in TASK_SCENES.items()
        if any(term in lowered for term in terms)
    ]
    if not scenes:
        scenes = ["unknown"]

    if any(term in lowered for term in ("审查代码", "代码审查", "review code", "code review")):
        handling_mode = "review"
    elif any(
        term in lowered
        for term in ("不要修改", "不要改", "只分析", "先定位", "先帮我看看", "帮我看看", "看看还有哪些")
    ):
        handling_mode = "analyze"
    elif any(term in lowered for term in ("先给方案", "只给方案", "先分析怎么改", "讨论方案")):
        handling_mode = "plan"
    elif any(
        term in lowered
        for term in ("帮我开发", "开发", "实现", "新增", "创建", "接入", "修复", "改好", "完成并验证")
    ):
        handling_mode = "modify_and_verify"
    else:
        handling_mode = "plan"

    prompt_state = "draft" if not text or blocking_question else "ready"

    return {
        "scenes": scenes,
        "primary_scene": scenes[0],
        "handling_mode": handling_mode,
        "prompt_state": prompt_state,
        "blocking_question": blocking_question,
        "ai_talk_may_modify_code": False,
        "awaiting_capability_choice": False,
        "pending_capability_choice_count": 0,
        "conflicts": [],
        "output_contract": {
            "summary_fields": [
                "task_type",
                "handling_mode",
                "prompt_state",
                "related_scope",
                "invoked_skills",
                "skill_findings",
                "checked_sources",
                "automatic_capabilities",
                "choice_required",
                "user_selections",
                "unconfirmed_information",
            ],
            "final_task_fields": [
                "current_request",
                "current_goal",
                "related_scope",
                "handling_mode",
                "invoked_skills",
                "skill_findings",
                "checked_sources",
                "automatic_capabilities",
                "user_capability_choices",
                "project_constraints",
                "prohibitions",
                "output_requirements",
                "acceptance_requirements",
                "unconfirmed_information",
            ],
            "stop_after_prompt_ready": True,
        },
    }


def apply_rule_conflicts(task: dict[str, Any], query: str | None, context_files: list[dict[str, str]]) -> None:
    text = query.lower() if isinstance(query, str) else ""
    rejects_reuse = any(term in text for term in ("不要复用", "不复用", "重新实现", "从头实现"))
    if not rejects_reuse:
        return

    for context_file in context_files:
        summary = context_file.get("summary", "").lower()
        requires_reuse = any(
            term in summary
            for term in ("优先复用", "尽量复用", "prefer existing", "reuse existing")
        )
        if not requires_reuse:
            continue
        task["conflicts"].append(
            {
                "user_request": "Do not reuse existing capabilities; implement again.",
                "project_rule": f"{context_file['path']} requires existing capabilities to be preferred.",
                "recommendation": "Verify compatibility first; add a business implementation only when reuse is unsuitable.",
                "requires_user_choice": True,
            }
        )

    if task["conflicts"]:
        task["prompt_state"] = "draft"
        task["blocking_question"] = "是否同意先验证现有能力兼容性，确认不适用后再新增实现？"


def apply_capability_choices(
    capabilities: dict[str, Any], raw_choices: list[str], warnings: list[str]
) -> dict[str, list[dict[str, Any]]]:
    choices: dict[str, str] = {}
    for raw in raw_choices:
        capability_id, separator, choice = raw.partition("=")
        if not separator or choice not in CAPABILITY_CHOICES:
            warnings.append(
                f"Capability choice '{raw}' was ignored; expected <id>=prefer_reuse|prefer_reference|excluded."
            )
            continue
        choices[capability_id] = choice

    groups = {choice: [] for choice in CAPABILITY_CHOICES}
    known_ids = {
        candidate.get("id")
        for candidate in capabilities["candidates"]
        if candidate.get("id")
    }
    for capability_id in choices.keys() - known_ids:
        warnings.append(f"Capability choice referenced unknown id '{capability_id}' and was ignored.")

    for collection_name in ("selected", "automatic", "choice_required", "candidates"):
        for candidate in capabilities[collection_name]:
            choice = choices.get(candidate.get("id"))
            candidate["user_choice"] = choice
            if choice:
                candidate["usage_preference"] = choice
                candidate["selection_source"] = "user"
                candidate["choice_reason"] = "The user explicitly selected this usage preference."
            if choice and collection_name == "candidates":
                groups[choice].append(candidate)
    return groups


def is_project_component_candidate(candidate: dict[str, Any]) -> bool:
    return candidate.get("scope") == "project" and candidate.get("kind") in {
        "component",
        "implementation",
    }


def apply_capability_choice_state(
    task: dict[str, Any],
    capabilities: dict[str, Any],
    defer_project_component_choice: bool = False,
) -> None:
    pending = [
        candidate
        for candidate in capabilities["choice_required"]
        if candidate.get("user_choice") is None
        and not (
            defer_project_component_choice
            and is_project_component_candidate(candidate)
        )
    ]
    task["awaiting_capability_choice"] = bool(pending)
    task["pending_capability_choice_count"] = len(pending)
    if not pending:
        return

    task["prompt_state"] = "draft"
    task["blocking_question"] = "请选择待选组件或复用方法的使用方式。"


def compose_task_context(payload: dict[str, Any]) -> dict[str, Any]:
    capabilities = payload["capabilities"]
    project_component_selection_deferred = payload[
        "project_component_selection_deferred"
    ]

    def visible(candidate: dict[str, Any]) -> bool:
        return not (
            project_component_selection_deferred
            and is_project_component_candidate(candidate)
        )

    return {
        "task": payload["task"],
        "project": payload["project"],
        "git": payload["git"],
        "context_files": payload["context_files"],
        "related_files": payload["related_files"],
        "capabilities": {
            "status": capabilities["status"],
            "query": capabilities["query"],
            "roots": capabilities["roots"],
            "lifecycle": capabilities["lifecycle"],
            "stats": capabilities["stats"],
            "project_component_selection_deferred": project_component_selection_deferred,
            "selected": [item for item in capabilities["selected"] if visible(item)],
            "automatic": [item for item in capabilities["automatic"] if visible(item)],
            "choice_required": [
                item for item in capabilities["choice_required"] if visible(item)
            ],
            "skill_candidates": capabilities["skill_candidates"],
            "user_selections": payload["capability_selections"],
            "warnings": capabilities["warnings"],
        },
    }


def collect_context(
    root: Path,
    related_paths: list[str] | None = None,
    preferences_path: Path | None = None,
    query: str | None = None,
    source_roots: list[str] | None = None,
    capability_limit: int = DEFAULT_CAPABILITY_LIMIT,
    blocking_question: str | None = None,
    capability_choices: list[str] | None = None,
    defer_project_component_choice: bool = False,
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
        "schema_version": 6,
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
        "task": infer_task(query, blocking_question),
        "capability_selections": {choice: [] for choice in CAPABILITY_CHOICES},
        "capabilities": empty_capability_context(query),
        "project_component_selection_deferred": defer_project_component_choice,
        "task_context": {},
        "warnings": warnings,
        "errors": errors,
    }
    payload["task_context"] = compose_task_context(payload)

    if not root.is_dir():
        errors.append(f"Project root is not a directory: {root}")
        return payload, 2

    payload["project"] = detect_project(root, warnings)
    payload["git"] = collect_git(root, warnings)
    payload["context_files"] = collect_context_files(root)
    apply_rule_conflicts(payload["task"], query, payload["context_files"])
    payload["related_files"] = collect_related(root, related_paths or [], warnings)
    payload["capabilities"] = collect_capabilities(
        root,
        query,
        source_roots or [],
        capability_limit,
        warnings,
    )
    payload["capability_selections"] = apply_capability_choices(
        payload["capabilities"], capability_choices or [], warnings
    )
    apply_capability_choice_state(
        payload["task"],
        payload["capabilities"],
        defer_project_component_choice,
    )
    payload["task_context"] = compose_task_context(payload)
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
    parser.add_argument(
        "--query",
        help="Task request used to rank and select capabilities into task_context.",
    )
    parser.add_argument(
        "--source-root",
        action="append",
        default=[],
        help="Company or team capability root as label=/absolute/path. Repeat as needed.",
    )
    parser.add_argument(
        "--capability-limit",
        type=int,
        default=DEFAULT_CAPABILITY_LIMIT,
        help="Maximum ranked capability candidates included in task_context (default: 30).",
    )
    parser.add_argument(
        "--blocking-question",
        help="Keep the task in draft while this direction-changing question remains unanswered.",
    )
    parser.add_argument(
        "--capability-choice",
        action="append",
        default=[],
        help="User choice as <capability-id>=prefer_reuse|prefer_reference|excluded. Repeat as needed.",
    )
    parser.add_argument(
        "--defer-project-component-choice",
        action="store_true",
        help=(
            "Collect project component and implementation candidates without exposing "
            "or blocking on them during the company-component search stage."
        ),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not 1 <= args.capability_limit <= 5000:
        raise SystemExit("--capability-limit must be between 1 and 5000")
    payload, exit_code = collect_context(
        args.root,
        args.related,
        args.preferences,
        query=args.query,
        source_roots=args.source_root,
        capability_limit=args.capability_limit,
        blocking_question=args.blocking_question,
        capability_choices=args.capability_choice,
        defer_project_component_choice=args.defer_project_component_choice,
    )
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
