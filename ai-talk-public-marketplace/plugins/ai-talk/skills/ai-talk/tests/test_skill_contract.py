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

<<<<<<< HEAD
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
=======
    def test_existing_internal_schema_is_preserved(self):
        fields = (
            "original_goal", "confirmed_context", "intent", "entities",
            "retrieval_query_groups", "retrieval_queries", "retrieval_directions",
            "boundaries", "unknowns", "recommended_skill",
        )
        for field in fields:
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
            self.assertIn(field, self.skill)
            self.assertIn(field, self.router)
        for source in ("project", "docs", "skill", "user"):
            self.assertIn(source, self.skill)
        for rule in ("最多生成一个阻塞缺口", "没有真实缺口", "不输出固定“期望交付物尚未明确”"):
            self.assertIn(rule, self.skill)

<<<<<<< HEAD
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
=======
    def test_execution_protocol_replaces_retrieval_presentation(self):
        for text in (
            "AI Talk Execution Protocol Builder", "Execution Protocol",
            "任务类型 | 任务目标 | 研发对象 | 状态 | 视觉效果 | 资源 | 配置变量 | 接口字段 | 关键关系 | 检索语义 | 实现约束",
            "buildExecutionProtocol", "retrievalSemantics", "nextSkill",
        ):
            self.assertIn(text, self.skill + self.formatter)
        self.assertNotIn("buildDevelopmentRetrievalContext", self.formatter)
        self.assertNotIn("knowledgeItemsFor", self.formatter)
        self.assertNotIn("relationItemsFor", self.formatter)

    def test_layers_have_separate_responsibilities(self):
        for text in (
            "### Execution Protocol", "### Retrieval", "### Analysis", "### Presentation",
            "docs | skills | components | code", "中文输入的研发概念使用中文检索词", "只用于内部判断",
        ):
            self.assertIn(text, self.skill)
        self.assertNotIn("retrieval_query_groups", self.formatter)
        self.assertNotIn("retrieval_queries", self.formatter)
        self.assertNotIn("retrieval_directions", self.formatter)

    def test_default_output_contract(self):
        for term in (
            'taskType: "任务类型"', 'goal: "任务目标"', 'developmentObject: "研发对象"',
            'state: "状态"', 'visualEffect: "视觉效果"', 'resource: "资源"',
            'configVariable: "配置变量"', 'apiField: "接口字段"', 'relation: "关键关系"',
            'retrievalSemantic: "检索语义"', 'constraint: "实现约束"', 'nextSkill: "建议 Skill"',
        ):
            self.assertIn(term, self.formatter)
        self.assertIn("renderChinese", self.formatter)
        self.assertNotIn("Semantic Context", self.formatter)
        self.assertNotIn("Development Report", self.formatter)

    def test_goal_is_normalized_outcome(self):
        for text in ("规范化", "不复述原话", "最多 50 个中文字符"):
            self.assertIn(text, self.skill)
        for text in (
            "goalFor", "MAX_GOAL_CHINESE_CHARACTERS", "积分阶段接入任务",
            "`${action}第", "修复领取状态与页面表现不一致", "开发弹窗",
        ):
            self.assertIn(text, self.formatter)

    def test_chinese_semantics_preserve_technical_identifiers(self):
        for text in (
            "不复述 OCR", "不写分析、建议、推测和待确认项",
            "第 3 个奖励", "奖励展示异常", "已领取状态增加蒙层",
            "不能因为包含 `/` 就识别为目录", "文件名、变量名、接口名、资源路径和 Skill 名称不得翻译或改写",
        ):
            self.assertIn(text, self.skill)
        for text in ("`${match[1]}=${match[2]}`", "publicPath", "item.value", "assignment.value"):
            self.assertIn(text, self.formatter)

    def test_retrieval_semantics_use_company_chinese_terms(self):
        for text in (
            "奖励状态映射", "奖励展示条件", "积分阶段任务关联",
            "进度展示逻辑", "当前项目同类实现", "chineseRetrievalSemanticsFor",
        ):
            self.assertIn(text, self.skill + self.formatter)
        for ontology in ('"reward-render"', '"reward-progress"', '"reward-index-mapping"', '"claimed-state"', '"progress-rule"', '"similar-implementation"'):
            self.assertNotIn(ontology, self.formatter + self.router)

    def test_relations_and_constraints_are_compact(self):
        for text in (
            "来源或条件 → 结果", "任务 7 数据 → 积分阶段进度与奖励展示",
            "不得把推测写成关系", "空栏目省略",
        ):
            self.assertIn(text, self.skill + self.formatter)
        for text in ("复用现有展示方式", "不影响其他阶段", "不修改无关模块"):
            self.assertIn(text, self.skill)
            self.assertIn(text, self.formatter)

    def test_skill_output_requires_high_confidence(self):
        for text in ("至少 70", "至少 15 分", "score > 0", "明确的目标产物或执行方式信号"):
            self.assertIn(text, self.skill)
        for text in ("MIN_SKILL_SCORE = 70", "MIN_SKILL_MARGIN = 15", "hasExplicitSkillMode"):
            self.assertIn(text, self.formatter)

    def test_source_backed_context_and_no_answer_guessing(self):
        for text in (
            "visual=<附件摘要>", "interaction=<附件摘要>", "api=<附件摘要>",
            "screenshot=<附件摘要>", "selected_code=<选中内容摘要>",
            "`state=0` 不能直接解释为已领取或未领取", "不能直接判定为接口问题",
            "不得直接判定哪一方正确", "不要回答研发问题",
        ):
            self.assertIn(text, self.skill)
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)

    def test_asset_and_screenshot_safety(self):
        for resource in ("icon/mask", "icon/close", "progress/bg-1"):
            self.assertIn(resource, self.skill)
        self.assertIn("截图只能证明页面表现", self.skill)
        self.assertIn("不直接推断状态值的业务含义", self.skill)

<<<<<<< HEAD
    def test_metadata_matches_context_gap_scope(self):
        self.assertIn("Context Gap", self.agent)
        self.assertIn("Context Gap", self.manifest["description"])
        self.assertNotIn("Skill routing", self.manifest["interface"]["capabilities"])
        self.assertIn("Zero retrieval and downstream execution", self.manifest["interface"]["capabilities"])

    def test_legacy_protocol_disabled(self):
=======
    def test_legacy_protocol_and_execution_boundary(self):
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
        self.assertIn("旧 `--profile-json` 协议保持禁用", self.skill)
        self.assertNotIn('flag === "--profile-json"', self.router)
        for text in (
            "禁止调用任何工具或 Skill", "禁止运行命令", "禁止读取或修改文件",
            "建议 Skill 不构成执行授权", "不得自动 handoff", "后续独立一轮",
            "开始执行", "直接修改", "使用这个协议继续", "调用 gen-code 执行",
        ):
            self.assertIn(text, self.skill)
        self.assertNotIn("execution_skill", self.router)

<<<<<<< HEAD
=======
    def test_metadata(self):
        self.assertIn("AI 执行协议", self.agent)
        self.assertIn("任务目标、研发对象、关键关系、检索语义与实现约束", self.agent)
        self.assertEqual(self.manifest["version"].split("+")[0], "0.4.0")
        self.assertIn("One-screen task protocol generation", self.manifest["interface"]["capabilities"])
        self.assertIn("Explicit execution permission gate", self.manifest["interface"]["capabilities"])

    def test_cases(self):
        self.assertGreaterEqual(len(self.cases), 20)

>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)

if __name__ == "__main__":
    unittest.main()
