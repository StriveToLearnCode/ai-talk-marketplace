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

    def test_schema_v6_adds_four_layer_fields_and_preserves_compatibility(self):
        for field in ("execution_goal", "default_rules", "project_context", "skill_handoff"):
            self.assertIn(field, self.skill)
            self.assertIn(field, self.router)
        for field in (
            "original_goal", "confirmed_context", "intent", "entities",
            "retrieval_query_groups", "retrieval_queries", "retrieval_directions",
            "boundaries", "unknowns", "recommended_skill",
        ):
            self.assertIn(field, self.skill)
            self.assertIn(field, self.router)
        self.assertIn("schema_version: 6", self.skill)
        self.assertIn("schema_version: 6", self.router)

    def test_chinese_output_separates_positioning_context_retrieval_boundaries_and_skill(self):
        for text in (
            'userGoal: "用户目标"', 'taskPositioning: "任务定位"',
            'projectContext: "项目上下文"', 'suggestedRetrieval: "建议检索"',
            'implementationBoundary: "实现边界"',
            'recommendedSkill: "建议 Skill"', "renderChinese",
        ):
            self.assertIn(text, self.formatter)
        for old in ('goal: "任务目标"', 'developmentObject: "研发对象"', 'defaultRule: "研发默认规则（AI 补充）"'):
            self.assertNotIn(old, self.formatter)

    def test_user_goal_and_positioning_are_bounded(self):
        for text in (
            "用一句话保留用户真正想完成的结果", "不补充未提出的业务结果",
            "不超过 100 个中文字符", "MAX_REASONING_CHINESE_CHARACTERS = 100", "cleanGoal(result?.original_goal)",
        ):
            self.assertIn(text, self.skill + self.formatter)

    def test_task_positioning_is_bounded_and_separate_from_retrieval_and_boundaries(self):
        for text in (
            "taskSpecificReasoningFor", "implementationBoundariesFor", "整个“任务定位”模块省略",
            "不能只根据 `feature_create | feature_modify | bug_fix` 等任务类型套固定模板",
            "不得输出具体代码方案", "MAX_OUTPUT_CONSTRAINTS = 2", "MAX_OUTPUT_RETRIEVAL_TARGETS = 5",
        ):
            self.assertIn(text, self.skill + self.formatter)

    def test_default_rules_are_sourced_bounded_and_conflict_aware(self):
        for text in (
            "universal | intent | project", "最多 5 条", "删除冲突规则",
            "不引入用户未确认的业务逻辑", "先确认根因，再进行最小范围修复",
            "defaultRulesFor", "rules.slice(0, 5)",
        ):
            self.assertIn(text, self.skill + self.router)

    def test_project_context_reads_are_explicit_and_bounded(self):
        for text in (
            "realpath", "node_modules", "一层相对本地导入", "最多读取 8 个文件", "单文件最多 128 KiB",
            "MAX_PROJECT_FILES = 8", "MAX_BYTES = 128 * 1024", "resolveLocalImport", "collectProjectContext",
        ):
            self.assertIn(text, self.skill + self.router)
        self.assertIn("仓库外符号链接", self.skill)
        self.assertIn("不读取无关兄弟模块", self.skill)

    def test_project_context_and_rules_keep_provenance(self):
        for text in (
            "target_file | target_directory | project_rule | direct_dependency",
            "type | value | source", '"project", context.value', "evidence",
            "project:AGENTS.md", "project:import:",
        ):
            self.assertIn(text, self.skill + self.router)

    def test_handoff_is_always_present_and_skill_is_optional(self):
        for text in (
            "内部继续生成 Handoff", "没有高置信结果时省略整个“建议 Skill”模块",
            "execution_focus", "unresolved", "retrieval_semantics", "recommended_skill",
            "skillHandoffFor",
        ):
            self.assertIn(text, self.skill + self.formatter)

    def test_technical_identifiers_and_unknown_state_meanings_are_protected(self):
        for text in (
            "文件名、变量名、接口名、资源路径和 Skill 名称不得翻译或改写",
            "`state=0` 不能直接解释为已领取或未领取", "不能直接判定为接口问题",
            "不能因为包含 `/` 就识别为目录", "不复述 OCR",
        ):
            self.assertIn(text, self.skill)

    def test_skill_output_requires_high_confidence(self):
        for text in ("至少 70", "至少 15 分", "score > 0", "明确的目标产物或执行方式信号"):
            self.assertIn(text, self.skill)
        for text in ("MIN_SKILL_SCORE = 70", "MIN_SKILL_MARGIN = 15", "hasExplicitSkillMode"):
            self.assertIn(text, self.formatter)

    def test_runtime_skill_index_scope_is_unchanged(self):
        for text in (
            ".agents/skills/**/SKILL.md", "显式批准的公司 Skill 根", "ui-self-check",
            "不索引 `plugins/ai-talk/docs/skills/`", "不读取 references、脚本、知识库或普通正文",
        ):
            self.assertIn(text, self.skill)

    def test_read_only_generation_and_execution_gate(self):
        self.assertIn("旧 `--profile-json` 协议保持禁用", self.skill)
        self.assertNotIn('flag === "--profile-json"', self.router)
        for text in (
            "解析轮只允许上述受限只读", "禁止修改文件", "禁止调用任何下游工具或 Skill", "自动 handoff",
            "后续独立一轮", "开始执行", "直接修改", "使用这个协议继续", "调用 gen-code 执行",
        ):
            self.assertIn(text, self.skill)

    def test_metadata_matches_the_new_contract(self):
        self.assertIn("用户目标", self.agent)
        self.assertIn("任务定位", self.agent)
        self.assertIn("建议检索", self.agent)
        self.assertIn("实现边界", self.agent)
        self.assertIn("allow_implicit_invocation: false", self.agent)
        self.assertEqual(self.manifest["version"].split("+")[0], "0.4.0")
        for capability in (
            "Concise user goal preservation", "Sourced development default rules",
            "Evidence-based task positioning", "Positioning omission when evidence is insufficient",
            "High-signal retrieval targets", "Fact and implementation conclusion separation",
            "Bounded explicit-target project reads", "Always-on Skill Handoff generation",
            "Explicit execution permission gate",
        ):
            self.assertIn(capability, self.manifest["interface"]["capabilities"])

    def test_files_have_no_merge_conflict_markers(self):
        markers = ("<" * 7, "=" * 7, ">" * 7)
        for content in (self.skill, self.agent, self.router, self.formatter):
            for marker in markers:
                self.assertNotIn(marker, content)

    def test_routing_case_matrix_remains_broad(self):
        self.assertGreaterEqual(len(self.cases), 20)


if __name__ == "__main__":
    unittest.main()
