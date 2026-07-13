import json
import re
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
PLUGIN_DIR = SKILL_DIR.parents[1]


class SkillContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill_text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        cls.agent_text = (SKILL_DIR / "agents" / "openai.yaml").read_text(
            encoding="utf-8"
        )
        cls.capability_text = (
            SKILL_DIR / "references" / "capability-reuse.md"
        ).read_text(encoding="utf-8")
        cls.manifest = json.loads(
            (PLUGIN_DIR / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8")
        )

    def test_four_handling_modes_describe_post_confirmation_behavior(self):
        for mode in ("analyze", "plan", "modify_and_verify", "review"):
            self.assertIn(f"`{mode}`", self.skill_text)
        self.assertIn("开始执行后的 Codex 行为", self.skill_text)
        self.assertNotIn("执行方式：直接执行", self.skill_text)

    def test_confirmation_states_and_bypass_are_explicit(self):
        for state in ("ready", "needs_confirmation", "blocked"):
            self.assertIn(f"`{state}`", self.skill_text)
        self.assertIn("`card` 和 `bypass`", self.skill_text)
        self.assertIn("不要求用户输入“继续”", self.skill_text)
        self.assertIn("只询问 `blocking_question`", self.skill_text)

    def test_task_preparation_stays_bounded_until_handoff(self):
        self.assertIn("唯一允许运行的项目命令", self.skill_text)
        self.assertIn("不打开候选页面、组件、接口", self.skill_text)
        self.assertIn("不修改业务代码", self.skill_text)
        self.assertIn("AI Talk 准备阶段结束", self.skill_text)
        self.assertIn("不额外读取候选文件、真实消费者、测试或同类页面", self.capability_text)

    def test_adjustment_surface_is_limited(self):
        for field in (
            "execution_mode",
            "scope",
            "use_capabilities",
            "capability_preferences",
        ):
            self.assertIn(f"`{field}`", self.skill_text)
        self.assertIn("不得在调整区加入目标重写", self.skill_text)
        self.assertIn("完整表单", self.skill_text)

    def test_button_contract_prevents_unconfirmed_send(self):
        self.assertIn("`auto_send: false`", self.skill_text)
        self.assertIn("禁止使用 `ui/message` 冒充输入框插入", self.skill_text)
        self.assertIn("未经点击不得发送", self.skill_text)
        self.assertIn("一次点击即开始", self.skill_text)
        self.assertIn("禁止把摘要替换为“任务卡已生成”", self.skill_text)
        self.assertNotIn("请在卡片中点击", self.skill_text)

    def test_capability_lifecycle_is_separated(self):
        for choice in ("prefer_reuse", "prefer_reference", "excluded"):
            self.assertIn(f"`{choice}`", self.skill_text)
        for result in (
            "confirmed_reuse",
            "partial_reuse",
            "incompatible",
            "reference_only",
        ):
            self.assertIn(f"`{result}`", self.skill_text)
        self.assertIn("`execution_validation` 保持 `null`", self.skill_text)
        self.assertIn("用户只选择 `choice_required` 项", self.skill_text)

    def test_first_version_scenes_and_risks_are_explicit(self):
        for scene in (
            "bug_debugging",
            "ui_reconstruction",
            "localization_migration",
            "api_integration",
            "feature_development",
        ):
            self.assertIn(f"`{scene}`", self.skill_text)
        self.assertIn("不静默选择", self.skill_text)
        self.assertIn("公共组件", self.skill_text)
        self.assertIn("范围扩大", self.skill_text)

    def test_skill_is_explicit_only(self):
        self.assertRegex(
            self.agent_text,
            re.compile(r"policy:\s+allow_implicit_invocation: false", re.MULTILINE),
        )
        self.assertIn("$ai-talk", self.agent_text)
        self.assertIn("简单明确任务直接处理", self.agent_text)

    def test_plugin_declares_mcp_without_fake_app_manifest(self):
        self.assertEqual("./.mcp.json", self.manifest["mcpServers"])
        self.assertNotIn("apps", self.manifest)
        self.assertIn("Interactive", self.manifest["interface"]["capabilities"])
        description = self.manifest["interface"]["longDescription"]
        self.assertIn("轻量 MCP Apps 卡片", description)
        self.assertIn("简单明确任务跳过卡片直接处理", description)


if __name__ == "__main__":
    unittest.main()
