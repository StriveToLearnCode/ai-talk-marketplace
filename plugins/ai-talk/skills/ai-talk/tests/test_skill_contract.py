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

    def test_four_handling_modes_describe_downstream_codex_behavior(self):
        for mode in ("analyze", "plan", "modify_and_verify", "review"):
            self.assertIn(f"`{mode}`", self.skill_text)
        self.assertIn("后续 Codex", self.skill_text)
        self.assertIn("不是 AI Talk 当前执行授权", self.skill_text)
        normalized = self.skill_text.replace("禁止使用“执行方式：直接执行”", "")
        self.assertNotIn("执行方式：直接执行", normalized)

    def test_all_generated_tasks_require_review(self):
        self.assertIn("`requires_user_review` 始终为 `true`", self.skill_text)
        self.assertIn("所有新生成和重新生成任务默认进入此状态", self.skill_text)
        self.assertIn("任务话术已准备，等待审查", self.skill_text)
        self.assertIn("当前尚未执行代码修改", self.skill_text)
        self.assertIn("不运行项目命令", self.skill_text)
        self.assertIn("不修改文件", self.skill_text)

    def test_task_preparation_does_not_execute_business_analysis(self):
        self.assertIn("唯一允许运行的项目命令", self.skill_text)
        self.assertIn("不打开页面、组件、接口", self.skill_text)
        self.assertIn("不根据 Bug、UI 或接口 reference 开始定位根因", self.skill_text)
        self.assertIn("不得额外打开候选业务源码", self.skill_text)
        self.assertIn("不额外读取候选文件、真实消费者、测试或同类页面", self.capability_text)
        self.assertNotIn("读取候选文件确认名称", self.skill_text)
        self.assertNotIn("读取每个展示候选的真实文件", self.capability_text)

    def test_task_state_machine_requires_explicit_confirmation(self):
        for state in ("draft", "ready_for_review", "confirmed", "revise"):
            self.assertIn(f"`{state}`", self.skill_text)
        self.assertIn("只有用户明确回复“确认任务”", self.skill_text)
        self.assertIn("确认任务\n调整任务\n取消", self.skill_text)
        self.assertNotIn("auto_execute", self.skill_text.replace("不存在 `auto_execute`", ""))

    def test_capability_lifecycle_is_separated(self):
        for state in ("candidate_reuse", "candidate_reference", "low_relevance"):
            self.assertIn(f"`{state}`", self.skill_text)
        for choice in ("prefer_reuse", "prefer_reference", "excluded"):
            self.assertIn(f"`{choice}`", self.skill_text)
        for state in ("auto_selected", "choice_required"):
            self.assertIn(f"`{state}`", self.skill_text)
        for result in ("confirmed_reuse", "partial_reuse", "incompatible", "reference_only"):
            self.assertIn(f"`{result}`", self.skill_text)
        self.assertIn("`execution_validation: null`", self.skill_text)

    def test_clear_capabilities_are_automatic_and_only_ambiguity_blocks(self):
        self.assertIn("主 Skill、项目规则和适用 Prompt 自动采用", self.skill_text)
        self.assertIn("唯一且高相关的项目内组件或 utility", self.skill_text)
        self.assertIn("用户只选择 `choice_required` 项", self.skill_text)
        self.assertIn("没有待选项时直接生成最终任务话术", self.skill_text)
        self.assertIn("自动采用能力", self.skill_text)
        self.assertIn("待选择候选", self.skill_text)
        self.assertIn("自动项不阻塞话术生成", self.capability_text)

    def test_first_version_scope_and_conflict_handling_are_explicit(self):
        for scene in (
            "bug_debugging",
            "ui_reconstruction",
            "localization_migration",
            "api_integration",
            "feature_development",
        ):
            self.assertIn(f"`{scene}`", self.skill_text)
        self.assertIn("不静默选择", self.skill_text)
        self.assertIn("不替代 Codex Plan", self.skill_text)

    def test_skill_is_explicit_only(self):
        self.assertRegex(
            self.agent_text,
            re.compile(r"policy:\s+allow_implicit_invocation: false", re.MULTILINE),
        )
        self.assertIn("$ai-talk", self.agent_text)
        self.assertIn("等待我审查", self.agent_text)

    def test_plugin_metadata_matches_review_first_positioning(self):
        description = self.manifest["interface"]["longDescription"]
        self.assertIn("待用户审查", description)
        self.assertIn("自动采用主 Skill", description)
        self.assertIn("仅在组件或复用方式存在歧义时让用户选择", description)
        self.assertIn("不替代 Codex Plan", description)
        self.assertIn("不读取业务源码或分析根因", description)
        self.assertIn("不运行构建、测试或业务命令", description)
        self.assertIn("不修改业务代码", description)
        self.assertNotIn("直接执行", description)


if __name__ == "__main__":
    unittest.main()
