import json
import unittest
from pathlib import Path


SKILL = Path(__file__).resolve().parents[1]
PLUGIN = SKILL.parents[1]


class Contract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill = (SKILL / "SKILL.md").read_text()
        cls.agent = (SKILL / "agents/openai.yaml").read_text()
        cls.router = (SKILL / "scripts/route-company-skills.mjs").read_text()
        cls.formatter = (SKILL / "scripts/format-user-output.mjs").read_text()
        cls.manifest = json.loads((PLUGIN / ".codex-plugin/plugin.json").read_text())

    def test_supported_intents_and_task_specific_context(self):
        for intent in ("feature_create", "bug_fix", "ui_modify", "ui_inspection", "planning"):
            self.assertIn(intent, self.skill)
            self.assertIn(intent, self.router)
        for field in (
            "target_scope", "expected_behavior", "visual_reference", "interaction_rule", "data_source",
            "issue_symptom", "reproduction_condition", "state_mapping", "visual_change", "state_condition",
            "asset_resource", "page_entry", "inspection_goal", "goal", "scope",
        ):
            self.assertIn(field, self.skill)

    def test_gap_schema_and_rules(self):
        for field in ("type", "reason", "blocking", "suggested_source"):
            self.assertIn(field, self.skill)
            self.assertIn(field, self.router)
        for source in ("project", "docs", "skill", "user"):
            self.assertIn(source, self.skill)
        for rule in ("最多生成一个阻塞缺口", "没有真实缺口", "不输出固定“期望交付物尚未明确”"):
            self.assertIn(rule, self.skill)

    def test_task_contract_headings(self):
        for heading in ("用户目标：", "已确认上下文：", "研发概念：", "关系与冲突：", "上下文缺口：", "任务边界：", "验收标准："):
            self.assertIn(heading, self.skill)
            self.assertIn(heading, self.formatter)
        self.assertNotIn("检索方向：", self.formatter)
        self.assertNotIn("执行能力：", self.formatter)

    def test_no_retrieval_or_skill_routing(self):
        for rule in ("不搜索项目", "不读取公司 Docs", "调用 Skill", "不得生成检索计划"):
            self.assertIn(rule, self.skill)
        for implementation in ("readdir", "readFile", "open(", "scoreSkill", "execution_skill", "retrieval_queries"):
            self.assertNotIn(implementation, self.router)

    def test_asset_and_screenshot_safety(self):
        for resource in ("icon/mask", "icon/close", "progress/bg-1"):
            self.assertIn(resource, self.skill)
        self.assertIn("截图只能证明页面表现", self.skill)
        self.assertIn("不直接推断状态值的业务含义", self.skill)

    def test_metadata_matches_context_gap_scope(self):
        self.assertIn("Context Gap", self.agent)
        self.assertIn("Context Gap", self.manifest["description"])
        self.assertNotIn("Skill routing", self.manifest["interface"]["capabilities"])
        self.assertIn("Zero retrieval and downstream execution", self.manifest["interface"]["capabilities"])

    def test_legacy_protocol_disabled(self):
        self.assertIn("旧 `--profile-json` 协议保持禁用", self.skill)
        self.assertNotIn('flag === "--profile-json"', self.router)


if __name__ == "__main__":
    unittest.main()
