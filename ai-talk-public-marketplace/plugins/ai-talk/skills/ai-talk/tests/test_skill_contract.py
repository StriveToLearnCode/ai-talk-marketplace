import json
import unittest
from pathlib import Path


SKILL = Path(__file__).resolve().parents[1]
PLUGIN = SKILL.parents[1]
ROOT = PLUGIN.parents[1]
ROUTER = SKILL / "scripts/route-company-skills"
SPEC = ROOT / "docs" / "AI_TALK_V1_SPEC.md"
ROOT_README = ROOT / "README.md"
USAGE = ROOT / "USAGE.md"
EVALUATION = PLUGIN / "docs" / "evaluation.md"
TRIAL_RECORD = PLUGIN / "docs" / "trial-record.csv"
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
CONTRACT_CHECK = SKILL / "scripts" / "contract-check.mjs"

CONTRACT_KEYS = [
    "schema_version", "result", "mode", "authorization", "source_request",
    "next_skill", "entry_point", "target_refs", "control_point", "write_scope",
    "external_write_scope",
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
        ui_self_check = (PLUGIN / "skills" / "ui-self-check" / "SKILL.md").read_text()
        self.assertIn("从 AI Talk 接收的 `modify_and_verify`", ui_self_check)
        self.assertIn("AI Talk 对账", ui_self_check)
        self.assertIn("不得无 scope guard 证据声称范围校验通过", ui_self_check)

        skill = (SKILL / "SKILL.md").read_text()
        for text in (
            "name: ai-talk",
            "AI Talk 三段式研发协作",
            "开始前锁定需求，执行中守住边界，完成后逐项对账",
            "RequirementContract 1.4",
            "modify_and_verify + authorized",
            "纯缺陷陈述保持只读",
            "无契约 Fast Path",
            "不读取任何 reference",
            "不选择 `next_skill`",
            "不调用 contract checker 或 reporter",
            "一次只问一个会改变",
            "隐式匹配决定是否触发",
            "同一消息只判定一次",
            "非研发消息不适用",
            "引用内容不构成当前修改授权",
            "`evidence_update`",
            "不得要求复述固定句式",
            "`target_state: resolved`",
            "`binding_route: light_binding`",
            "不得为判断 Fast Path 预测文件数",
            "references/execution-protocols.md",
            "Stop Hook 或宿主适配器处理",
            "scripts/contract-check.mjs validate",
            "主流程不读取反馈协议、不调用 reporter",
            "AI Talk · 目标明确，直接执行",
            "AI Talk · 已锁定为只读诊断",
            "AI Talk · 需要锁定一个关键结果",
            "AI Talk 对账",
            "已完成、未完成或未验证",
            "无 scope guard 证据不得声称范围校验通过",
        ):
            self.assertIn(text, skill)
        self.assertLessEqual(len(skill.splitlines()), 70)
        self.assertNotIn("report-feedback.mjs --should-ask", skill)
        self.assertNotIn("references/feedback-envelope.md", skill)
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
        self.assertTrue(CONTRACT_CHECK.is_file())
        strict_mode = STRICT_MODE_TEMPLATE.read_text()
        self.assertIn("$ai-talk:ai-talk", strict_mode)
        self.assertIn("exactly once", strict_mode)
        self.assertIn("non-development conversation", strict_mode)
        self.assertIn("only guarantees invocation coverage", strict_mode)
        self.assertIn("same user-visible lock, boundary", strict_mode)
        self.assertIn("TaskHandoff 1.1", LEGACY_ROUTER.read_text())
        self.assertIn("legacy CLI 路由器的冻结实现标准", SPEC.read_text())

        positioning = "开始前锁定需求，执行中守住边界，完成后逐项对账"
        self.assertIn(positioning, ROOT_README.read_text())
        self.assertIn(positioning, USAGE.read_text())
        self.assertIn(positioning, skill)
        self.assertIn("只提高触发覆盖率", USAGE.read_text())
        self.assertIn("不向用户展示 YAML", USAGE.read_text())

        evaluation = EVALUATION.read_text()
        for metric in (
            "修改任务终态对账覆盖率",
            "错误成功或运行验证声明",
            "目标对账覆盖率",
            "两轮内返工率",
            "首次交付通过率",
        ):
            self.assertIn(metric, evaluation)
        trial_header = TRIAL_RECORD.read_text().splitlines()[0]
        for column in (
            "开始提示", "边界事件", "已完成目标数", "未验证目标数",
            "范围检查结果", "首次交付是否通过", "两轮内是否返工",
            "错误成功声明", "虚假运行验证", "未授权写入",
        ):
            self.assertIn(column, trial_header)

    def test_invoked_gate_releases_or_holds_once(self):
        cases = json.loads(GATE_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "non-development-not-invoked",
            "feedback-meta-not-invoked",
            "development-status-release",
            "clear-development-release",
            "resolved-defect-report-is-read-only-fast-path",
            "explicit-defect-fix-fast-path",
            "resolved-visual-target-light-binding-fast-path",
            "direct-target-behavior-fast-path",
            "resolved-dom-light-binding-fast-path",
            "find-defect-is-read-only-contract",
            "external-write-needs-separate-authorization",
            "exact-pagecenter-proposal-accepts-short-affirmative",
            "ambiguous-external-choice-rejects-short-affirmative",
            "bounded-scope-contract-experience",
            "cross-module-signal-uses-contract",
            "hard-ambiguity-hold",
            "ambiguous-screenshot-deictic-contract",
            "bare-log-resumes-previous-diagnosis",
            "log-fix-with-acceptance-contract",
            "ui-check-release-to-downstream",
            "quoted-transcript-releases-without-task",
            "direct-exclusion-before-quoted-context",
        })

        for case_id in ("non-development-not-invoked", "feedback-meta-not-invoked"):
            self.assertEqual(by_id[case_id]["expected_gate"], "not_applicable")
            self.assertEqual(by_id[case_id]["evaluation_count"], 0)
            self.assertIsNone(by_id[case_id]["expected_experience"])
        feedback = by_id["feedback-meta-not-invoked"]
        self.assertEqual(feedback["expected_runtime_owner"], "host_adapter")
        self.assertEqual(feedback["expected_skill_reads"], 0)

        status = by_id["development-status-release"]
        self.assertEqual(status["expected_gate"], "release")
        self.assertIsNone(status["expected_contract"])
        self.assertTrue(status["must_pass_unchanged"])
        self.assertIsNone(status["expected_experience"])

        clear = by_id["clear-development-release"]
        self.assertEqual(clear["expected_gate"], "release")
        self.assertEqual(clear["expected_result"], "skip")
        self.assertEqual(clear["expected_route"], "fast_path")
        self.assertIsNone(clear["expected_contract"])
        self.assertIsNone(clear["expected_next_skill"])
        self.assertEqual(clear["expected_reference_reads"], 0)
        self.assertEqual(clear["expected_repository_reads_by_gate"], 0)
        self.assertEqual(clear["expected_reporter_calls"], 0)
        self.assertEqual(clear["expected_experience"], {
            "start": "AI Talk · 目标明确，直接执行",
            "terminal_reconciliation": True,
        })

        defect = by_id["resolved-defect-report-is-read-only-fast-path"]
        self.assertEqual(defect["stable_bindings"], ["file_line", "business_id"])
        self.assertEqual(defect["expected_internal"], {
            "intent": "behavior_report",
            "authorization": "inspect_only",
            "target_state": "resolved",
            "scope_state": "local",
            "route": "fast_path",
        })
        self.assertIsNone(defect["expected_contract"])
        self.assertEqual(
            defect["expected_experience"]["start"],
            "AI Talk · 已锁定为只读诊断",
        )
        self.assertFalse(defect["expected_experience"]["terminal_reconciliation"])

        explicit_fix = by_id["explicit-defect-fix-fast-path"]
        self.assertEqual(explicit_fix["expected_internal"]["authorization"], "authorized")
        self.assertIsNone(explicit_fix["expected_contract"])
        self.assertTrue(explicit_fix["expected_experience"]["terminal_reconciliation"])
        visual = by_id["resolved-visual-target-light-binding-fast-path"]
        self.assertEqual(visual["expected_binding_route"], "light_binding")
        self.assertEqual(visual["expected_target_state"], "resolved")
        self.assertEqual(visual["expected_route"], "fast_path")
        self.assertIsNone(visual["expected_contract"])
        self.assertEqual(visual["stable_bindings"], ["screenshot_annotation"])
        self.assertEqual(visual["expected_reference_reads"], 0)
        self.assertEqual(visual["expected_repository_reads_by_gate"], 0)
        self.assertEqual(visual["expected_browser_calls_by_gate"], 0)
        self.assertEqual(visual["expected_contract_checker_calls"], 0)
        direct_behavior = by_id["direct-target-behavior-fast-path"]
        self.assertEqual(direct_behavior["expected_authorization"], "authorized")
        light_binding = by_id["resolved-dom-light-binding-fast-path"]
        self.assertEqual(light_binding["expected_binding_route"], "light_binding")
        self.assertEqual(light_binding["expected_target_state"], "resolved")
        self.assertIsNone(light_binding["expected_contract"])
        self.assertEqual(light_binding["expected_reference_reads"], 0)

        find_defect = by_id["find-defect-is-read-only-contract"]
        self.assertEqual(find_defect["expected_mode"], "inspect_only")
        self.assertEqual(find_defect["expected_authorization"], "inspect_only")
        self.assertEqual(find_defect["expected_external_write_scope"], [])
        self.assertTrue(find_defect["must_not_infer_authorization_from_behavior_report"])
        self.assertEqual(
            find_defect["expected_experience"]["lock_fields"],
            ["目标", "边界", "完成标准"],
        )

        external = by_id["external-write-needs-separate-authorization"]
        self.assertEqual(external["expected_mode"], "inspect_only")
        self.assertEqual(external["expected_external_write_scope"], [])
        self.assertTrue(external["must_not_infer_authorization_from_desired_state"])
        affirmative = by_id["exact-pagecenter-proposal-accepts-short-affirmative"]
        self.assertEqual(affirmative["expected_continuation"], "revise")
        self.assertEqual(affirmative["expected_authorization_quote"], "是的")
        self.assertEqual(
            affirmative["expected_external_write_targets"],
            ["7AIKIjzi", "yInAf8hk", "T9mmxWeI"],
        )
        self.assertTrue(affirmative["must_not_require_restated_command"])
        self.assertEqual(
            affirmative["expected_experience"]["lock_fields"],
            ["目标", "边界", "验收"],
        )
        self.assertTrue(affirmative["expected_experience"]["terminal_reconciliation"])
        ambiguous_affirmative = by_id["ambiguous-external-choice-rejects-short-affirmative"]
        self.assertEqual(ambiguous_affirmative["expected_result"], "clarify")
        self.assertEqual(ambiguous_affirmative["expected_external_write_scope"], [])
        self.assertTrue(ambiguous_affirmative["must_not_infer_targets_from_affirmative"])
        bounded_experience = by_id["bounded-scope-contract-experience"]
        self.assertEqual(bounded_experience["expected_scope_policy"], "bounded")
        self.assertEqual(
            bounded_experience["expected_experience"]["boundary_events"],
            ["scope_guard_activated", "scope_violation_reported_if_present"],
        )
        self.assertTrue(
            bounded_experience["expected_experience"]["terminal_reconciliation"]
        )
        self.assertTrue(by_id["cross-module-signal-uses-contract"]["expected_contract_required"])
        blocked = by_id["hard-ambiguity-hold"]
        self.assertEqual(blocked["expected_gate"], "hold")
        self.assertEqual(blocked["expected_result"], "clarify")
        self.assertEqual(blocked["expected_question_count"], 1)
        self.assertEqual(
            blocked["expected_experience"]["start"],
            "AI Talk · 需要锁定一个关键结果",
        )

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
        self.assertIsNone(bare_log["expected_experience"]["start"])
        self.assertEqual(
            bare_log["expected_experience"]["terminal_reconciliation"],
            "inherit_active_task",
        )

        requested_log_fix = by_id["log-fix-with-acceptance-contract"]
        self.assertEqual(requested_log_fix["expected_mode"], "modify_and_verify")
        self.assertEqual(requested_log_fix["expected_authorization"], "authorized")
        self.assertEqual(requested_log_fix["expected_log_handling"], "promoted_evidence")
        self.assertEqual(len(requested_log_fix["expected_verification"]), 2)
        self.assertTrue(requested_log_fix["expected_experience"]["terminal_reconciliation"])

        ui_check = by_id["ui-check-release-to-downstream"]
        self.assertEqual(ui_check["expected_gate"], "release")
        self.assertEqual(ui_check["expected_next_skill"], "ui-self-check")
        self.assertFalse(ui_check["downstream_implicit_invocation"])
        self.assertEqual(
            ui_check["expected_experience"]["terminal_reconciliation"],
            "if_modified",
        )
        quoted = by_id["quoted-transcript-releases-without-task"]
        self.assertIsNone(quoted["expected_contract"])
        self.assertTrue(quoted["must_not_treat_quoted_commands_as_authorization"])
        direct_constraint = by_id["direct-exclusion-before-quoted-context"]
        self.assertEqual(
            direct_constraint["expected_pending_constraint"]["excluded_scope"],
            ["**/core/**"],
        )
        self.assertTrue(direct_constraint["must_not_start_implementation"])
        self.assertIsNone(quoted["expected_experience"])
        self.assertIsNone(direct_constraint["expected_experience"])
        self.assertTrue(all(
            case["evaluation_count"] == (0 if case["expected_gate"] == "not_applicable" else 1)
            for case in cases
        ))

    def test_requirement_contract_freezes_compact_shape_and_routing(self):
        reference = REQUIREMENT_CONTRACT.read_text()
        for key in CONTRACT_KEYS:
            self.assertIn(f"{key}:", reference)
        for value in RESULTS | MODES | SCOPE_POLICIES:
            self.assertIn(f"`{value}`", reference)
        for instruction in (
            "A normal-versus-broken comparison alone is evidence, not write authorization",
            "Never copy `entry_point` into it as a fallback",
            "A visual target is not automatically a code control point or writable file",
            "File names, symbols, repository conventions, and reusable implementations",
            "Ask one decisive question",
            "Include success or failure branches only when evidence shows",
            "Excluded scope always wins over writable scope",
            "Keep `next_skill` `null` by default",
            "Deterministic Validation",
            "referenced file and line existence",
            "explicit current-turn authorization for every external write",
            "Never require a fixed phrase",
            "never expose the contract or YAML to the user",
        ):
            self.assertIn(instruction, reference)

        execution = EXECUTION_PROTOCOLS.read_text()
        for instruction in (
            "AI Talk · 已锁定",
            "AI Talk · 已锁定为只读诊断",
            "AI Talk · 需要锁定一个关键结果",
            "AI Talk 对账",
            "`已完成`, `未完成`, or `未验证`",
            "Never claim success, boundary protection, or runtime verification without evidence",
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
            "scripts/contract-check.mjs validate",
            "An empty local",
            "without asking",
        ):
            self.assertIn(instruction, execution)

        consumer_fields = [
            line.split("`")[1]
            for line in reference.splitlines()
            if line.startswith("| `")
        ]
        self.assertEqual(consumer_fields, CONTRACT_KEYS)
        checker = CONTRACT_CHECK.read_text()
        for field in CONTRACT_KEYS:
            self.assertIn(f'"{field}"', checker)

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
            "bare-defect-remains-inspect-only",
            "find-defect-remains-inspect-only",
            "explicit-pagecenter-write-authorization",
            "contextual-pagecenter-write-authorization",
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
        self.assertEqual(implicit["schema_version"], "1.4")
        self.assertEqual(implicit["result"], "skip")
        self.assertEqual(implicit["mode"], "modify_and_verify")
        self.assertEqual(implicit["authorization"], "authorized")
        self.assertEqual(implicit["target_refs"], [])
        self.assertEqual(implicit["external_write_scope"], [])
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
        bare_defect = by_id["bare-defect-remains-inspect-only"]
        self.assertEqual(bare_defect["expected_mode"], "inspect_only")
        self.assertEqual(bare_defect["expected_authorization"], "inspect_only")
        find_defect = by_id["find-defect-remains-inspect-only"]
        self.assertEqual(find_defect["expected_mode"], "inspect_only")
        self.assertEqual(find_defect["expected_external_write_scope"], [])
        pagecenter = by_id["explicit-pagecenter-write-authorization"]
        self.assertEqual(pagecenter["expected_write_scope"], [])
        self.assertEqual(pagecenter["expected_external_write_scope"][0]["system"], "Pagecenter")
        self.assertIn("更新", pagecenter["expected_external_write_scope"][0]["authorization_quote"])
        contextual_pagecenter = by_id["contextual-pagecenter-write-authorization"]
        contextual_scope = contextual_pagecenter["expected_transition"]["external_write_scope"]
        self.assertEqual(
            [item["target"] for item in contextual_scope],
            ["7AIKIjzi", "yInAf8hk", "T9mmxWeI"],
        )
        self.assertTrue(all(
            item["authorization_quote"] == "是的" for item in contextual_scope
        ))
        self.assertTrue(contextual_pagecenter["must_not_ask"])
        self.assertTrue(contextual_pagecenter["must_not_require_restated_command"])
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
            "runtime-only sidecar",
            "AI Talk Skill does not read this file",
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
