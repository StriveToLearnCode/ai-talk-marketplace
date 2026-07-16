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
        cls.cases = json.loads((SKILL / "tests/company-skill-routing-cases.json").read_text())

    def test_context_enhancer_schema(self):
        fields = (
            "original_goal", "confirmed_context", "intent", "entities",
            "retrieval_query_groups", "retrieval_queries", "retrieval_directions",
            "boundaries", "unknowns", "execution_skill",
        )
        for field in fields:
            self.assertIn(field, self.skill)
            self.assertIn(field, self.router)
        for field in ("type", "value", "source"):
            self.assertIn(field, self.skill)

    def test_source_backed_context_and_attachment_roles(self):
        for text in (
            "visual=<附件摘要>", "interaction=<附件摘要>", "api=<附件摘要>",
            "screenshot=<附件摘要>", "selected_code=<选中内容摘要>",
            "user_text:path", "user_text:explicit_reference", "attachment:<序号>",
            "图片没有显示", "图标", "背景图",
        ):
            self.assertIn(text, self.skill)
        for text in ("visual_design", "interaction_flow", "api_document", "selected_code"):
            self.assertIn(text, self.router)

    def test_retrieval_does_not_expand_business_requirements(self):
        for text in (
            "每类最多生成 3 个", "Docs", "Skill", "Component", "Code",
            "`dialog`、`modal`、`popup`", "不得写成用户已确认需求", "不预设用户未提及的组件名称",
            "progressRewardConfig", "不得直接使用用户原话作为 Query 主体", "仅追加固定后缀",
            "不编造 Docs、Skill、路径、接口或业务规则",
        ):
            self.assertIn(text, self.skill)

    def test_runtime_skill_index_scope(self):
        for text in (
            ".agents/skills/**/SKILL.md", "显式批准的公司 Skill 根", "ui-self-check",
            "不索引 `plugins/ai-talk/docs/skills/`", "不读取 references、脚本、知识库或普通正文",
        ):
            self.assertIn(text, self.skill)

    def test_default_output_contract(self):
        headings = ("用户目标：", "已确认上下文：", "研发概念：", "检索方向：", "任务边界与未知项：", "执行能力：")
        for text in headings:
            self.assertIn(text, self.skill)
            self.assertIn(text, self.formatter)
        self.assertNotIn("建议检索：", self.formatter)
        self.assertNotIn("retrieval_queries", self.formatter)
        for old in ("AI 已决定", "为什么选择 Skill", "未选择 Skill"):
            self.assertIn(old, self.skill)
            self.assertNotIn(old, self.formatter)
        self.assertIn("选型说明", self.formatter)
        self.assertNotIn("SKILL_RESPONSIBILITIES", self.formatter)

    def test_no_fixed_engineering_boilerplate(self):
        for text in ("AGENTS.md", "PageCenter", "ESLint", "Prettier"):
            self.assertIn(text, self.skill)
            self.assertNotIn(text, self.formatter)

    def test_routing_boundaries(self):
        required = (
            "midscene-test.ts", "ai-test", "ui-self-check", "docs/plan/", "gen-frontend-plan", "gen-code",
            "Figma 仅作为开发证据", "PageCenter 配置或推送产物", "活动积木或 uiMeta", "“测一下”",
        )
        for text in required:
            self.assertIn(text, self.skill)

    def test_legacy_protocol_disabled(self):
        self.assertIn("旧 `--profile-json` 协议保持禁用", self.skill)
        self.assertNotIn('flag === "--profile-json"', self.router)

    def test_metadata(self):
        self.assertIn("上下文", self.agent)
        self.assertEqual(self.manifest["version"].split("+")[0], "0.4.0")
        self.assertIn("Source-backed context extraction", self.manifest["interface"]["capabilities"])
        self.assertIn("Context handoff", self.manifest["interface"]["capabilities"])

    def test_cases(self):
        self.assertGreaterEqual(len(self.cases), 20)


if __name__ == "__main__":
    unittest.main()
