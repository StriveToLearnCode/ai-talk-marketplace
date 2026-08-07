import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "SKILL.md"
PROTOCOL = ROOT / "references" / "task-state-protocol.md"
AGENT = ROOT / "agents" / "openai.yaml"


class NextStepSkillContract(unittest.TestCase):
    def test_frontmatter_is_compact_and_advertises_trigger_boundaries(self):
        text = SKILL.read_text()
        frontmatter = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
        self.assertIsNotNone(frontmatter)
        self.assertEqual(
            re.findall(r"^([a-z][a-z0-9_-]*):", frontmatter.group(1), re.MULTILINE),
            ["name", "description"],
        )
        for phrase in [
            "name: ai-talk",
            "Use when",
            "发起或继续任何软件研发工作",
            "单轮修改",
            "排查",
            "评审",
            "修改 AI Talk",
            "每次使用都说明这一次具体做了什么",
            "纠正、边界或交接",
            "状态/位置询问",
        ]:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, frontmatter.group(1))

        description = re.search(r"^description: (.+)$", frontmatter.group(1), re.MULTILINE)
        self.assertIsNotNone(description)
        self.assertLessEqual(len(description.group(1)), 120)
        self.assertNotIn("单轮局部任务、状态询问和 AI Talk 元讨论不触发", frontmatter.group(1))

    def test_main_skill_keeps_only_the_core_decision_flow(self):
        text = SKILL.read_text()
        for phrase in [
            "每次研发请求先加载本 Skill 一次",
            "是否加载",
            "是否持久化",
            "完成1I",
            "只维护会改变下一步实现、验证、范围或授权的信息",
            "绑定一个目标",
            "`goal`",
            "`boundaries`",
            "`acceptance`",
            "`bindings`",
            "用户已给出的内容直接采用",
            "才问一个决定性问题",
            "不建立状态",
            "仍需说明 AI Talk 本轮具体明确了什么",
            "不得把“不持久化”或“不输出状态”误判为没有可见贡献",
            "外部写入默认未授权",
        ]:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

        self.assertLessEqual(len(text.splitlines()), 90)
        self.assertLessEqual(len(text), 8000)

    def test_persistence_details_are_progressively_disclosed(self):
        text = SKILL.read_text()
        self.assertIn("[状态协议](references/task-state-protocol.md)", text)
        self.assertIn("先完整读取", text)
        self.assertIn("脚本路径必须相对本 Skill 目录解析", text)
        self.assertNotIn("task_state:\n", text)
        self.assertNotIn("task-state.mjs save", text)

        protocol = PROTOCOL.read_text()
        self.assertIn("需要持久化、恢复、修改或预检任务状态时，完整读取本文件", protocol)
        self.assertIn("## 目录", protocol)
        self.assertIn("task_state:\n", protocol)
        self.assertIn("task-state.mjs save", protocol)

    def test_mid_task_correction_preserves_a_and_removes_only_b(self):
        text = SKILL.read_text()
        for phrase in [
            "停，保留 A，撤掉 B",
            "立即停止未执行动作",
            "保护为 `confirmed_results`",
            "禁止 `boundaries`",
            "最新 `corrections` 和唯一 `next_action`",
            "重读当前 diff 和目标文件",
            "用户原有改动和并行改动",
            "全量 reset 或无差别回滚",
            "只问一个决定性问题",
        ]:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_state_schema_is_bounded_to_next_step_information(self):
        text = PROTOCOL.read_text()
        for field in [
            "task_key",
            "status",
            "goal",
            "confirmed_results",
            "corrections",
            "boundaries",
            "acceptance",
            "next_action",
            "bindings",
        ]:
            with self.subTest(field=field):
                self.assertIn(field, text)

        self.assertIn("每类最多 8 项", text)
        self.assertIn(
            "不要增加 `facts / evidence / hypotheses / decisions / changes / todos / "
            "risks / references / user_state`",
            text,
        )
        self.assertIn("`goal` 永远只有一个", text)
        self.assertIn("`next_action` 永远只有一个", text)

    def test_state_is_persisted_restored_and_preflighted_outside_the_repo(self):
        text = PROTOCOL.read_text()
        for phrase in [
            "不能只在对话中声称“已记录”",
            "<skill-dir>/scripts/task-state.mjs save",
            "<skill-dir>/scripts/task-state.mjs load",
            "<skill-dir>/scripts/task-state.mjs list",
            "<skill-dir>/scripts/task-state.mjs preflight",
            "~/.codex/ai-talk-state/",
            "不会制造业务仓库文件",
            "首次形成完整状态",
            "上下文压缩或交接前",
            "`status: complete`",
            "不得合并不同任务的状态",
        ]:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_preflight_protects_confirmed_results_before_code_changes(self):
        main = SKILL.read_text()
        protocol = PROTOCOL.read_text()
        for phrase in [
            "每次首次修改目标代码前",
            "不可回归项和禁止边界作为编辑约束",
            "目标文件指纹变化",
            "修改者视为未知",
            "重读现状并合并",
            "不为执行 `preflight` 创建空状态",
            "不虚构保护项",
        ]:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, main)
        self.assertIn("比较保存时的目标文件指纹", protocol)
        self.assertIn("变化不自动废除保护项", protocol)

    def test_natural_language_and_source_priority_remain_explicit(self):
        main = SKILL.read_text()
        protocol = PROTOCOL.read_text()
        self.assertIn("每一次实际使用 AI Talk，都必须用一句自然语言说明这一次具体明确、补充或保护了什么", main)
        self.assertIn("让用户能直接感知它的作用", main)
        self.assertIn("随后在紧接着的下一段输出 `AI Talk 分析结果：<本次具体作用>`", main)
        self.assertIn("然后才能开始业务目录定位、源码检索、实现或验证", main)
        self.assertIn("中间不得插入任务 Agent 的进度说明或工具调用", main)
        self.assertIn("不能只说“会按 AI Talk 执行”或“已读取 Skill”", main)
        self.assertIn("不能用与当前任务无关的通用套话代替具体贡献", main)
        self.assertIn("最终总结不能承担本轮首次 AI Talk 贡献说明", main)
        self.assertIn("没有持久化时也可以直接说明目标和验收", main)
        self.assertIn("不冒领任务 Agent 的搜索、编码、测试或发布", main)
        self.assertIn("`AI Talk 目标补充为：<当前唯一目标>`", main)
        self.assertIn("同一轮不重复播报", main)
        self.assertIn("用户最新明确要求高于旧实现、旧交接和持久状态", main)
        self.assertIn("用户确认代表需求权威，但不自动证明远端现状", protocol)
        self.assertIn("不能扩大目标、范围或授权", protocol)
        self.assertIn("当前消息覆盖冲突字段", protocol)
        self.assertIn("位置现在对了，不要再动布局", protocol)
        self.assertIn("四个奖励名称已经显示", protocol)

    def test_runtime_resources_are_bounded(self):
        self.assertEqual(
            sorted(path.name for path in (ROOT / "references").glob("**/*") if path.is_file()),
            ["task-state-protocol.md"],
        )
        self.assertEqual(
            sorted(path.name for path in (ROOT / "scripts").glob("**/*") if path.is_file()),
            [
                "collect-task-context.mjs",
                "install-skill.mjs",
                "locate-company-components.mjs",
                "task-state.mjs",
            ],
        )
        self.assertEqual(
            sorted(path.name for path in (ROOT / "tests").glob("test_*")),
            [
                "test_component_locator.mjs",
                "test_install_skill.mjs",
                "test_skill_contract.py",
                "test_task_context.mjs",
                "test_task_state.mjs",
                "test_trigger_contract.mjs",
            ],
        )

    def test_interface_matches_next_step_capability(self):
        text = AGENT.read_text()
        for phrase in [
            'display_name: "AI Talk"',
            "每次使用都说明这一次具体做了什么",
            "复杂状态持续保护",
            "下一段立刻输出 `AI Talk 分析结果：<本次具体作用>`",
            "再开始业务检索或实现",
            "不能拖到最终总结",
            "仅在纠正、边界、已确认结果或跨上下文时持久化状态",
            "allow_implicit_invocation: true",
        ]:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

        short_description = re.search(r'short_description: "([^"]+)"', text)
        self.assertIsNotNone(short_description)
        self.assertGreaterEqual(len(short_description.group(1)), 25)
        self.assertLessEqual(len(short_description.group(1)), 64)


if __name__ == "__main__":
    unittest.main()
