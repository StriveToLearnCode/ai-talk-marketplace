import json
import unittest
from pathlib import Path


SKILL = Path(__file__).resolve().parents[1]
PLUGIN = SKILL.parents[1]
ROUTER = SKILL / "scripts/route-company-skills"
SPEC = PLUGIN.parents[1] / "docs" / "AI_TALK_V1_SPEC.md"
LEGACY_ROUTER = SKILL / "references" / "legacy-router.md"
REQUIREMENT_CONTRACT = SKILL / "references" / "requirement-contract.md"
REQUIREMENT_CASES = SKILL / "tests" / "requirement-contract-cases.json"
TARGET_BINDING = SKILL / "references" / "target-binding.md"
TARGET_CASES = SKILL / "tests" / "target-binding-cases.json"
RUNTIME_UI_CASES = SKILL / "tests" / "runtime-ui-diagnosis-cases.json"
GATE_CASES = SKILL / "tests" / "gate-cases.json"
AI_TALK_AGENT = SKILL / "agents" / "openai.yaml"
UI_SELF_CHECK_AGENT = PLUGIN / "skills" / "ui-self-check" / "agents" / "openai.yaml"

CONTRACT_KEYS = [
    "schema_version", "result", "mode", "authorization", "source_request",
    "next_skill", "entry_point", "target_refs", "control_point", "write_scope",
    "behavior", "evidence", "verification", "open_questions",
]
RESULTS = {"skip", "handoff", "clarify"}
MODES = {"modify_and_verify", "inspect_only", "plan_only", "plan_then_execute"}
TARGET_REF_KEYS = ["id", "label", "source", "attachment", "browser", "dom"]
TARGET_SOURCES = {"screenshot_annotation", "dom_selection", "browser_context"}


class Contract(unittest.TestCase):
    def test_plugin_manifest_and_skill_are_valid(self):
        manifest = json.loads((PLUGIN / ".codex-plugin/plugin.json").read_text())
        self.assertTrue(manifest["name"])
        self.assertLessEqual(len(manifest["interface"]["defaultPrompt"]), 3)
        self.assertTrue(all(
            len(prompt) <= 128 for prompt in manifest["interface"]["defaultPrompt"]
        ))
        self.assertTrue(all(
            "$" not in prompt for prompt in manifest["interface"]["defaultPrompt"]
        ))

        ai_talk_agent = AI_TALK_AGENT.read_text()
        ui_self_check_agent = UI_SELF_CHECK_AGENT.read_text()
        self.assertIn("allow_implicit_invocation: true", ai_talk_agent)
        self.assertIn("allow_implicit_invocation: false", ui_self_check_agent)
        self.assertNotIn("default_prompt: \"使用 $", ai_talk_agent)
        self.assertNotIn("default_prompt: \"使用 $", ui_self_check_agent)

        skill = (SKILL / "SKILL.md").read_text()
        for text in (
            "name: ai-talk",
            "AI Talk 任务编译器",
            "RequirementContract 1.2",
            "modify_and_verify + authorized",
            "用户描述新增或改变后的系统行为即构成修改意图",
            "`entry_point`",
            "`target_refs`",
            "`control_point`",
            "一次只问一个决定性问题",
            "普通代码修改优先 `gen-code`",
            "优先直接调用下游 Skill",
            "研发对话中的每条用户消息都先经过门禁",
            "同一条消息只判定一次",
            "非研发对话不触发 AI Talk",
        ):
            self.assertIn(text, skill)
        for obsolete in (
            "统一等待“执行”",
            "不选择、推荐或调用代码 Skill",
            "澄清模式不读取或检索仓库",
            "ready_to_execute + pending",
        ):
            self.assertNotIn(obsolete, skill)

        self.assertTrue(LEGACY_ROUTER.is_file())
        self.assertTrue(REQUIREMENT_CONTRACT.is_file())
        self.assertTrue(TARGET_BINDING.is_file())
        self.assertIn("TaskHandoff 1.1", LEGACY_ROUTER.read_text())
        self.assertIn("legacy CLI 路由器的冻结实现标准", SPEC.read_text())

    def test_every_message_gate_releases_or_holds_once(self):
        cases = json.loads(GATE_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "non-development-not-invoked",
            "development-status-release",
            "clear-development-release",
            "hard-ambiguity-hold",
            "ui-check-release-to-downstream",
        })

        non_development = by_id["non-development-not-invoked"]
        self.assertEqual(non_development["expected_gate"], "not_applicable")
        self.assertEqual(non_development["evaluation_count"], 0)

        status = by_id["development-status-release"]
        self.assertEqual(status["expected_gate"], "release")
        self.assertIsNone(status["expected_contract"])
        self.assertTrue(status["must_pass_unchanged"])

        clear = by_id["clear-development-release"]
        self.assertEqual(clear["expected_gate"], "release")
        self.assertEqual(clear["expected_result"], "skip")

        blocked = by_id["hard-ambiguity-hold"]
        self.assertEqual(blocked["expected_gate"], "hold")
        self.assertEqual(blocked["expected_result"], "clarify")
        self.assertEqual(blocked["expected_question_count"], 1)

        ui_check = by_id["ui-check-release-to-downstream"]
        self.assertEqual(ui_check["expected_gate"], "release")
        self.assertEqual(ui_check["expected_next_skill"], "ui-self-check")
        self.assertFalse(ui_check["downstream_implicit_invocation"])
        self.assertTrue(all(
            case["evaluation_count"] == (0 if case["id"] == "non-development-not-invoked" else 1)
            for case in cases
        ))

    def test_requirement_contract_freezes_compact_shape_and_routing(self):
        reference = REQUIREMENT_CONTRACT.read_text()
        for key in CONTRACT_KEYS:
            self.assertIn(f"{key}:", reference)
        for value in RESULTS | MODES:
            self.assertIn(f"`{value}`", reference)
        for instruction in (
            "A desired behavior is an implementation request",
            "Never copy `entry_point` into it as a fallback",
            "A visual target is not automatically a code control point or writable file",
            "File names, symbols, repository conventions, and reusable implementations",
            "Ask one decisive question",
            "switch to `modify_and_verify + authorized`",
        ):
            self.assertIn(instruction, reference)

    def test_contract_cases_cover_authorization_control_points_and_continuation(self):
        cases = json.loads(REQUIREMENT_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "implicit-modification-skip",
            "entry-and-control-point-handoff",
            "one-hard-question",
            "diagnosis-inspect-only",
            "diagnosis-execute",
            "hard-blocker-survives-execute",
        })

        implicit = by_id["implicit-modification-skip"]["expected_contract"]
        self.assertEqual(list(implicit), CONTRACT_KEYS)
        self.assertEqual(implicit["schema_version"], "1.2")
        self.assertEqual(implicit["result"], "skip")
        self.assertEqual(implicit["mode"], "modify_and_verify")
        self.assertEqual(implicit["authorization"], "authorized")
        self.assertEqual(implicit["target_refs"], [])
        self.assertEqual(implicit["open_questions"], [])

        handoff = by_id["entry-and-control-point-handoff"]
        self.assertNotEqual(handoff["entry_point"]["symbol"], handoff["control_point"]["symbol"])
        self.assertEqual(handoff["write_scope"], ["mods/tab3/mod2.vue"])
        self.assertTrue(handoff["must_not_copy_entry_to_control"])

        diagnosis = by_id["diagnosis-inspect-only"]
        self.assertEqual(diagnosis["expected_mode"], "inspect_only")
        self.assertEqual(diagnosis["expected_authorization"], "inspect_only")
        self.assertIsNone(diagnosis["expected_next_skill"])
        self.assertEqual(by_id["one-hard-question"]["expected_question_count"], 1)

        continuation = by_id["diagnosis-execute"]
        self.assertEqual(continuation["expected_transition"], {
            "mode": "modify_and_verify",
            "authorization": "authorized",
            "next_skill": "gen-code",
        })
        self.assertIn("target_refs", continuation["preserve"])
        self.assertTrue(continuation["must_not_ask"])
        blocker = by_id["hard-blocker-survives-execute"]
        self.assertEqual(blocker["expected_result"], "clarify")
        self.assertEqual(blocker["expected_questions"], blocker["open_questions"])

    def test_p1_target_binding_cases_freeze_visual_context(self):
        reference = TARGET_BINDING.read_text()
        for text in (
            "screenshot_annotation", "dom_selection", "browser_context",
            "normalized ratio bounds", "1-based `match_ordinal`",
            "Never use a dynamic class", "Remove auth tokens",
            "never silently reuse another task's tab",
        ):
            self.assertIn(text, reference)

        cases = json.loads(TARGET_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "two-screenshot-annotations",
            "selected-second-avatar",
            "current-browser-state",
            "unresolved-deictic-target",
            "stale-browser-context",
            "execute-preserves-target-refs",
        })

        screenshot_refs = by_id["two-screenshot-annotations"]["expected_refs"]
        self.assertEqual([ref["id"] for ref in screenshot_refs], ["target_1", "target_2"])
        self.assertTrue(all(ref["source"] == "screenshot_annotation" for ref in screenshot_refs))
        for ref in screenshot_refs:
            self.assertEqual(list(ref), TARGET_REF_KEYS)
            self.assertIsNone(ref["browser"])
            self.assertIsNone(ref["dom"])
            bounds = ref["attachment"]["bounds"]
            self.assertEqual(bounds["unit"], "ratio")
            self.assertTrue(all(0 <= bounds[key] <= 1 for key in ("x", "y", "width", "height")))

        dom_ref = by_id["selected-second-avatar"]["expected_refs"][0]
        self.assertEqual(dom_ref["source"], "dom_selection")
        self.assertIn(dom_ref["source"], TARGET_SOURCES)
        self.assertEqual(dom_ref["dom"]["match_ordinal"], 2)
        self.assertNotIn("nth-child", dom_ref["dom"]["selector"])
        self.assertEqual(dom_ref["browser"]["route"], "/activity")

        browser_ref = by_id["current-browser-state"]["expected_refs"][0]
        self.assertEqual(browser_ref["source"], "browser_context")
        self.assertIsNone(browser_ref["dom"])
        self.assertTrue(browser_ref["browser"]["page_state"])

        unresolved = by_id["unresolved-deictic-target"]
        self.assertEqual(unresolved["expected_result"], "clarify")
        self.assertEqual(unresolved["expected_refs"], [])
        stale = by_id["stale-browser-context"]
        self.assertNotEqual(stale["active_url"], stale["candidate_url"])
        self.assertEqual(stale["expected_refs"], [])
        execute = by_id["execute-preserves-target-refs"]
        self.assertIn("target_refs", execute["preserve"])
        self.assertTrue(execute["must_not_ask"])

    def test_runtime_ui_evidence_cases_remain_available(self):
        cases = json.loads(RUNTIME_UI_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "last-reward-button-missing",
            "last-reward-condition-false",
            "button-dom-occluded",
            "button-resource-failed",
            "not-last-reward",
            "browser-unavailable",
        })
        self.assertEqual(by_id["last-reward-button-missing"]["expected_checks"], [
            "page_state",
            "render_condition",
            "dom_presence",
            "geometry_and_occlusion",
            "resource_load",
            "screenshot",
        ])
        self.assertEqual(
            by_id["browser-unavailable"]["expected_outcome"],
            "runtime_unverified",
        )

    def test_router_is_split_by_responsibility(self):
        expected = {
            "parse-args.mjs",
            "discover-skills.mjs",
            "classify-request.mjs",
            "rank-skills.mjs",
            "collect-context.mjs",
            "build-execution-prompt.mjs",
            "rules.mjs",
        }
        self.assertEqual(expected, {path.name for path in ROUTER.glob("*.mjs")})

    def test_legacy_router_keeps_bounded_one_way_pipeline(self):
        classifier = (ROUTER / "classify-request.mjs").read_text()
        route = (SKILL / "scripts" / "route-company-skills.mjs").read_text()
        formatter = (ROUTER / "build-execution-prompt.mjs").read_text()
        collector = (ROUTER / "collect-context.mjs").read_text()
        self.assertIn("buildRetrievalRequest", classifier)
        self.assertIn("buildRetrievalRequest(understanding)", route)
        self.assertIn("validateTaskHandoff(executionPlan)", formatter)
        self.assertNotIn("classifyRequest", formatter)
        for text in (
            "node_modules", "MAX_CONTEXT_FILES_READ", "MAX_SIMILAR_IMPLEMENTATIONS",
            "EARLY_STOP_RETRIEVAL_ENTRIES", "nearestAgentsFile", "safeFile",
        ):
            self.assertIn(text, collector)


if __name__ == "__main__":
    unittest.main()
