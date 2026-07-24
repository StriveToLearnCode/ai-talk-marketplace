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
FEEDBACK_ENVELOPE = SKILL / "references" / "feedback-envelope.md"
EXECUTION_PROTOCOLS = SKILL / "references" / "execution-protocols.md"
FEEDBACK_CASES = SKILL / "tests" / "feedback-cases.json"
RUNTIME_UI_CASES = SKILL / "tests" / "runtime-ui-diagnosis-cases.json"
GATE_CASES = SKILL / "tests" / "gate-cases.json"
AI_TALK_AGENT = SKILL / "agents" / "openai.yaml"
UI_SELF_CHECK_AGENT = PLUGIN / "skills" / "ui-self-check" / "agents" / "openai.yaml"
STRICT_MODE_TEMPLATE = PLUGIN / "assets" / "strict-mode.AGENTS.md"
STRICT_MODE_INSTALLER = PLUGIN / "scripts" / "install-strict-mode.mjs"
SCOPE_GUARD = PLUGIN / "scripts" / "scope-guard.mjs"

CONTRACT_KEYS = [
    "schema_version", "result", "mode", "authorization", "source_request",
    "next_skill", "entry_point", "target_refs", "control_point", "write_scope",
    "excluded_scope", "scope_policy", "behavior", "evidence", "verification",
    "open_questions",
]
RESULTS = {"skip", "handoff", "clarify"}
MODES = {"modify_and_verify", "inspect_only", "plan_only", "plan_then_execute"}
SCOPE_POLICIES = {"discover", "bounded"}
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
        self.assertIn("default_prompt: \"使用 $ai-talk", ai_talk_agent)
        self.assertIn("default_prompt: \"使用 $ui-self-check", ui_self_check_agent)

        skill = (SKILL / "SKILL.md").read_text()
        for text in (
            "name: ai-talk",
            "AI Talk 风险分级门禁",
            "RequirementContract 1.3",
            "modify_and_verify + authorized",
            "对比正常与异常对象报告行为缺陷",
            "无契约 Fast Path",
            "不读取任何 reference",
            "不选择 `next_skill`",
            "不调用反馈 reporter",
            "一次只问一个会改变",
            "默认自动模式依赖 description 隐式匹配",
            "同一条消息只判定一次",
            "非研发消息不适用 AI Talk",
            "引用内容本身不构成当前修改授权",
            "`evidence_update`",
            "`behavior_report`",
            "`target_state: resolved`",
            "指代词本身不触发契约",
            "references/execution-protocols.md",
            "Stop Hook 或宿主适配器负责",
        ):
            self.assertIn(text, skill)
        self.assertLessEqual(len(skill.splitlines()), 70)
        self.assertNotIn("report-feedback.mjs --should-ask", skill)
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
        self.assertTrue(FEEDBACK_ENVELOPE.is_file())
        self.assertTrue(EXECUTION_PROTOCOLS.is_file())
        self.assertTrue(STRICT_MODE_TEMPLATE.is_file())
        self.assertTrue(STRICT_MODE_INSTALLER.is_file())
        self.assertTrue(SCOPE_GUARD.is_file())
        strict_mode = STRICT_MODE_TEMPLATE.read_text()
        self.assertIn("$ai-talk:ai-talk", strict_mode)
        self.assertIn("exactly once", strict_mode)
        self.assertIn("non-development conversation", strict_mode)
        self.assertIn("TaskHandoff 1.1", LEGACY_ROUTER.read_text())
        self.assertIn("legacy CLI 路由器的冻结实现标准", SPEC.read_text())

    def test_invoked_gate_releases_or_holds_once(self):
        cases = json.loads(GATE_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "non-development-not-invoked",
            "development-status-release",
            "clear-development-release",
            "resolved-defect-report-fast-path",
            "hard-ambiguity-hold",
            "ambiguous-screenshot-deictic-contract",
            "bare-log-resumes-previous-diagnosis",
            "log-fix-with-acceptance-contract",
            "ui-check-release-to-downstream",
            "quoted-transcript-releases-without-task",
            "direct-exclusion-before-quoted-context",
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
        self.assertEqual(clear["expected_route"], "fast_path")
        self.assertIsNone(clear["expected_contract"])
        self.assertIsNone(clear["expected_next_skill"])
        self.assertEqual(clear["expected_reference_reads"], 0)
        self.assertEqual(clear["expected_repository_reads_by_gate"], 0)
        self.assertEqual(clear["expected_reporter_calls"], 0)

        defect = by_id["resolved-defect-report-fast-path"]
        self.assertEqual(defect["stable_bindings"], ["file_line", "business_id"])
        self.assertEqual(defect["expected_internal"], {
            "intent": "behavior_report",
            "authorization": "authorized",
            "target_state": "resolved",
            "scope_state": "local",
            "route": "fast_path",
        })
        self.assertIsNone(defect["expected_contract"])

        blocked = by_id["hard-ambiguity-hold"]
        self.assertEqual(blocked["expected_gate"], "hold")
        self.assertEqual(blocked["expected_result"], "clarify")
        self.assertEqual(blocked["expected_question_count"], 1)

        screenshot = by_id["ambiguous-screenshot-deictic-contract"]
        self.assertEqual(screenshot["expected_route"], "contract_path")
        self.assertEqual(screenshot["expected_target_state"], "unresolved")
        self.assertEqual(screenshot["expected_question_count"], 1)

        bare_log = by_id["bare-log-resumes-previous-diagnosis"]
        self.assertEqual(bare_log["expected_message_type"], "evidence_update")
        self.assertEqual(bare_log["expected_continuation"], "resume_same_task")
        self.assertFalse(bare_log["expected_new_task"])
        self.assertFalse(bare_log["expected_new_behavior_authorization"])
        self.assertFalse(bare_log["expected_direct_behavior_change"])

        requested_log_fix = by_id["log-fix-with-acceptance-contract"]
        self.assertEqual(requested_log_fix["expected_mode"], "modify_and_verify")
        self.assertEqual(requested_log_fix["expected_authorization"], "authorized")
        self.assertEqual(requested_log_fix["expected_log_handling"], "promoted_evidence")
        self.assertEqual(len(requested_log_fix["expected_verification"]), 2)

        ui_check = by_id["ui-check-release-to-downstream"]
        self.assertEqual(ui_check["expected_gate"], "release")
        self.assertEqual(ui_check["expected_next_skill"], "ui-self-check")
        self.assertFalse(ui_check["downstream_implicit_invocation"])
        quoted = by_id["quoted-transcript-releases-without-task"]
        self.assertIsNone(quoted["expected_contract"])
        self.assertTrue(quoted["must_not_treat_quoted_commands_as_authorization"])
        direct_constraint = by_id["direct-exclusion-before-quoted-context"]
        self.assertEqual(
            direct_constraint["expected_pending_constraint"]["excluded_scope"],
            ["**/core/**"],
        )
        self.assertTrue(direct_constraint["must_not_start_implementation"])
        self.assertTrue(all(
            case["evaluation_count"] == (0 if case["id"] == "non-development-not-invoked" else 1)
            for case in cases
        ))

    def test_requirement_contract_freezes_compact_shape_and_routing(self):
        reference = REQUIREMENT_CONTRACT.read_text()
        for key in CONTRACT_KEYS:
            self.assertIn(f"{key}:", reference)
        for value in RESULTS | MODES | SCOPE_POLICIES:
            self.assertIn(f"`{value}`", reference)
        for instruction in (
            "A desired behavior is an implementation request",
            "Never copy `entry_point` into it as a fallback",
            "A visual target is not automatically a code control point or writable file",
            "File names, symbols, repository conventions, and reusable implementations",
            "Ask one decisive question",
            "Include success or failure branches only when evidence shows",
            "Excluded scope always wins over writable scope",
            "Keep `next_skill` `null` by default",
        ):
            self.assertIn(instruction, reference)

        execution = EXECUTION_PROTOCOLS.read_text()
        for instruction in (
            "scripts/scope-guard.mjs snapshot",
            "Never copy the entry point as a fallback",
            "runtime_unverified",
            "Include success and failure branches only when",
            "`pass_through`",
            "`revise`",
            "`new_task`",
            "`evidence_update`",
            "`behavior_report`",
            "Never create a new task or authorize a new",
        ):
            self.assertIn(instruction, execution)

    def test_contract_cases_cover_authorization_control_points_and_continuation(self):
        cases = json.loads(REQUIREMENT_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "implicit-modification-skip",
            "unconditional-tab-audio-verification",
            "entry-and-control-point-handoff",
            "single-file-excluded-scope-direct-execution",
            "one-hard-question",
            "diagnosis-inspect-only",
            "diagnosis-execute",
            "hard-blocker-survives-execute",
            "implementation-neutral-context-passes-through",
            "scope-addition-revises-active-contract",
            "excluded-scope-revises-active-contract",
            "bounded-scope-expansion-remains-blocked",
            "timing-correction-revises-active-contract",
            "independent-objective-starts-new-contract",
        })

        implicit = by_id["implicit-modification-skip"]["expected_contract"]
        self.assertEqual(list(implicit), CONTRACT_KEYS)
        self.assertEqual(implicit["schema_version"], "1.3")
        self.assertEqual(implicit["result"], "skip")
        self.assertEqual(implicit["mode"], "modify_and_verify")
        self.assertEqual(implicit["authorization"], "authorized")
        self.assertEqual(implicit["target_refs"], [])
        self.assertEqual(implicit["excluded_scope"], [])
        self.assertEqual(implicit["scope_policy"], "discover")
        self.assertEqual(implicit["open_questions"], [])

        tab_audio_case = by_id["unconditional-tab-audio-verification"]
        tab_audio = tab_audio_case["expected_contract"]
        self.assertEqual(list(tab_audio), CONTRACT_KEYS)
        self.assertEqual(tab_audio["mode"], "modify_and_verify")
        self.assertEqual(tab_audio["authorization"], "authorized")
        self.assertIsNone(tab_audio["next_skill"])
        verification = " ".join(tab_audio["verification"])
        for forbidden in tab_audio_case["verification_must_not_contain"]:
            self.assertNotIn(forbidden, verification)
        self.assertTrue(any("once" in item for item in tab_audio["verification"]))
        self.assertTrue(any("selection and navigation" in item for item in tab_audio["verification"]))

        handoff = by_id["entry-and-control-point-handoff"]
        self.assertNotEqual(handoff["entry_point"]["symbol"], handoff["control_point"]["symbol"])
        self.assertEqual(handoff["write_scope"], ["mods/tab3/mod2.vue"])
        self.assertTrue(handoff["must_not_copy_entry_to_control"])

        direct = by_id["single-file-excluded-scope-direct-execution"]
        direct_contract = direct["expected_contract"]
        self.assertEqual(list(direct_contract), CONTRACT_KEYS)
        self.assertIsNone(direct_contract["next_skill"])
        self.assertEqual(direct_contract["scope_policy"], "bounded")
        self.assertEqual(direct_contract["excluded_scope"], ["**/core/**"])
        self.assertTrue(direct["must_not_route_to_gen_code"])

        diagnosis = by_id["diagnosis-inspect-only"]
        self.assertEqual(diagnosis["expected_mode"], "inspect_only")
        self.assertEqual(diagnosis["expected_authorization"], "inspect_only")
        self.assertIsNone(diagnosis["expected_next_skill"])
        self.assertEqual(by_id["one-hard-question"]["expected_question_count"], 1)

        continuation = by_id["diagnosis-execute"]
        self.assertEqual(continuation["expected_transition"], {
            "mode": "modify_and_verify",
            "authorization": "authorized",
            "next_skill": None,
        })
        self.assertIn("target_refs", continuation["preserve"])
        self.assertTrue(continuation["must_not_ask"])
        blocker = by_id["hard-blocker-survives-execute"]
        self.assertEqual(blocker["expected_result"], "clarify")
        self.assertEqual(blocker["expected_questions"], blocker["open_questions"])

        passthrough = by_id["implementation-neutral-context-passes-through"]
        self.assertEqual(passthrough["expected_continuation"], "pass_through")
        self.assertFalse(passthrough["expected_contract_revision"])
        self.assertTrue(passthrough["must_pass_unchanged"])

        scope_revision = by_id["scope-addition-revises-active-contract"]
        self.assertEqual(scope_revision["expected_continuation"], "revise")
        self.assertTrue(scope_revision["expected_contract_revision"])
        self.assertTrue(scope_revision["must_not_pass_unchanged"])

        excluded_revision = by_id["excluded-scope-revises-active-contract"]
        self.assertEqual(excluded_revision["expected_continuation"], "revise")
        self.assertEqual(excluded_revision["expected_excluded_scope"], ["**/core/**"])
        bounded = by_id["bounded-scope-expansion-remains-blocked"]
        self.assertEqual(bounded["expected_result"], "clarify")
        self.assertEqual(bounded["expected_questions"], bounded["open_questions"])

        timing_revision = by_id["timing-correction-revises-active-contract"]
        self.assertEqual(timing_revision["expected_continuation"], "revise")
        self.assertEqual(timing_revision["expected_behavior_order"], [
            "animation completed", "play audio",
        ])

        new_task = by_id["independent-objective-starts-new-contract"]
        self.assertEqual(new_task["expected_continuation"], "new_task")
        self.assertTrue(new_task["expected_new_contract"])
        self.assertTrue(new_task["must_not_merge_previous_write_scope"])

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

    def test_feedback_sidecar_asks_once_without_changing_requirement_contract(self):
        reference = FEEDBACK_ENVELOPE.read_text()
        for text in (
            "FeedbackEnvelope 1.0",
            "must not create or revise a requirement contract",
            "<!-- ai-talk-feedback:eligible -->",
            "<!-- ai-talk-feedback:asked -->",
            "AI_TALK_FEEDBACK_CONSENT=1",
            "Never include source code, diffs, commands, tool output",
            "Fast Path tasks never run the reporter",
            "`Stop` Hook owns eligibility checks",
        ):
            self.assertIn(text, reference)

        cases = json.loads(FEEDBACK_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "terminal-task-asks-once",
            "unsampled-completion-does-not-ask",
            "missing-endpoint-does-not-ask",
            "status-does-not-ask",
            "clarify-does-not-ask",
            "fast-path-does-not-run-reporter",
            "contract-runtime-metadata-required",
            "positive-feedback-report",
            "negative-feedback-report",
            "feedback-opt-out",
        })
        terminal = by_id["terminal-task-asks-once"]
        self.assertTrue(terminal["expected_feedback_eligible"])
        self.assertTrue(terminal["eligibility_result"]["ask"])
        self.assertEqual(terminal["expected_question_count"], 1)
        self.assertFalse(by_id["unsampled-completion-does-not-ask"]["eligibility_result"]["ask"])
        self.assertEqual(by_id["missing-endpoint-does-not-ask"]["expected_question_count"], 0)
        self.assertEqual(by_id["status-does-not-ask"]["expected_question_count"], 0)
        self.assertEqual(by_id["clarify-does-not-ask"]["expected_question_count"], 0)
        self.assertEqual(by_id["fast-path-does-not-run-reporter"]["expected_reporter_calls"], 0)
        self.assertEqual(by_id["contract-runtime-metadata-required"]["expected_reporter_calls"], 0)
        self.assertIsNone(by_id["positive-feedback-report"]["expected_contract"])
        self.assertIsNone(by_id["negative-feedback-report"]["expected_contract"])
        self.assertEqual(by_id["feedback-opt-out"]["expected_preference"], "off")

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
