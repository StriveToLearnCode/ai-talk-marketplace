from __future__ import annotations

import importlib.util
import json
import shutil
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

        self.assertNotIn("default_mode", values)
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

        self.assertNotIn("default_mode", values)
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

    def test_required_inputs_map_to_first_version_scenes_and_modes(self) -> None:
        cases = [
            ("轮播图偶尔不切换，先帮我看看", ["bug_debugging"], "analyze"),
            ("根据截图还原这个活动页面", ["ui_reconstruction"], "plan"),
            ("活动从俄语迁移成法语，看看还有哪些没替换", ["localization_migration"], "analyze"),
            ("根据接口文档接入奖励接口", ["api_integration"], "modify_and_verify"),
            ("帮我开发一个独立榜单页面", ["feature_development"], "modify_and_verify"),
        ]

        for query, expected_scenes, expected_mode in cases:
            with self.subTest(query=query):
                task = collect_context.infer_task(query, "prepare", None)
                self.assertTrue(set(expected_scenes).issubset(task["scenes"]))
                self.assertEqual(expected_mode, task["handling_mode"])
                self.assertEqual("ready_for_review", task["status"])
                self.assertTrue(task["requires_user_review"])
                self.assertFalse(task["handoff_to_codex_allowed"])
                self.assertFalse(task["ai_talk_may_modify_code"])

    def test_screenshot_development_preserves_both_scenes(self) -> None:
        task = collect_context.infer_task(
            "帮我根据截图开发一个独立榜单页面", "prepare", None
        )

        self.assertIn("ui_reconstruction", task["scenes"])
        self.assertIn("feature_development", task["scenes"])
        self.assertEqual("modify_and_verify", task["handling_mode"])

    def test_simple_analysis_bypasses_confirmation_card(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)

        payload, exit_code = collect_context.collect_context(
            root,
            query="轮播图偶尔不切换，先帮我看看，不要修改代码",
            include_user_sources=False,
        )

        self.assertEqual(0, exit_code)
        confirmation = payload["task_context"]["confirmation"]
        self.assertEqual("ready", confirmation["state"])
        self.assertEqual("bypass", confirmation["presentation"])
        self.assertFalse(payload["task_context"]["task"]["requires_user_review"])
        self.assertTrue(payload["task_context"]["task"]["handoff_to_codex_allowed"])

    def test_multi_scene_task_uses_full_confirmation_card(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)

        payload, exit_code = collect_context.collect_context(
            root,
            query="帮我根据截图开发一个独立榜单页面",
            include_user_sources=False,
        )

        self.assertEqual(0, exit_code)
        confirmation = payload["confirmation"]
        self.assertEqual("ready", confirmation["state"])
        self.assertEqual("card", confirmation["presentation"])
        for key in (
            "task_type",
            "execution",
            "goal",
            "scope",
            "internal_skills",
            "reusable_capabilities",
            "constraints",
            "risks",
            "unconfirmed",
            "task_prompt",
        ):
            self.assertIn(key, confirmation)
        self.assertTrue(confirmation["actions"]["start_execution"]["enabled"])
        self.assertFalse(confirmation["actions"]["insert_into_composer"]["auto_send"])

    def test_missing_query_is_blocked_with_one_question(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)

        payload, exit_code = collect_context.collect_context(
            root, query=None, include_user_sources=False
        )

        self.assertEqual(0, exit_code)
        confirmation = payload["confirmation"]
        self.assertEqual("blocked", confirmation["state"])
        self.assertEqual("card", confirmation["presentation"])
        self.assertTrue(confirmation["blocking_question"])
        self.assertFalse(confirmation["actions"]["start_execution"]["enabled"])

    def test_scope_expansion_is_highlighted_for_confirmation(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)

        payload, exit_code = collect_context.collect_context(
            root,
            query="把这个改动扩大到整个项目的所有页面",
            include_user_sources=False,
        )

        self.assertEqual(0, exit_code)
        confirmation = payload["confirmation"]
        self.assertEqual("needs_confirmation", confirmation["state"])
        self.assertEqual("card", confirmation["presentation"])
        self.assertTrue(confirmation["decision_requirements"]["scope_risk"])
        self.assertTrue(any("范围扩大" in item for item in confirmation["risks"]))

    def test_task_state_transitions_require_explicit_actions(self) -> None:
        query = "帮我开发一个独立榜单页面"

        prepared = collect_context.infer_task(query, "prepare", None)
        confirmed = collect_context.infer_task(query, "confirm", None)
        revise = collect_context.infer_task(query, "revise", None)
        regenerated = collect_context.infer_task(query, "regenerate", None)
        draft = collect_context.infer_task(query, "prepare", "榜单数据来自哪个接口？")

        self.assertEqual("ready_for_review", prepared["status"])
        self.assertEqual("confirmed", confirmed["status"])
        self.assertTrue(confirmed["confirmed_by_user"])
        self.assertTrue(confirmed["handoff_to_codex_allowed"])
        self.assertEqual("revise", revise["status"])
        self.assertEqual("ready_for_review", regenerated["status"])
        self.assertEqual("draft", draft["status"])
        self.assertTrue(all(item["requires_user_review"] for item in (prepared, confirmed, revise, regenerated, draft)))

    def test_project_reuse_rule_conflict_keeps_task_in_draft(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        (root / "AGENTS.md").write_text(
            "# Project Rules\n\n优先复用项目已有组件。\n", encoding="utf-8"
        )

        payload, exit_code = collect_context.collect_context(
            root,
            query="不要复用现有组件，重新实现整个榜单",
            include_user_sources=False,
        )

        self.assertEqual(0, exit_code)
        task = payload["task_context"]["task"]
        self.assertEqual("draft", task["status"])
        self.assertTrue(task["conflicts"])
        self.assertTrue(task["conflicts"][0]["requires_user_choice"])
        self.assertFalse(task["handoff_to_codex_allowed"])

    def test_task_output_contract_stops_after_review_ready(self) -> None:
        task = collect_context.infer_task("奖励接口联调", "prepare", None)

        self.assertTrue(task["output_contract"]["stop_after_ready_for_review"])
        self.assertIn("handling_mode", task["output_contract"]["summary_fields"])
        self.assertIn("automatic_capabilities", task["output_contract"]["summary_fields"])
        self.assertIn("choice_required", task["output_contract"]["summary_fields"])
        self.assertIn("acceptance_requirements", task["output_contract"]["final_task_fields"])

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

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for capability indexing")
    def test_query_merges_capabilities_into_task_context(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        skill = root / ".agents" / "skills" / "api-integration"
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text(
            "---\n"
            "name: api-integration\n"
            "description: 联调奖励接口并复用现有请求工具。\n"
            "---\n",
            encoding="utf-8",
        )

        payload, exit_code = collect_context.collect_context(
            root,
            query="联调奖励接口并复用现有能力",
            include_user_sources=False,
        )

        self.assertEqual(0, exit_code)
        self.assertEqual(5, payload["schema_version"])
        self.assertEqual("ready", payload["capabilities"]["status"])
        self.assertEqual(
            "api-integration", payload["capabilities"]["selected"][0]["name"]
        )
        self.assertEqual(payload["project"], payload["task_context"]["project"])
        self.assertEqual(
            payload["capabilities"]["selected"],
            payload["task_context"]["capabilities"]["selected"],
        )
        self.assertEqual("ready_for_review", payload["task_context"]["task"]["status"])
        selected = payload["capabilities"]["selected"][0]
        for key in (
            "type",
            "match_reason",
            "discovery_status",
            "pending_validation",
            "potential_risks",
            "user_choice",
            "execution_validation",
        ):
            self.assertIn(key, selected)
        self.assertEqual("auto_selected", selected["selection_status"])
        self.assertEqual("apply", selected["usage_preference"])
        self.assertEqual("ai_talk", selected["selection_source"])
        self.assertEqual(
            payload["capabilities"]["automatic"],
            payload["task_context"]["capabilities"]["automatic"],
        )
        self.assertEqual([], payload["task_context"]["capabilities"]["choice_required"])
        self.assertFalse(payload["task_context"]["task"]["awaiting_capability_choice"])
        self.assertNotIn("candidates", payload["task_context"]["capabilities"])
        self.assertEqual(payload["confirmation"], payload["task_context"]["confirmation"])
        self.assertEqual("ready", payload["confirmation"]["state"])

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for capability indexing")
    def test_unique_project_component_is_automatic_and_does_not_block_review(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        component = root / "src" / "components"
        component.mkdir(parents=True)
        (component / "RankCard.vue").write_text(
            "<template><article>Rank card</article></template>\n", encoding="utf-8"
        )

        payload, exit_code = collect_context.collect_context(
            root,
            query="RankCard component",
            include_user_sources=False,
        )

        self.assertEqual(0, exit_code)
        automatic = payload["task_context"]["capabilities"]["automatic"]
        self.assertEqual(1, len(automatic))
        self.assertEqual("component", automatic[0]["type"])
        self.assertEqual("prefer_reuse", automatic[0]["usage_preference"])
        self.assertEqual("ready_for_review", payload["task_context"]["task"]["status"])
        self.assertFalse(payload["task_context"]["task"]["awaiting_capability_choice"])

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for capability indexing")
    def test_shared_component_choice_blocks_then_returns_to_review(self) -> None:
        project_temporary, project_root = self.make_root()
        company_temporary, company_root = self.make_root()
        self.addCleanup(project_temporary.cleanup)
        self.addCleanup(company_temporary.cleanup)
        component = company_root / "components"
        component.mkdir(parents=True)
        (component / "SharedRankDialog.vue").write_text(
            "<template><dialog>Shared rank</dialog></template>\n", encoding="utf-8"
        )
        source_roots = [f"frontend-platform={company_root}"]

        pending, _ = collect_context.collect_context(
            project_root,
            query="SharedRankDialog component",
            source_roots=source_roots,
            include_user_sources=False,
            task_action="confirm",
        )
        candidate = pending["task_context"]["capabilities"]["choice_required"][0]
        self.assertEqual("draft", pending["task_context"]["task"]["status"])
        self.assertTrue(pending["task_context"]["task"]["awaiting_capability_choice"])
        self.assertFalse(pending["task_context"]["task"]["confirmed_by_user"])
        self.assertEqual("needs_confirmation", pending["confirmation"]["state"])

        resolved, _ = collect_context.collect_context(
            project_root,
            query="SharedRankDialog component",
            source_roots=source_roots,
            include_user_sources=False,
            capability_choices=[f"{candidate['id']}=prefer_reference"],
        )
        resolved_candidate = resolved["task_context"]["capabilities"]["choice_required"][0]
        self.assertEqual("prefer_reference", resolved_candidate["user_choice"])
        self.assertEqual("user", resolved_candidate["selection_source"])
        self.assertEqual("ready_for_review", resolved["task_context"]["task"]["status"])
        self.assertFalse(resolved["task_context"]["task"]["awaiting_capability_choice"])
        self.assertEqual("ready", resolved["confirmation"]["state"])

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for capability indexing")
    def test_user_capability_choice_does_not_confirm_reuse(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)
        skill = root / "skills" / "rank-skill"
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text(
            "---\nname: rank-skill\ndescription: 榜单页面组件复用规范。\n---\n",
            encoding="utf-8",
        )

        first, _ = collect_context.collect_context(
            root, query="开发榜单页面", include_user_sources=False
        )
        capability_id = first["capabilities"]["selected"][0]["id"]
        payload, _ = collect_context.collect_context(
            root,
            query="开发榜单页面",
            include_user_sources=False,
            capability_choices=[f"{capability_id}=prefer_reuse"],
        )

        selected = payload["capabilities"]["selected"][0]
        self.assertEqual("prefer_reuse", selected["user_choice"])
        self.assertIsNone(selected["execution_validation"])
        self.assertEqual(
            capability_id,
            payload["task_context"]["capabilities"]["user_selections"]["prefer_reuse"][0]["id"],
        )

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for capability indexing")
    def test_same_query_produces_project_specific_task_context(self) -> None:
        first_temporary, first_root = self.make_root()
        second_temporary, second_root = self.make_root()
        self.addCleanup(first_temporary.cleanup)
        self.addCleanup(second_temporary.cleanup)

        first_skill = first_root / "skills" / "reward-api"
        second_skill = second_root / "skills" / "reward-component"
        first_skill.mkdir(parents=True)
        second_skill.mkdir(parents=True)
        (first_skill / "SKILL.md").write_text(
            "---\n"
            "name: reward-api\n"
            "description: 接入奖励接口并复用请求封装。\n"
            "---\n",
            encoding="utf-8",
        )
        (second_skill / "SKILL.md").write_text(
            "---\n"
            "name: reward-component\n"
            "description: 接入奖励接口并复用奖励组件。\n"
            "---\n",
            encoding="utf-8",
        )

        query = "接入奖励接口并复用项目现有能力"
        first_payload, _ = collect_context.collect_context(
            first_root, query=query, include_user_sources=False
        )
        second_payload, _ = collect_context.collect_context(
            second_root, query=query, include_user_sources=False
        )

        self.assertEqual(
            "reward-api",
            first_payload["task_context"]["capabilities"]["selected"][0]["name"],
        )
        self.assertEqual(
            "reward-component",
            second_payload["task_context"]["capabilities"]["selected"][0]["name"],
        )

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for capability indexing")
    def test_unified_context_forwards_company_source_roots(self) -> None:
        project_temporary, project_root = self.make_root()
        company_temporary, company_root = self.make_root()
        self.addCleanup(project_temporary.cleanup)
        self.addCleanup(company_temporary.cleanup)
        skill = company_root / "skills" / "company-api"
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text(
            "---\n"
            "name: company-api\n"
            "description: 公司奖励接口联调规范与请求封装。\n"
            "---\n",
            encoding="utf-8",
        )

        payload, exit_code = collect_context.collect_context(
            project_root,
            query="联调公司奖励接口",
            source_roots=[f"frontend-platform={company_root}"],
            include_user_sources=False,
        )

        self.assertEqual(0, exit_code)
        selected = payload["task_context"]["capabilities"]["selected"][0]
        self.assertEqual("company-api", selected["name"])
        self.assertEqual("frontend-platform", selected["source"])

    def test_capability_failure_degrades_without_failing_context(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)

        with mock.patch.object(
            collect_context,
            "CAPABILITY_INDEX_SCRIPT",
            root / "missing-capability-index.mjs",
        ):
            payload, exit_code = collect_context.collect_context(
                root,
                query="排查问题",
                include_user_sources=False,
            )

        self.assertEqual(0, exit_code)
        self.assertEqual("unavailable", payload["capabilities"]["status"])
        self.assertTrue(any("Capability index" in item for item in payload["warnings"]))

    def test_invalid_root_returns_stable_error_shape(self) -> None:
        temporary, root = self.make_root()
        self.addCleanup(temporary.cleanup)

        payload, exit_code = collect_context.collect_context(root / "missing")

        self.assertEqual(2, exit_code)
        self.assertEqual(
            {
                "schema_version",
                "project",
                "preferences",
                "git",
                "context_files",
                "related_files",
                "task",
                "capability_selections",
                "capabilities",
                "task_context",
                "confirmation",
                "warnings",
                "errors",
            },
            set(payload),
        )
        self.assertTrue(payload["errors"])


if __name__ == "__main__":
    unittest.main()
