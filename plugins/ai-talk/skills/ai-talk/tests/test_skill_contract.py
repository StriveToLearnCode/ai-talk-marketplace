import json
import unittest
from pathlib import Path


SKILL = Path(__file__).resolve().parents[1]
PLUGIN = SKILL.parents[1]
ROUTER = SKILL / "scripts/route-company-skills"
SPEC = PLUGIN.parents[1] / "docs" / "AI_TALK_V1_SPEC.md"
LEGACY_ROUTER = SKILL / "references" / "legacy-router.md"
RUNTIME_UI_CASES = SKILL / "tests" / "runtime-ui-diagnosis-cases.json"


class Contract(unittest.TestCase):
    def test_plugin_manifest_and_skill_are_valid(self):
        manifest = json.loads((PLUGIN / ".codex-plugin/plugin.json").read_text())
        self.assertTrue(manifest["name"])
        self.assertIn("browser evidence", manifest["description"])
        self.assertIn("Live browser evidence for UI failures", manifest["interface"]["capabilities"])
        skill = (SKILL / "SKILL.md").read_text()
        self.assertIn("name: ai-talk", skill)
        self.assertIn("AI Talk 需求澄清", skill)
        self.assertIn("一次最多询问 2 个短问题", skill)
        self.assertIn("最多 3 条任务专属风险", skill)
        self.assertIn("AI Talk 到此结束，交给代码 Agent 实现。", skill)
        self.assertIn("不选择、推荐或调用代码 Skill", skill)
        self.assertIn("不读取或检索仓库", skill)
        self.assertNotIn("node scripts/route-company-skills.mjs", skill)
        self.assertNotIn("modify_and_verify", skill)
        self.assertTrue(LEGACY_ROUTER.is_file())
        legacy = LEGACY_ROUTER.read_text()
        self.assertIn("TaskHandoff 1.1", legacy)
        self.assertIn("modify_and_verify", legacy)
        spec = SPEC.read_text()
        self.assertIn("legacy CLI 路由器的冻结实现标准", spec)
        self.assertIn("处理链固定为单向三阶段", spec)

    def test_avatar_pag_clarification_case_is_explicit(self):
        skill = (SKILL / "SKILL.md").read_text()
        for text in (
            "recharge",
            "voice",
            "每个头像各自循环播放",
            "整个头像列表共用一个实例",
            "ui-pag",
            "PAG name 必须唯一",
            "覆盖层不得拦截头像点击",
        ):
            self.assertIn(text, skill)

    def test_solution_questions_preserve_intent_and_require_repository_evidence(self):
        skill = (SKILL / "SKILL.md").read_text()
        for text in (
            "`怎么办`、`怎么做`、`如何实现`、`有什么方案`等表达是方案诉求",
            "不是修改授权，也不是“只定位还是修改”的歧义",
            "不要改问“只定位问题，还是允许修改并验证”",
            "先检索现有包装组件、组件文档和同类用法",
            "未核实前不得把自定义 PAG、CSS 或其他具体技术当成既定方案",
        ):
            self.assertIn(text, skill)

    def test_diagnostic_triage_contract_is_explicit(self):
        skill = (SKILL / "SKILL.md").read_text()
        for text in (
            "inspect_only + Bug 定位",
            "控制层检查点击、确认、失败处理和关闭时机",
            "数据层检查接口调用、响应消费、状态回写和请求锁",
            "渲染层检查页面最终读取的字段",
            "diagnostic_fact",
            "responsibility_condition",
            "route.skill",
            "workflow.next_skill",
            "不重新判断任务、不重新大范围扫描",
        ):
            self.assertIn(text, skill)

    def test_runtime_ui_evidence_contract_is_explicit(self):
        skill = (SKILL / "SKILL.md").read_text()
        for text in (
            "不显示、位置异常、被遮挡、点击无效、修改后仍未生效",
            "单纯“按截图开发”不是异常诊断，不启动浏览器",
            "优先使用独立的应用内浏览器或新标签页",
            "不得点击领取、提交、支付、确认",
            "currentIndex === rewardNodes.length - 1",
            'bg-i="btn/receive"',
            "getBoundingClientRect()",
            "elementFromPoint()",
            "naturalWidth",
            "运行态尚未验证",
            "target_screenshot_captured",
            "交给代码 Agent 的结论",
        ):
            self.assertIn(text, skill)
        output_contract = skill.split("诊断模式输出：", 1)[1].split("纯代码或数据链诊断", 1)[0]
        fields = ["- 页面状态：", "- 条件：", "- DOM：", "- 布局层级：", "- 资源：", "- 截图："]
        self.assertEqual([output_contract.index(field) for field in fields], sorted(
            output_contract.index(field) for field in fields
        ))

    def test_runtime_ui_acceptance_cases_cover_required_branches(self):
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
        primary = by_id["last-reward-button-missing"]
        self.assertEqual(primary["expected_checks"], [
            "page_state",
            "render_condition",
            "dom_presence",
            "geometry_and_occlusion",
            "resource_load",
            "screenshot",
        ])
        self.assertEqual(primary["must_not_route"], ["gen-code", "ui-self-check"])
        self.assertEqual(
            by_id["not-last-reward"]["expected_outcome"],
            "precondition_not_met_not_a_defect",
        )
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

    def test_public_result_contract_is_minimal(self):
        source = (ROUTER / "build-execution-prompt.mjs").read_text()
        for field in (
            "original_request", "task_goal", "engineering_judgment",
            "required_knowledge", "retrieval_entries", "intent", "evidence", "recommended_skill",
            "alternative_skills", "selection_reason", "boundaries", "unknowns",
            "stage", "execution_mode", "added_context", "skipEnhancement", "execution_plan", "execution_prompt",
        ):
            self.assertIn(field, source)
        for removed in (
            "retrieval_query_groups", "business_object", "visual_effect",
            "development_context:", "planned_changes:",
        ):
            self.assertNotIn(removed, source)

    def test_rules_are_centralized(self):
        source = (ROUTER / "rules.mjs").read_text()
        for name in ("ui-self-check", "ai-test", "gen-code", "gen-frontend-plan", "figma-analyze"):
            self.assertIn(name, source)
        self.assertIn("CONFUSION_GROUPS", source)

    def test_context_reads_are_bounded(self):
        source = (ROUTER / "collect-context.mjs").read_text()
        for text in (
            "node_modules", "MAX_CONTEXT_FILES_READ", "MAX_SIMILAR_IMPLEMENTATIONS",
            "EARLY_STOP_RETRIEVAL_ENTRIES", "nearestAgentsFile", "safeFile",
        ):
            self.assertIn(text, source)

    def test_understanding_retrieval_and_formatter_are_one_way(self):
        classifier = (ROUTER / "classify-request.mjs").read_text()
        route = (SKILL / "scripts" / "route-company-skills.mjs").read_text()
        formatter = (ROUTER / "build-execution-prompt.mjs").read_text()
        self.assertIn("buildRetrievalRequest", classifier)
        self.assertIn("buildRetrievalRequest(understanding)", route)
        self.assertIn("validateTaskHandoff(executionPlan)", formatter)
        self.assertNotIn("classifyRequest", formatter)


if __name__ == "__main__":
    unittest.main()
