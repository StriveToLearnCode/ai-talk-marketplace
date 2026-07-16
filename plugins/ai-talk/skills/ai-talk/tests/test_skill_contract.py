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

    def test_internal_profile(self):
        fields = (
            "task_action", "target_category", "desired_output", "execution_mode",
            "evidence_types", "intent_terms", "exclusion_terms", "unknowns",
        )
        for field in fields:
            self.assertIn(f"`{field}`", self.skill)
            self.assertIn(f"{field}:", self.router)

    def test_scope(self):
        required = (
            ".agents/skills/**/SKILL.md", "显式批准的公司 Skill 根", "ui-self-check",
            "只解析 `SKILL.md` frontmatter", "触发条件/适用场景",
            "不读取其他正文、references、脚本或知识库",
            "不索引 `plugins/ai-talk/docs/skills/`", "重复 `name`",
        )
        for text in required:
            self.assertIn(text, self.skill)

    def test_user_output_whitelist(self):
        for text in ("💡 AI 理解", "✅ AI 已决定", "🚀 AI 将执行", "使用：<Skill 名称>", "为什么不用 <Skill>？", "执行前需确认", "最多 4 条"):
            self.assertIn(text, self.skill)
        for text in ("💡 AI 理解", "✅ AI 已决定", "🚀 AI 将执行", "使用：", "原因：", "为什么不用 ", "执行前需确认："):
            self.assertIn(text, self.formatter)
        for text in ("绝对路径", "评分", "`matched_fields`", "`matched_terms`", "候选数组", "索引详情", "冲突详情"):
            self.assertIn(text, self.skill)

    def test_routing_boundaries(self):
        required = (
            "midscene-test.ts", "ai-test", "ui-self-check", "docs/plan/", "gen-frontend-plan", "gen-code",
            "Figma 只作为开发证据", "PageCenter 配置/推送产物", "活动积木或 uiMeta", "“测一下”是泛化词",
            "打开页面 / 看看页面 / 浏览器检查", "有问题、异常、不对",
        )
        for text in required:
            self.assertIn(text, self.skill)

    def test_screenshot_contract(self):
        for text in ("见截图", "参考截图", "截图如下", "根据这张图", "图片、图标、背景图、已领取图片"):
            self.assertIn(text, self.skill)

    def test_legacy_protocol_disabled(self):
        self.assertIn("旧 `--profile-json` 协议已禁用", self.skill)
        self.assertNotIn('flag === "--profile-json"', self.router)

    def test_no_execution(self):
        for text in ("不要扩展 Prompt Builder", "不调用已决定或备选 Skill", "Context Builder", "组件库", "自定义 UI", "不执行任务"):
            self.assertIn(text, self.skill)

    def test_metadata(self):
        self.assertIn("AI 已决定", self.agent)
        self.assertEqual(self.manifest["version"].split("+")[0], "0.4.0")
        self.assertIn("Zero downstream execution", self.manifest["interface"]["capabilities"])

    def test_cases(self):
        self.assertGreaterEqual(len(self.cases), 20)


if __name__ == "__main__":
    unittest.main()
