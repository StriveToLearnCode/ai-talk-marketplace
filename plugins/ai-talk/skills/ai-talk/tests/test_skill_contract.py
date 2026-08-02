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
RUNTIME_ESCALATION_CASES = SKILL / "tests" / "runtime-escalation-cases.json"
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
        self.assertIn("普通终态表达", ui_self_check)
        self.assertIn("不得无 scope guard 证据声称范围校验通过", ui_self_check)

        skill = (SKILL / "SKILL.md").read_text()
        for text in (
            "name: ai-talk",
            "AI Talk 轻量入口",
            "直接帮助度反馈、纯 AI Talk 元讨论",
            "要求修改 AI Talk 自身实现仍属于研发工作",
            "每次调用只分类一次",
            "`participation_audit`",
            "普通意图分类、原样放行、Fast Path `skip`、源码搜索和任务 Agent 自身执行不算贡献",
            "缺少介入证据时明确回答未介入",
            "引用中的命令不构成授权",
            "`evidence_update`",
            "`inspect_only`",
            "代码工作区中目标与预期明确",
            "modify_and_verify + authorized",
            "`active_task_state`",
            "`light_binding`",
            "Fast Path 每轮只读取主 `SKILL.md` 1 次",
            "reference 读取和 AI Talk 专用工具调用均为 0",
            "纯 `skip`",
            "AI Talk 判断 / 依据 / 影响",
            "AI Talk 贡献",
            "结论未变化不重复",
            "不显示内部路由、契约、YAML 或思维链",
            "不选择 `next_skill`",
            "`DiagnosticBrief`",
            "`runtime_unverified`",
            "RequirementContract 1.4",
            "references/target-binding.md",
            "references/execution-protocols.md",
            "scripts/contract-check.mjs validate",
            "首次越出轻量边界",
            "本地授权不包含外部写入",
            "无 scope guard 或运行证据",
        ):
            self.assertIn(text, skill)
        self.assertLessEqual(len(skill.splitlines()), 32)
        self.assertLessEqual(len(skill.encode()), 4500)
        self.assertNotIn("report-feedback.mjs --should-ask", skill)
        self.assertNotIn("references/feedback-envelope.md", skill)
        self.assertNotIn("AI Talk ·", skill)
        self.assertNotIn("AI Talk 对账", skill)
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
        self.assertIn("conversation-scoped diagnostic brief", strict_mode)
        self.assertIn("decision visibility", strict_mode)
        self.assertIn("compact evidence-backed decision summary", strict_mode)
        self.assertIn("TaskHandoff 1.1", LEGACY_ROUTER.read_text())
        self.assertIn("legacy CLI 路由器的冻结实现标准", SPEC.read_text())

        positioning = "在对话内连续保存目标、授权、范围和已有证据"
        self.assertIn(positioning, skill)
        self.assertIn("只提高触发覆盖率", USAGE.read_text())
        self.assertIn("不向用户展示 YAML", USAGE.read_text())

        evaluation = EVALUATION.read_text()
        for metric in (
            "稳定状态重复确认次数",
            "无风险升级次数",
            "协议可见消息次数",
            "实际介入任务决策摘要覆盖率",
            "决策摘要最大行数",
            "结论未变化时重复摘要次数",
            "实际介入任务终态贡献摘要覆盖率",
            "纯 `skip` 错误贡献归因次数",
            "内部路由、契约字段、YAML 或思维链泄露次数",
            "错误成功或运行验证声明",
            "显式 AI Talk 参与度自查主 `SKILL.md` 读取次数",
            "显式 AI Talk 参与度自查 reference 读取次数",
            "主 `SKILL.md` 字节数",
            "目标对账覆盖率",
            "两轮内返工率",
            "首次交付通过率",
        ):
            self.assertIn(metric, evaluation)
        trial_header = TRIAL_RECORD.read_text().splitlines()[0]
        for column in (
            "开始提示", "边界事件", "已完成目标数", "未验证目标数",
            "范围检查结果", "首次交付是否通过", "两轮内是否返工",
            "动态升级预期", "动态升级结果", "升级前越界写入", "不必要升级",
            "稳定状态重复确认", "无风险升级", "协议可见消息",
            "决策摘要触发", "决策摘要行数", "无变化重复摘要",
            "终态贡献摘要", "错误贡献归因", "内部推理泄露",
            "日志扩大目标或范围", "Git状态归属误判", "工具stash未恢复",
            "错误成功声明", "虚假运行验证", "未授权写入",
        ):
            self.assertIn(column, trial_header)

    def test_runtime_escalation_happens_only_for_real_new_risk(self):
        skill = (SKILL / "SKILL.md").read_text()
        execution = EXECUTION_PROTOCOLS.read_text()
        execution_flat = " ".join(execution.split())
        evaluation = EVALUATION.read_text()
        for instruction in (
            "文件数和工具数都不是升级理由",
            "首次越出轻量边界的本地写入或任何外部写入前升级",
            "保留已有证据和已完成检查",
            "只有实际产品结果、写范围或新增授权决策才询问用户",
        ):
            self.assertIn(instruction, skill)
        for instruction in (
            "File count and tool count never trigger escalation",
            "stop before the first local write beyond the original lightweight boundary",
            "Preserve collected evidence and completed in-boundary local edits",
            "Continue without clarification when the contract has no hard product, write-scope, or new-authorization decision",
        ):
            self.assertIn(instruction, execution_flat)
        for metric in (
            "真实风险出现后的动态升级漏检次数",
            "仅实现文件增加导致的不必要升级次数",
            "动态升级前扩大边界或外部写入次数",
        ):
            self.assertIn(metric, evaluation)

        cases = json.loads(RUNTIME_ESCALATION_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "adjacent-files-stay-fast-path",
            "cross-module-behavior-upgrades-before-write",
            "data-semantics-upgrade-asks-once",
            "external-write-upgrade-remains-read-only",
        })
        adjacent = by_id["adjacent-files-stay-fast-path"]
        self.assertEqual(adjacent["expected_transition"], "continue_fast_path")
        self.assertIsNone(adjacent["expected_contract"])
        self.assertTrue(adjacent["must_not_treat_file_or_tool_count_as_risk"])
        cross_module = by_id["cross-module-behavior-upgrades-before-write"]
        self.assertEqual(cross_module["expected_transition"], "upgrade_before_expanded_write")
        self.assertEqual(cross_module["expected_question_count"], 0)
        self.assertTrue(cross_module["must_preserve_collected_evidence"])
        semantics = by_id["data-semantics-upgrade-asks-once"]
        self.assertEqual(semantics["expected_question_count"], 1)
        external = by_id["external-write-upgrade-remains-read-only"]
        self.assertEqual(external["expected_transition"], "upgrade_before_external_write")
        self.assertEqual(external["external_posture"], "inspect_only")
        self.assertTrue(external["must_not_infer_external_authorization_from_local_write"])

    def test_invoked_gate_releases_or_holds_once(self):
        cases = json.loads(GATE_CASES.read_text())
        by_id = {case["id"]: case for case in cases}
        self.assertEqual(set(by_id), {
            "non-development-not-invoked",
            "feedback-meta-not-invoked",
            "quoted-ai-talk-feedback-without-request-not-invoked",
            "assistance-audit-pass-through-has-no-attribution",
            "assistance-audit-contract-evidence-is-attributable",
            "ai-talk-implementation-request-is-development",
            "development-status-release",
            "clear-development-release",
            "resolved-local-defect-defaults-to-repair-fast-path",
            "visual-diagnosis-fast-path-builds-brief",
            "explicit-defect-fix-fast-path",
            "diagnosis-fix-reuses-fast-path-brief",
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
            "fast-path-continuation-preserves-state",
            "contract-task-local-revision-uses-fast-path",
            "active-task-risk-progressively-upgrades",
            "external-authorization-persists-for-exact-active-targets",
            "log-fix-with-acceptance-contract",
            "ui-check-release-to-downstream",
            "quoted-transcript-releases-without-task",
            "direct-exclusion-before-quoted-context",
        })

        for case_id in (
            "non-development-not-invoked",
            "feedback-meta-not-invoked",
            "quoted-ai-talk-feedback-without-request-not-invoked",
        ):
            self.assertEqual(by_id[case_id]["expected_gate"], "not_applicable")
            self.assertEqual(by_id[case_id]["evaluation_count"], 0)
            self.assertIsNone(by_id[case_id]["expected_experience"])
        feedback = by_id["feedback-meta-not-invoked"]
        self.assertEqual(feedback["expected_runtime_owner"], "host_adapter")
        self.assertEqual(feedback["expected_skill_reads"], 0)
        quoted_feedback = by_id["quoted-ai-talk-feedback-without-request-not-invoked"]
        self.assertEqual(quoted_feedback["expected_skill_reads"], 0)

        no_help = by_id["assistance-audit-pass-through-has-no-attribution"]
        self.assertEqual(no_help["expected_result"], "participation_audit")
        self.assertEqual(no_help["expected_skill_reads"], 1)
        self.assertEqual(no_help["expected_reference_reads"], 0)
        self.assertEqual(no_help["expected_tool_calls"], 0)
        self.assertEqual(no_help["expected_attribution"], "no_material_help")
        self.assertIn("源码搜索", no_help["must_not_attribute"])
        self.assertIn("giftId 定位", no_help["must_not_attribute"])

        helped = by_id["assistance-audit-contract-evidence-is-attributable"]
        self.assertEqual(helped["expected_result"], "participation_audit")
        self.assertEqual(helped["expected_skill_reads"], 1)
        self.assertEqual(helped["expected_reference_reads"], 0)
        self.assertEqual(helped["expected_tool_calls"], 0)
        self.assertEqual(helped["expected_attribution"], "material_help")
        self.assertEqual(helped["attributable_evidence"], [
            "validated_contract",
            "external_write_boundary_decision",
        ])

        implementation = by_id["ai-talk-implementation-request-is-development"]
        self.assertEqual(implementation["expected_gate"], "release")
        self.assertEqual(implementation["expected_route"], "fast_path")
        self.assertEqual(implementation["expected_skill_reads"], 1)
        self.assertEqual(implementation["expected_reference_reads"], 0)
        self.assertEqual(implementation["expected_tool_calls"], 0)

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
        self.assertEqual(clear["expected_skill_reads"], 1)
        self.assertEqual(clear["expected_reference_reads"], 0)
        self.assertEqual(clear["expected_tool_calls"], 0)
        self.assertEqual(clear["expected_visible_ai_talk_messages"], 0)
        self.assertEqual(clear["expected_repository_reads_by_gate"], 0)
        self.assertEqual(clear["expected_reporter_calls"], 0)
        self.assertEqual(clear["expected_experience"], {
            "start": None,
            "terminal_reconciliation": True,
        })

        defect = by_id["resolved-local-defect-defaults-to-repair-fast-path"]
        self.assertEqual(defect["stable_bindings"], ["file_line", "business_id"])
        self.assertEqual(defect["expected_internal"], {
            "intent": "modify_and_verify",
            "authorization": "authorized",
            "target_state": "resolved",
            "scope_state": "local",
            "route": "fast_path",
        })
        self.assertIsNone(defect["expected_contract"])
        self.assertEqual(
            defect["expected_experience"]["start"],
            None,
        )
        self.assertTrue(defect["expected_experience"]["terminal_reconciliation"])

        diagnostic = by_id["visual-diagnosis-fast-path-builds-brief"]
        brief = diagnostic["expected_diagnostic_brief"]
        self.assertEqual(diagnostic["expected_route"], "fast_path")
        self.assertIsNone(diagnostic["expected_contract"])
        self.assertEqual(diagnostic["expected_extra_tool_calls_by_gate"], 0)
        self.assertEqual(list(brief), [
            "mode", "target", "observed", "primary_hypotheses",
            "verification", "stop_condition",
        ])
        self.assertTrue(all(item["status"] == "fact" for item in brief["observed"]))
        self.assertTrue(all(item["source"] for item in brief["observed"]))
        self.assertTrue(all(
            item["status"] == "inference" for item in brief["primary_hypotheses"]
        ))
        self.assertEqual(brief["verification"], [
            "render_condition", "mapped_field", "actual_response", "server_injection",
        ])
        self.assertEqual(brief["stop_condition"], "找到第一个有直接证据的断点")
        self.assertEqual(
            diagnostic["expected_experience"]["decision_summary"]["trigger"],
            "diagnostic_brief_formed",
        )
        self.assertTrue(diagnostic["expected_experience"]["terminal_contribution"])

        explicit_fix = by_id["explicit-defect-fix-fast-path"]
        self.assertEqual(explicit_fix["expected_internal"]["authorization"], "authorized")
        self.assertIsNone(explicit_fix["expected_contract"])
        self.assertTrue(explicit_fix["expected_experience"]["terminal_reconciliation"])
        continuation = by_id["diagnosis-fix-reuses-fast-path-brief"]
        self.assertEqual(continuation["expected_mode"], "modify_and_verify")
        self.assertEqual(continuation["expected_authorization"], "authorized")
        self.assertEqual(continuation["expected_route"], "fast_path")
        self.assertIsNone(continuation["expected_contract"])
        self.assertIn("confirmed_breakpoint", continuation["preserve"])
        self.assertEqual(continuation["expected_repeated_retrieval"], 0)
        self.assertEqual(
            continuation["expected_experience"]["decision_summary"]["trigger"],
            "active_diagnostic_state_reused",
        )
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
        self.assertEqual(
            visual["expected_experience"]["decision_summary"]["trigger"],
            "light_binding_resolved",
        )
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
        self.assertEqual(
            find_defect["expected_experience"]["decision_summary"]["trigger"],
            "boundary_decision_formed",
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
        self.assertEqual(
            bounded_experience["expected_experience"]["decision_summary"]["trigger"],
            "bounded_scope_activated",
        )
        self.assertTrue(by_id["cross-module-signal-uses-contract"]["expected_contract_required"])
        blocked = by_id["hard-ambiguity-hold"]
        self.assertEqual(blocked["expected_gate"], "hold")
        self.assertEqual(blocked["expected_result"], "clarify")
        self.assertEqual(blocked["expected_question_count"], 1)
        self.assertEqual(
            blocked["expected_experience"]["start"],
            None,
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
        self.assertFalse(bare_log["expected_scope_change"])
        self.assertFalse(bare_log["expected_external_authorization_change"])
        self.assertIsNone(bare_log["expected_experience"]["start"])
        self.assertEqual(
            bare_log["expected_experience"]["terminal_reconciliation"],
            "inherit_active_task",
        )

        fast_continuation = by_id["fast-path-continuation-preserves-state"]
        self.assertEqual(fast_continuation["expected_continuation"], "resume_same_task")
        self.assertTrue(fast_continuation["must_not_reconfirm"])
        self.assertTrue(fast_continuation["must_not_upgrade_for_continuity"])
        local_revision = by_id["contract-task-local-revision-uses-fast-path"]
        self.assertEqual(local_revision["expected_route"], "fast_path")
        self.assertEqual(local_revision["expected_active_contract"], "preserved_unmodified")
        self.assertFalse(local_revision["expected_contract_revision"])
        self.assertEqual(local_revision["expected_contract_checker_calls"], 0)
        self.assertEqual(local_revision["expected_reference_reads"], 0)
        self.assertEqual(local_revision["expected_external_write_targets_used"], [])
        self.assertEqual(local_revision["expected_verification_scope"], "local_delta_only")
        self.assertEqual(local_revision["must_preserve_user_changes"], [
            "mdc-recharge-discount.vue",
        ])
        self.assertIn("external_write", local_revision["must_return_to_contract_before"])
        progressive = by_id["active-task-risk-progressively-upgrades"]
        self.assertEqual(progressive["expected_transition"], "progressive_upgrade")
        self.assertEqual(progressive["expected_new_risks"], ["cross_module", "excluded_scope"])
        self.assertTrue(progressive["must_not_repeat_retrieval_for_stable_evidence"])
        self.assertTrue(progressive["expected_experience"]["protocol_visible"])
        self.assertEqual(
            progressive["expected_experience"]["decision_summary"]["trigger"],
            "progressive_upgrade",
        )
        external_retry = by_id["external-authorization-persists-for-exact-active-targets"]
        self.assertEqual(external_retry["expected_external_write_targets"], ["7AIKIjzi"])
        self.assertTrue(external_retry["must_not_reconfirm"])
        self.assertTrue(external_retry["must_not_expand_external_scope"])

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
        self.assertTrue(all(
            case.get("expected_experience", {}).get("start") is None
            for case in cases
            if isinstance(case.get("expected_experience"), dict)
        ))
        summaries = [
            case["expected_experience"]["decision_summary"]
            for case in cases
            if isinstance(case.get("expected_experience"), dict)
            and "decision_summary" in case["expected_experience"]
        ]
        self.assertGreaterEqual(len(summaries), 5)
        for summary in summaries:
            self.assertEqual(summary["fields"], ["判断", "依据", "影响"])
            self.assertEqual(summary["max_lines"], 3)
            self.assertEqual(summary["max_repeats_without_change"], 0)
        self.assertTrue(all(
            not case.get("expected_experience", {}).get("terminal_contribution", False)
            for case in cases
            if case.get("expected_route") == "fast_path"
            and case.get("expected_binding_route") is None
            and case.get("expected_diagnostic_brief") is None
            and case.get("expected_repeated_retrieval") != 0
            and isinstance(case.get("expected_experience"), dict)
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
            "explicit authorization trace for every external write",
            "Never require a fixed phrase",
            "never expose the contract or YAML to the user",
            "end-to-end observable path",
            "downstream consumer",
        ):
            self.assertIn(instruction, reference)

        execution = EXECUTION_PROTOCOLS.read_text()
        self.assertNotIn("AI Talk ·", execution)
        self.assertNotIn("AI Talk 对账", execution)
        execution_flat = " ".join(execution.split())
        for instruction in (
            "Keep internal reasoning and protocol machinery silent",
            "A plain Fast Path `skip` has no AI Talk contribution and stays silent",
            "Never exceed three lines",
            "AI Talk 判断",
            "AI Talk 贡献",
            "do not repeat it unless the conclusion changes",
            "Do not claim that AI Talk prevented an error, saved time, or improved quality unless",
            "mandatory branded reconciliation block",
            "Continuity alone is not a risk signal",
            "Never claim success, boundary protection, or runtime verification without evidence",
            "scripts/scope-guard.mjs snapshot",
            "staged, unstaged, untracked",
            "--tool-stash <oid>",
            "An unrecorded stash is never a tool stash",
            "Never copy the entry point as a fallback",
            "runtime_unverified",
            "Include success and failure branches only when",
            "`pass_through`",
            "`revise`",
            "`new_task`",
            "`evidence_update`",
            "`behavior_report`",
            "Do not create a new objective",
            "scripts/contract-check.mjs validate",
            "reuse it without reconfirmation only for",
            "paths or systems merely mentioned by logs",
            "DiagnosticBrief",
            "Stop at the first directly",
            "evidenced breakpoint",
            "Do not repeat a completed diagnostic check",
            "last responsible moment",
            "draft updated",
        ):
            self.assertIn(instruction, execution_flat)

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
            "resolved-local-defect-defaults-to-repair",
            "unresolved-defect-remains-inspect-only",
            "find-defect-remains-inspect-only",
            "explicit-pagecenter-write-authorization",
            "contextual-pagecenter-write-authorization",
            "derived-pagecenter-hotspot-defers-confirmation-and-verifies-consumer",
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
        local_defect = by_id["resolved-local-defect-defaults-to-repair"]
        self.assertEqual(local_defect["expected_mode"], "modify_and_verify")
        self.assertEqual(local_defect["expected_authorization"], "authorized")
        self.assertEqual(local_defect["expected_external_write_scope"], [])
        unresolved_defect = by_id["unresolved-defect-remains-inspect-only"]
        self.assertEqual(unresolved_defect["expected_mode"], "inspect_only")
        self.assertEqual(unresolved_defect["expected_authorization"], "inspect_only")
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
        derived_pagecenter = by_id[
            "derived-pagecenter-hotspot-defers-confirmation-and-verifies-consumer"
        ]
        self.assertEqual(derived_pagecenter["expected_identifier_roles"], {
            "400005": "item_id",
            "T9mmxWeI": "pagecenter_page_id",
        })
        self.assertTrue(derived_pagecenter["must_not_classify_identifier_from_shape"])
        self.assertEqual(
            derived_pagecenter["confirmation_timing"],
            "immediately_before_first_external_write",
        )
        self.assertIn("local_code_edit", derived_pagecenter["allowed_before_external_confirmation"])
        self.assertIn("保留现有三项并追加 400005 热区", derived_pagecenter["expected_exact_proposal"])
        self.assertEqual(derived_pagecenter["accepted_reply"], "确认")
        self.assertTrue(derived_pagecenter["must_not_require_fixed_phrase"])
        self.assertTrue(derived_pagecenter["must_not_repeat_visible_workflow"])
        self.assertEqual(
            derived_pagecenter["expected_external_write_scope"][0]["target"],
            "page T9mmxWeI field json.bg12Preview",
        )
        checks = " ".join(derived_pagecenter["required_completion_checks"])
        self.assertIn("type=22", checks)
        self.assertIn("preview dialog consumer", checks)
        self.assertEqual(derived_pagecenter["expected_terminal_reconciliation"], {
            "pagecenter_draft": "updated",
            "fixed_dev": "not_published",
            "local_code": "modified",
            "verification_levels_separated": True,
        })
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
            "never classify it as a Pagecenter page ID from shape alone",
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
