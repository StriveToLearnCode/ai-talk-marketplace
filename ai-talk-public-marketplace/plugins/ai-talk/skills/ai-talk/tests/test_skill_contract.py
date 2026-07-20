import json
import unittest
from pathlib import Path


SKILL = Path(__file__).resolve().parents[1]
PLUGIN = SKILL.parents[1]
ROUTER = SKILL / "scripts/route-company-skills"
SPEC = PLUGIN.parents[1] / "docs" / "AI_TALK_V1_SPEC.md"


class Contract(unittest.TestCase):
    def test_plugin_manifest_and_skill_are_valid(self):
        manifest = json.loads((PLUGIN / ".codex-plugin/plugin.json").read_text())
        self.assertTrue(manifest["name"])
        skill = (SKILL / "SKILL.md").read_text()
        self.assertIn("name: ai-talk", skill)
        self.assertIn("AI Talk 增量上下文增强", skill)
        for heading in ("🧩 已补充上下文", "🧠 AI 判断", "🔍 公司检索入口", "⚠️ 需要确认", "▶ 下一步"):
            self.assertIn(heading, skill)
        for removed_heading in ("🎯 任务目标", "🔍 优先检索", "⚠️ 待确认"):
            self.assertNotIn(removed_heading, skill)
        self.assertNotIn("📚 需要理解", skill)
        self.assertIn("--evidence-json", skill)
        self.assertIn("Stable", skill)
        self.assertIn("Reserved", skill)
        self.assertIn("TaskHandoff 1.1", skill)
        self.assertIn("项目上下文正文最多读取 4 个文件", skill)
        self.assertIn("Skill 正文读取数默认为 0", skill)
        spec = SPEC.read_text()
        self.assertIn("唯一的产品与实现标准", spec)
        self.assertIn("处理链固定为单向三阶段", spec)

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
