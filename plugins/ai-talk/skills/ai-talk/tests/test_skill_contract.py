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
        cls.manifest = json.loads(
            (PLUGIN_DIR / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8")
        )

    def test_default_flow_confirms_then_continues(self):
        self.assertIn("## 确认后继续", self.skill_text)
        self.assertIn("继续处理", self.skill_text)
        self.assertIn("只生成话术", self.skill_text)
        self.assertIn("调整要求", self.skill_text)
        self.assertIn("确认前不得执行任务或修改业务文件", self.skill_text)
        self.assertIn("不要要求用户复制、粘贴", self.skill_text)

    def test_prompt_only_flow_is_preserved(self):
        self.assertIn("## 话术输出", self.skill_text)
        self.assertIn("一个带 `text` 标识的完整代码块", self.skill_text)
        self.assertNotIn("只生成任务话术。", self.skill_text)

    def test_skill_is_explicit_only(self):
        self.assertRegex(
            self.agent_text,
            re.compile(r"policy:\s+allow_implicit_invocation: false", re.MULTILINE),
        )
        self.assertIn("$ai-talk", self.agent_text)

    def test_plugin_metadata_describes_same_thread_continuation(self):
        self.assertIn("同一线程", self.manifest["description"])
        self.assertIn("无需复制", self.manifest["interface"]["longDescription"])


if __name__ == "__main__":
    unittest.main()
