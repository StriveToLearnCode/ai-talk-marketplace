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
        cls.feature_text = (
            SKILL_DIR / "references" / "feature-development.md"
        ).read_text(encoding="utf-8")
        cls.clarifying_text = (
            SKILL_DIR / "references" / "clarifying-questions.md"
        ).read_text(encoding="utf-8")
        cls.manifest = json.loads(
            (PLUGIN_DIR / ".codex-plugin" / "plugin.json").read_text(
                encoding="utf-8"
            )
        )

    def test_direct_route_is_first_and_tool_free(self):
        self.assertIn("## 处理路由", self.skill_text)
        self.assertLess(
            self.skill_text.index("### `direct` 快速路径"),
            self.skill_text.index("### `discovery` 发现路径"),
        )
        for rule in (
            "不得读取项目文件、目标文件或项目规则",
            "不得运行 `collect_context.py`",
            "不得读取任何 reference",
            "不得调用其他 Skill",
            "在一次响应中立即生成最终话术并停止",
            "15 秒内完成",
        ):
            self.assertIn(rule, self.skill_text)

    def test_common_task_words_do_not_force_discovery(self):
        self.assertIn(
            "仅仅出现路径、Bug、截图、接口、开发或验证等词，不构成进入 `discovery` 的理由",
            self.skill_text,
        )
        self.assertIn("明确的 Bug 现象", self.skill_text)
        self.assertIn("明确的代码审查范围", self.skill_text)

    def test_discovery_is_conditional_and_uses_minimum_sources(self):
        for trigger in (
            "核心交付物是可复用 UI 组件",
            "用户明确要求查找、复用或参考现有",
            "任务话术必须引用用户尚未提供的接口契约",
            "存在会改变任务方向的真实歧义",
        ):
            self.assertIn(trigger, self.skill_text)
        self.assertIn("不得默认同时执行两者", self.skill_text)
        self.assertIn("才继续第二种发现", self.skill_text)
        self.assertIn("不是每轮固定执行的两层流程", self.capability_text)

    def test_available_skills_are_authoritative_when_discovery_is_needed(self):
        self.assertIn("Available Skills", self.skill_text)
        self.assertIn("完整读取其 `SKILL.md`", self.skill_text)
        self.assertIn("只执行与当前任务相关的只读发现步骤", self.skill_text)
        self.assertIn("Skill 元数据匹配不等于 Skill 已经被调用", self.capability_text)

    def test_company_component_search_remains_semantic_and_separate(self):
        self.assertIn("## 公司组件优先流程", self.skill_text)
        self.assertIn("不得硬编码 Skill 名称", self.skill_text)
        self.assertIn("不得加入猜测的组件名", self.skill_text)
        self.assertIn("先调用公司组件 Skill，不同时运行项目本地索引", self.skill_text)
        self.assertIn("最多展示三个候选", self.skill_text)
        self.assertIn("每项只显示组件名称和匹配原因", self.skill_text)
        self.assertIn("用户选择后才生成最终话术", self.skill_text)

    def test_company_component_fallback_requires_user_direction(self):
        for text in (
            "未找到合适的公司封装组件",
            "检查当前项目已有实现",
            "新建本地组件",
            "不得自动切换到项目组件",
        ):
            self.assertIn(text, self.skill_text)
        self.assertIn("--defer-project-component-choice", self.skill_text)
        self.assertIn("project_component_selection_deferred", self.capability_text)

    def test_facts_only_policy_separates_information_sources(self):
        self.assertIn("## 信息来源与事实边界", self.skill_text)
        for category in ("`用户事实`", "`项目事实`", "`检索事实`", "`未确认信息`"):
            self.assertIn(category, self.skill_text)
        self.assertIn("默认不输出 Assumption", self.skill_text)
        self.assertIn("建议（非需求）", self.skill_text)
        self.assertIn("用户确认前不得并入最终话术", self.skill_text)

    def test_direct_route_cannot_claim_project_facts(self):
        self.assertIn(
            "不得把未读取的技术栈、文件内容、运行时版本或项目规范写成项目事实",
            self.skill_text,
        )
        self.assertIn("`direct` 路径通常只包含用户事实和执行边界", self.skill_text)

    def test_component_capabilities_do_not_become_requirements(self):
        self.assertIn("`组件支持某能力` 不等于 `本需求要求该能力`", self.skill_text)
        for item in ("标题", "内容", "按钮", "关闭方式", "props", "事件", "数据结构"):
            self.assertIn(item, self.skill_text)
        self.assertIn("组件其余能力不得进入需求", self.capability_text)
        self.assertIn("不得固定罗列完整组件 API", self.capability_text)

    def test_feature_prompt_is_minimal_and_omits_empty_fields(self):
        for field in ("用户明确需求", "已验证约束", "已选择能力", "未确认信息", "执行边界"):
            self.assertIn(field, self.feature_text)
        self.assertIn("没有则省略整个字段", self.feature_text)
        self.assertIn("用户明确提供验收要求时才增加验收字段", self.feature_text)

    def test_non_blocking_unknowns_are_omitted_without_defaults(self):
        self.assertIn("非阻塞项省略", self.clarifying_text)
        self.assertIn("未回答时保持为未知", self.clarifying_text)
        self.assertIn("不选择产品或技术默认值", self.clarifying_text)
        self.assertIn("不生成验收标准", self.clarifying_text)

    def test_local_index_does_not_scan_user_skill_directories(self):
        for path in ("~/.codex/skills", "~/.cc-switch/skills", "插件缓存"):
            self.assertIn(path, self.capability_text)
        self.assertIn("它不扫描", self.capability_text)

    def test_four_handling_modes_describe_downstream_codex_behavior(self):
        for mode in ("analyze", "plan", "modify_and_verify", "review"):
            self.assertIn(f"`{mode}`", self.skill_text)
        self.assertIn("后续 Codex 的行为", self.skill_text)
        self.assertIn("不是 AI Talk 当前执行授权", self.skill_text)

    def test_prompt_only_contract_has_no_fake_actions(self):
        self.assertIn("`draft`", self.skill_text)
        self.assertIn("`ready`", self.skill_text)
        self.assertIn("任务话术已生成，当前尚未执行代码修改", self.skill_text)
        self.assertIn("不得输出“确认任务”“调整任务”“取消”", self.skill_text)
        self.assertNotIn("确认任务\n调整任务\n取消", self.skill_text)

    def test_preparation_is_read_only(self):
        self.assertIn("不修改业务文件", self.skill_text)
        self.assertIn("不执行 formatter、lint、测试、构建", self.skill_text)
        self.assertIn("修改、构建、部署、提交和外部写入", self.skill_text)

    def test_capability_lifecycle_is_separated(self):
        for state in ("candidate_reuse", "candidate_reference", "low_relevance"):
            self.assertIn(f"`{state}`", self.capability_text)
        for choice in ("prefer_reuse", "prefer_reference", "excluded"):
            self.assertIn(f"`{choice}`", self.capability_text)
        for result in ("confirmed_reuse", "partial_reuse", "incompatible", "reference_only"):
            self.assertIn(f"`{result}`", self.capability_text)
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

    def test_plugin_metadata_matches_routing_and_prompt_only_positioning(self):
        description = self.manifest["interface"]["longDescription"]
        for text in (
            "direct 快速路径",
            "discovery",
            "只读能力发现",
            "只生成任务话术",
            "不修改业务代码",
        ):
            self.assertIn(text, description)
        self.assertNotIn("确认任务", description)
        self.assertNotIn("任务卡", description)


if __name__ == "__main__":
    unittest.main()
