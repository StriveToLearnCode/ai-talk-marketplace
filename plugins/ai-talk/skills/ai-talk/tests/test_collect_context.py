from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "collect_context.py"
SPEC = importlib.util.spec_from_file_location("collect_context", SCRIPT_PATH)
assert SPEC and SPEC.loader
collect_context = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collect_context)


class CollectContextTests(unittest.TestCase):
    def make_root(self) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        temporary = tempfile.TemporaryDirectory()
        return temporary, Path(temporary.name)

    def test_missing_preferences_uses_defaults_without_warning(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)

        missing = root / "missing-preferences.json"
        with mock.patch.object(collect_context, "USER_PREFERENCES_PATH", missing):
            values, meta, warnings, errors = collect_context.load_preferences(None)

        self.assertEqual("plan-first", values["default_mode"])
        self.assertEqual("defaults", meta["source"])
        self.assertEqual(str(missing), meta["path"])
        self.assertEqual([], warnings)
        self.assertEqual([], errors)

    def test_partial_preferences_override_defaults(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        preferences = root / "preferences.json"
        preferences.write_text(
            json.dumps({"minimal_change": False, "output_style": "enhanced"}),
            encoding="utf-8",
        )

        values, meta, warnings, errors = collect_context.load_preferences(preferences)

        self.assertFalse(values["minimal_change"])
        self.assertEqual("enhanced", values["output_style"])
        self.assertTrue(values["require_verification"])
        self.assertEqual("custom", meta["source"])
        self.assertEqual([], warnings)
        self.assertEqual([], errors)

    def test_invalid_and_unknown_preferences_fall_back(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        preferences = root / "preferences.json"
        preferences.write_text(
            json.dumps(
                {
                    "default_mode": "always-do-it",
                    "minimal_change": "yes",
                    "unknown": True,
                }
            ),
            encoding="utf-8",
        )

        values, _, warnings, errors = collect_context.load_preferences(preferences)

        self.assertEqual("plan-first", values["default_mode"])
        self.assertTrue(values["minimal_change"])
        self.assertEqual(3, len(warnings))
        self.assertEqual([], errors)

    def test_node_project_reports_manager_and_scripts(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        (root / "package.json").write_text(
            json.dumps(
                {
                    "packageManager": "pnpm@10.0.0",
                    "scripts": {"test": "node --test", "build": "vite build"},
                }
            ),
            encoding="utf-8",
        )

        payload, exit_code = collect_context.collect_context(root)

        self.assertEqual(0, exit_code)
        self.assertIn("node", payload["project"]["types"])
        self.assertEqual("pnpm", payload["project"]["package_manager"])
        self.assertEqual("node --test", payload["project"]["package_scripts"]["test"])

    def test_non_node_project_returns_package_warning(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        (root / "pyproject.toml").write_text("[project]\nname='sample'\n", encoding="utf-8")

        payload, exit_code = collect_context.collect_context(root)

        self.assertEqual(0, exit_code)
        self.assertIn("python", payload["project"]["types"])
        self.assertTrue(any("package.json" in warning for warning in payload["warnings"]))

    def test_dirty_git_status_is_reported(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        subprocess.run(["git", "init", "-q"], cwd=root, check=True)
        (root / "tracked.txt").write_text("changed\n", encoding="utf-8")

        payload, exit_code = collect_context.collect_context(root)

        self.assertEqual(0, exit_code)
        self.assertTrue(payload["git"]["is_repository"])
        self.assertIn(
            "tracked.txt", [item["path"] for item in payload["git"]["changed_files"]]
        )

    def test_malformed_package_json_is_a_warning(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        (root / "package.json").write_text("{not-json", encoding="utf-8")

        payload, exit_code = collect_context.collect_context(root)

        self.assertEqual(0, exit_code)
        self.assertEqual({}, payload["project"]["package_scripts"])
        self.assertTrue(any("could not be parsed" in item for item in payload["warnings"]))

    def test_sensitive_related_path_is_ignored(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        (root / ".env.production").write_text("TOKEN=value\n", encoding="utf-8")

        payload, exit_code = collect_context.collect_context(
            root, related_paths=[".env.production"]
        )

        self.assertEqual(0, exit_code)
        self.assertEqual([], payload["related_files"])
        self.assertTrue(any("sensitive" in item for item in payload["warnings"]))

    def test_related_path_outside_root_is_ignored(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        outside = root.parent / "outside-ai-talk-test.txt"
        outside.write_text("outside\n", encoding="utf-8")
        self.addCleanup(lambda: outside.unlink(missing_ok=True))

        payload, exit_code = collect_context.collect_context(
            root, related_paths=[str(outside)]
        )

        self.assertEqual(0, exit_code)
        self.assertEqual([], payload["related_files"])
        self.assertTrue(any("outside" in item for item in payload["warnings"]))

    def test_invalid_root_returns_stable_error_shape(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)

        payload, exit_code = collect_context.collect_context(root / "missing")

        self.assertEqual(2, exit_code)
        self.assertEqual(
            {
                "project",
                "preferences",
                "git",
                "context_files",
                "related_files",
                "warnings",
                "errors",
            },
            set(payload),
        )
        self.assertTrue(payload["errors"])


if __name__ == "__main__":
    unittest.main()
