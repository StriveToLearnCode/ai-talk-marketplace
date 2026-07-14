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

    def test_available_skills_are_authoritative_and_actually_invoked(self):
        self.assertIn("Available Skills", self.skill_text)
        self.assertIn("完整读取其 `SKILL.md`", self.skill_text)
        self.assertIn("执行其中与当前任务相关的只读能力发现流程", self.skill_text)
        self.assertIn("专用项目或公司 Skill 优先于通用开发", self.skill_text)
        self.assertIn("Skill 元数据匹配不等于 Skill 已经被调用", self.capability_text)
        self.assertIn("实际调用 Skill 的结果优先于本地关键词索引", self.capability_text)

    def test_company_component_search_is_semantic_and_name_agnostic(self):
        self.assertIn("## 公司组件优先流程", self.skill_text)
        self.assertIn("不得硬编码 Skill 名称", self.skill_text)
        self.assertIn("不得加入猜测的组件名", self.skill_text)
        self.assertIn("真实项目技术栈", self.skill_text)
        self.assertIn("目标页面或模块", self.skill_text)

    def test_company_component_candidate_contract_is_bounded(self):
        self.assertIn("最多展示三个", self.skill_text)
        self.assertIn("组件名称", self.skill_text)
        self.assertIn("匹配原因", self.skill_text)
        self.assertIn("每项只向用户显示", self.skill_text)
        self.assertIn("用户选择后才生成最终话术", self.skill_text)
        self.assertIn("不得自动改用未选择的候选", self.skill_text)

    def test_company_component_fallback_requires_user_direction(self):
        self.assertIn("未找到合适的公司封装组件", self.skill_text)
        self.assertIn("检查当前项目已有实现", self.skill_text)
        self.assertIn("新建本地组件", self.skill_text)
        self.assertIn("不得自动切换到项目组件", self.skill_text)
        self.assertIn("--defer-project-component-choice", self.skill_text)
        self.assertIn("project_component_selection_deferred", self.capability_text)

    def test_recommendation_confidence_does_not_claim_compatibility(self):
        self.assertIn("只表示推荐确定", self.skill_text)
        self.assertIn("不表示代码兼容性已经验证", self.skill_text)
        self.assertIn("`execution_validation` 仍为 `null`", self.capability_text)

    def test_local_index_does_not_scan_user_skill_directories(self):
        for path in (
            "~/.codex/skills",
            "~/.cc-switch/skills",
            "插件缓存",
        ):
            self.assertIn(path, self.capability_text)
        self.assertIn("它不扫描", self.capability_text)

    def test_prompt_only_contract_has_no_fake_action_block(self):
        self.assertIn("`draft`", self.skill_text)
        self.assertIn("`ready`", self.skill_text)
        self.assertIn("只有这两个状态", self.skill_text)
        self.assertIn("任务话术已生成，当前尚未执行代码修改", self.skill_text)
        self.assertIn("不得输出“确认任务”“调整任务”“取消”", self.skill_text)
        self.assertNotIn("确认任务\n调整任务\n取消", self.skill_text)
        self.assertNotIn("allowed_user_actions", self.skill_text)
        self.assertNotIn("handoff_to_codex_allowed", self.skill_text)

    def test_preparation_is_read_only(self):
        self.assertIn("不修改业务文件", self.skill_text)
        self.assertIn("不执行 formatter、lint、测试、构建", self.skill_text)
        self.assertIn("只读能力发现", self.skill_text)
        self.assertIn("跳过修改文件、构建、部署、提交和外部写入动作", self.capability_text)

    def test_capability_lifecycle_is_separated(self):
        for state in ("candidate_reuse", "candidate_reference", "low_relevance"):
            self.assertIn(f"`{state}`", self.capability_text)
        for choice in ("prefer_reuse", "prefer_reference", "excluded"):
            self.assertIn(f"`{choice}`", self.skill_text)
        for result in (
            "confirmed_reuse",
            "partial_reuse",
            "incompatible",
            "reference_only",
        ):
            self.assertIn(f"`{result}`", self.skill_text)
        self.assertIn("`execution_validation`", self.skill_text)

    def test_first_version_scenes_are_explicit(self):
        for scene in (
            "bug_debugging",
            "ui_reconstruction",
            "localization_migration",
            "api_integration",
            "feature_development",
        ):
            self.assertIn(f"`{scene}`", self.skill_text)

    def test_skill_is_explicit_only(self):
        self.assertRegex(
            self.agent_text,
            re.compile(r"policy:\s+allow_implicit_invocation: false", re.MULTILINE),
        )
        self.assertIn("$ai-talk", self.agent_text)

    def test_plugin_metadata_matches_prompt_only_positioning(self):
        description = self.manifest["interface"]["longDescription"]
        self.assertIn("实际调用", description)
        self.assertIn("只读能力发现", description)
        self.assertIn("只生成任务话术", description)
        self.assertIn("不修改业务代码", description)
        self.assertNotIn("确认任务", description)
        self.assertNotIn("任务卡", description)


if __name__ == "__main__":
    unittest.main()
