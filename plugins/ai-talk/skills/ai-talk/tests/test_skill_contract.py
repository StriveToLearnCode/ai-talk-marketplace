import json
import re
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
PLUGIN_DIR = SKILL_DIR.parents[1]
UI_SKILL_DIR = SKILL_DIR.parent / "ui-self-check"


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
        cls.ui_text = (SKILL_DIR / "references" / "ui-review.md").read_text(
            encoding="utf-8"
        )
        cls.ui_skill_text = (UI_SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        cls.ui_agent_text = (UI_SKILL_DIR / "agents" / "openai.yaml").read_text(
            encoding="utf-8"
        )
        cls.manifest = json.loads(
            (PLUGIN_DIR / ".codex-plugin" / "plugin.json").read_text(
                encoding="utf-8"
            )
        )

    def test_frontmatter_declares_prompt_only_behavior(self):
        frontmatter = self.skill_text.split("---", 2)[1]
        for text in (
            "最多 3 个、每个最多 64KB",
            "不扫描项目或读取依赖",
            "不读取或调用下游 Skill",
            "不访问 Figma、飞书、浏览器或网络",
        ):
            self.assertIn(text, frontmatter)

    def test_frontmatter_declares_evidence_based_mapping(self):
        frontmatter = self.skill_text.split("---", 2)[1]
        for text in (
            "依据用户原话、截图和明确目标文件建立需求对应关系",
            "直接证据、AI 语义判断、建议和待确认信息分层",
            "可复制给后续 Codex 执行的提示词",
        ):
            self.assertIn(text, frontmatter)

    def test_bounded_file_reading_is_explicit(self):
        for text in (
            "## 有界文件读取",
            "最多读取前 3 个直接指定文件",
            "每个文件最多读取一次、最多 64KB",
            "第 4 个及之后的文件不读取",
            "不使用 `rg`、`find`、Glob、目录列表或项目扫描寻找替代文件",
            "不跟踪 import、require、组件引用或配置引用",
            "不读取同目录文件、`AGENTS.md`、`README.md`、`package.json`、项目配置、Git 状态或直接依赖",
            "本地附件和精确本地路径属于读取授权",
        ):
            self.assertIn(text, self.skill_text)

    def test_direct_route_is_tool_free(self):
        self.assertIn("### `direct`", self.skill_text)
        self.assertIn("项目命令数为 0", self.skill_text)
        self.assertIn("一次响应完成，目标 15 秒内", self.skill_text)
        self.assertIn("纯文案、语法、明确机械修改", self.skill_text)

    def test_discovery_allows_only_one_frontmatter_index(self):
        for text in (
            "只允许运行一次 Skill-only 索引",
            "--skills-only",
            "--intent <analyze|plan|modify_and_verify|review>",
            "--skill-limit 10",
            ".agents/skills/**/SKILL.md",
            "忽略正文和缺少 `name` 或 `description` 的 Skill",
            "除一次 Skill-only 索引和有界目标文件读取外",
            "其他项目命令、业务文件读取、reference 读取、额外 Skill 调用和浏览器调用均为 0",
        ):
            self.assertIn(text, self.skill_text)

    def test_downstream_skills_are_never_read_or_invoked(self):
        for text in (
            "不读取候选或已选择 Skill 的 `SKILL.md` 正文",
            "不调用任何下游 Skill",
            "不得读取候选正文来验证模式",
            "不得调用候选",
            "不运行 `collect_context.py`",
            "只允许读取用户明确附带或给出精确本地路径的目标文件",
        ):
            self.assertIn(text, self.skill_text)

    def test_external_tools_are_forbidden(self):
        for text in ("Chrome", "Figma", "飞书", "浏览器", "网络工具"):
            self.assertIn(text, self.skill_text)
        self.assertIn("URL 不属于授权，不打开链接或调用外部工具", self.skill_text)
        self.assertIn("不修改文件", self.skill_text)
        self.assertIn("不运行 formatter、lint、测试、构建", self.skill_text)

    def test_skill_names_are_fenced_prompt_text_only(self):
        self.assertIn(
            "只能作为 fenced `text` 代码块中的文本",
            self.skill_text,
        )
        self.assertIn(
            "Skill 名称即使带 `$` 也只是待复制的提示词文本",
            self.skill_text,
        )
        self.assertIn("$gen-code", self.skill_text)
        self.assertIn("$ai-test", self.skill_text)
        self.assertIn("仅写入提示词，尚未调用", self.skill_text)

    def test_feature_and_test_sequence_is_explicit(self):
        self.assertIn("功能开发与测试同时存在时，先写代码 Skill，再写测试 Skill", self.skill_text)
        self.assertIn("$gen-code` 使用 `local-patch + incremental`", self.skill_text)
        self.assertIn("`$ai-test` 在功能完成后", self.skill_text)
        self.assertLess(self.skill_text.index("$gen-code"), self.skill_text.index("$ai-test"))

    def test_ui_self_check_is_optional_and_requires_explicit_request(self):
        for text in (
            "## 可选 UI 自测 Skill",
            "普通 UI 开发、样式、布局、交互、响应式、截图、Figma 或 Vue 任务默认不追加浏览器自测",
            "只有用户明确要求“UI 自测”“浏览器检查”“Playwright 验证”“页面截图对比”",
            "Figma、截图、视觉、Vue、页面或组件等通用词本身不构成 UI 自测授权",
            "用户未明确要求时省略本步骤",
        ):
            self.assertIn(text, self.skill_text)
        self.assertNotIn("## UI AI 自查交接", self.skill_text)
        self.assertNotIn("UI AI 自查（后续执行阶段", self.skill_text)

        for source in (self.feature_text, self.ui_text):
            self.assertIn("$ai-talk:ui-self-check", source)
            self.assertIn("只有用户明确要求", source)
            self.assertNotIn("UI AI 自查（后续执行阶段", source)

    def test_explicit_ui_self_check_is_ordered_after_code_and_tests(self):
        for text in (
            "功能实现、用户明确要求的目标测试、`$ai-talk:ui-self-check`、PageCenter 配置交接和最终报告",
            "$ai-talk:ui-self-check 只检查不修改",
            "不读取 `ui-self-check/SKILL.md`",
            "不调用该 Skill、Playwright MCP、浏览器或 Chrome",
        ):
            self.assertIn(text, self.skill_text)

    def test_ui_self_check_skill_executes_browser_review(self):
        for text in (
            "实际执行浏览器自测，不生成另一份自测提示词",
            "使用已连接的 Playwright MCP 或等价浏览器能力打开目标 URL",
            "布局、间距、定位、层级、溢出、内容遮挡、页面滚动、响应式和底部安全区",
            "普通态、选中态、禁用态及点击切换",
            "控制台报错、未处理异常和失败请求",
            "没有精确标注时不得声称像素级完全一致",
        ):
            self.assertIn(text, self.ui_skill_text)

    def test_ui_self_check_fix_and_review_modes(self):
        for text in (
            "默认使用 `fix_and_recheck`",
            "用户明确说“只检查”“只报告”“review”或“不修改”时使用 `review_only`",
            "只修复能够由浏览器证据证明、且属于本次目标范围的问题",
            "`review_only` 模式下不得修改代码、配置、测试或快照",
            "修复没有生效时继续定位真实原因",
        ):
            self.assertIn(text, self.ui_skill_text)

    def test_ui_self_check_degrades_without_fabricating_results(self):
        for text in (
            "Playwright MCP、等价浏览器能力、开发服务、测试数据或登录态不可用时",
            "它们不能证明真实 UI 已通过",
            "不伪造 URL、截图、操作过程或通过结论",
            "未执行项、阻塞条件、替代检查和剩余风险",
        ):
            self.assertIn(text, self.ui_skill_text)

    def test_ui_self_check_is_explicit_only(self):
        frontmatter = self.ui_skill_text.split("---", 2)[1]
        self.assertIn("显式调用 $ai-talk:ui-self-check", frontmatter)
        self.assertIn("不得因普通 UI 开发、Figma、截图或 Vue 关键词隐式调用", frontmatter)
        self.assertRegex(
            self.ui_agent_text,
            re.compile(r"policy:\s+allow_implicit_invocation: false", re.MULTILINE),
        )
        self.assertIn("$ai-talk:ui-self-check", self.ui_agent_text)

    def test_generic_skills_are_not_added_implicitly(self):
        self.assertIn(
            "不因 Vue、Figma、文档等通用词追加通用指南、Figma 分析、文档维护或其他辅助 Skill",
            self.skill_text,
        )
        self.assertNotIn("先调用公司组件 Skill", self.skill_text)
        self.assertNotIn("--defer-project-component-choice", self.skill_text)

    def test_prompt_information_is_evidence_layered(self):
        for category in (
            "`直接证据`",
            "`AI 语义判断`",
            "`建议（非需求）`",
            "`待确认信息`",
        ):
            self.assertIn(category, self.skill_text)
        self.assertIn("不生成未经读取的项目事实", self.skill_text)
        self.assertIn("不把 Skill description 中支持的能力扩写成用户需求", self.skill_text)
        self.assertIn("不得伪装成文件事实或用户原话", self.skill_text)
        self.assertIn("不凭空补充业务规则、交互结果、接口字段、验收标准或兼容结论", self.skill_text)

    def test_screenshot_content_is_mapped_instead_of_transcribed(self):
        for text in (
            "## 证据化需求对应",
            "不要把截图或附件当作 OCR 文本仓库",
            "来源或位置 → 直接可见内容 → 对应用户需求 → 转化后的任务指令",
            "不机械抄录全部文字、装饰和无关元素",
            "明确标注各自是现状、目标效果、局部细节还是参考示例",
        ):
            self.assertIn(text, self.skill_text)

        for text in (
            "## 截图语义对应",
            "图片及位置/模块 → 直接可见内容 → 对应需求 → 后续任务指令",
            "不输出完整 OCR 清单",
        ):
            self.assertIn(text, self.ui_text)

    def test_suggestions_never_become_confirmed_requirements(self):
        for source in (self.skill_text, self.clarifying_text, self.feature_text):
            self.assertIn("建议（非需求", source)
        self.assertIn("未经用户确认，不得把建议写成必须实现", self.skill_text)
        self.assertIn("不得转化为必须实现项", self.clarifying_text)
        self.assertIn("不作为必须实现项", self.feature_text)

    def test_handling_modes_are_preserved(self):
        for mode in ("analyze", "plan", "modify_and_verify", "review"):
            self.assertIn(f"`{mode}`", self.skill_text)
        self.assertIn("不得写成“先确认后给方案”", self.skill_text)

    def test_output_contract_stops_after_prompt(self):
        self.assertIn("需求理解与对应：", self.skill_text)
        self.assertIn("已读取上下文：", self.skill_text)
        self.assertIn("AI 语义判断：", self.skill_text)
        self.assertIn("对应关系：", self.skill_text)
        self.assertIn("建议（非需求）：", self.skill_text)
        self.assertIn("待确认信息：", self.skill_text)
        self.assertIn("只列实际读取的文件路径及直接相关结构", self.skill_text)
        self.assertIn("随后只输出一个 fenced `text` 代码块", self.skill_text)
        self.assertIn("代码块必须自包含", self.skill_text)
        self.assertIn("任务话术已生成，当前尚未执行代码修改", self.skill_text)
        self.assertIn("不得继续读取、调用或执行", self.skill_text)
        self.assertIn("不得输出确认、取消、开始等伪交互文案", self.skill_text)

    def test_capability_reference_matches_pure_prompt_mode(self):
        for text in (
            "不是运行时必读材料",
            "只解析 `.agents/skills/**/SKILL.md` frontmatter",
            "业务文件只有在用户明确附带或给出精确路径时",
            "最多 3 个、每个 64KB",
            "AI Talk 不调用 Skill",
            "项目命令最多 1 次",
        ):
            self.assertIn(text, self.capability_text)

    def test_feature_prompt_delegates_real_discovery_downstream(self):
        self.assertIn("$<skill-name>", self.feature_text)
        self.assertIn("local-patch + incremental", self.feature_text)
        self.assertIn("读取组件注册表和真实组件文档", self.feature_text)
        self.assertIn("AI 语义判断：", self.feature_text)
        self.assertIn("证据与对应：", self.feature_text)
        self.assertIn("明确/推导/待确认", self.feature_text)

    def test_feature_prompt_requires_page_center_handoff(self):
        for text in (
            "## PageCenter 配置交接",
            "检查本轮新增或修改的代码是否依赖 PageCenter 配置",
            "不得让用户自行搜索配置项",
            "`text`、`json`、`assets`、`components` 或 `props`",
            "填写值或结构示例",
            "代码消费位置",
            "`新增` / `修改` / `已存在但未验证` 状态",
            "具体操作步骤",
            "无法确认的值标记为 `TODO`",
            "page-center-config.request.json",
            "本次不需要新增或修改 PageCenter 配置",
        ):
            self.assertIn(text, self.skill_text)

        for text in (
            "不得让用户自行搜索配置项",
            "text/json/assets/components/props",
            "代码消费位置",
            "新增/修改/已存在但未验证",
            "具体操作步骤",
            "本次不需要新增或修改 PageCenter 配置",
        ):
            self.assertIn(text, self.feature_text)

    def test_ai_talk_only_delegates_page_center_handoff(self):
        for text in (
            "不得编造 key、值、PageCenter ID 或远端配置状态",
            "不检查业务代码中的 PageCenter 依赖",
            "不生成具体配置项",
            "不调用 `gen-page-center-config` 或 PageCenter MCP",
        ):
            self.assertIn(text, self.skill_text)

    def test_skill_is_explicit_only(self):
        self.assertRegex(
            self.agent_text,
            re.compile(r"policy:\s+allow_implicit_invocation: false", re.MULTILINE),
        )
        self.assertIn("$ai-talk", self.agent_text)

    def test_agent_metadata_matches_evidence_mapping_positioning(self):
        match = re.search(r'short_description: "([^"]+)"', self.agent_text)
        self.assertIsNotNone(match)
        self.assertGreaterEqual(len(match.group(1)), 25)
        self.assertLessEqual(len(match.group(1)), 64)
        for text in (
            "截图",
            "逐项对应",
            "AI 语义判断",
            "待确认信息",
            "不要执行任务",
        ):
            self.assertIn(text, self.agent_text)
        self.assertNotIn("Playwright MCP", self.agent_text)

    def test_plugin_metadata_matches_prompt_only_positioning(self):
        description = self.manifest["interface"]["longDescription"]
        for text in (
            "需求理解",
            "对应关系",
            "frontmatter",
            "最多读取 3 个用户明确",
            "不调用下游 Skill",
            "15 秒",
        ):
            self.assertIn(text, description)
        self.assertTrue(self.manifest["version"].startswith("0.2.0"))
        self.assertIn(
            "Optional companion UI self-check",
            self.manifest["interface"]["capabilities"],
        )


if __name__ == "__main__":
    unittest.main()
