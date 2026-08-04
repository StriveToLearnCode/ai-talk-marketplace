import json
import re
import unittest
from pathlib import Path


SKILL = Path(__file__).resolve().parents[1]
SKILL_MD = SKILL / "SKILL.md"
AGENT = SKILL / "agents" / "openai.yaml"
REFERENCES = SKILL / "references"
SCRIPTS = SKILL / "scripts"
CASES = SKILL / "tests" / "intervention-boundary-cases.json"


class StandaloneSkillContract(unittest.TestCase):
    def test_skill_frontmatter_and_interface(self):
        skill = SKILL_MD.read_text()
        frontmatter = re.match(r"^---\n(.*?)\n---", skill, re.DOTALL)
        self.assertIsNotNone(frontmatter)
        self.assertEqual(
            re.findall(r"^([a-z][a-z0-9_-]*):", frontmatter.group(1), re.MULTILINE),
            ["name", "description"],
        )
        self.assertIn("name: ai-talk", frontmatter.group(1))
        self.assertIn("每一轮用户对话", frontmatter.group(1))
        self.assertIn("复杂研发任务", frontmatter.group(1))

        agent = AGENT.read_text()
        self.assertIn('display_name: "AI Talk"', agent)
        self.assertIn('default_prompt: "使用 $ai-talk', agent)
        self.assertIn("allow_implicit_invocation: true", agent)
        short_description = re.search(r'short_description: "([^"]+)"', agent)
        self.assertIsNotNone(short_description)
        self.assertLessEqual(25, len(short_description.group(1)))
        self.assertLessEqual(len(short_description.group(1)), 64)

    def test_every_turn_has_exactly_one_visible_status(self):
        skill = SKILL_MD.read_text()
        self.assertIn("每个用户回合必须调用本 Skill 一次", skill)
        self.assertIn("第一条可见助手回复的首行", skill)
        self.assertIn("后续进度更新和最终回复不得重复状态行", skill)
        self.assertIn("`AI Talk：跳过`", skill)
        self.assertIn("`AI Talk：介入`", skill)

        protocols = (REFERENCES / "execution-protocols.md").read_text()
        self.assertIn("print exactly one status line", protocols)
        self.assertIn("`AI Talk：跳过`", protocols)
        self.assertIn("`AI Talk：介入`", protocols)

    def test_runtime_resources_are_complete(self):
        required = [
            REFERENCES / "requirement-contract.md",
            REFERENCES / "target-binding.md",
            REFERENCES / "execution-protocols.md",
            SCRIPTS / "contract-check.mjs",
            SCRIPTS / "scope-guard.mjs",
        ]
        for path in required:
            with self.subTest(path=path.name):
                self.assertTrue(path.is_file())

        skill = SKILL_MD.read_text()
        self.assertIn("RequirementContract 1.5", skill)
        self.assertIn("references/requirement-contract.md", skill)
        self.assertIn("scripts/contract-check.mjs validate", skill)

        protocols = (REFERENCES / "execution-protocols.md").read_text()
        self.assertIn("scripts/scope-guard.mjs snapshot", protocols)
        self.assertIn("Completion reconciliation", protocols)

    def test_runtime_has_no_plugin_layout_dependency(self):
        runtime_files = [SKILL_MD, AGENT]
        runtime_files.extend(REFERENCES.glob("*.md"))
        runtime_files.extend(SCRIPTS.rglob("*.mjs"))
        forbidden = (
            "plugins/ai-talk",
            "ai-talk-public-marketplace",
            ".codex-plugin",
            "install-strict-mode",
            "report-feedback.mjs",
        )
        for path in runtime_files:
            text = path.read_text()
            for token in forbidden:
                with self.subTest(path=path.relative_to(SKILL), token=token):
                    self.assertNotIn(token, text)

    def test_trigger_boundary_corpus_matches_skill_purpose(self):
        fixture = json.loads(CASES.read_text())
        cases = fixture["cases"]
        simple = [case for case in cases if case["cohort"] == "simple_negative"]
        complex_cases = [case for case in cases if case["cohort"] == "complex_positive"]

        self.assertEqual(len(simple), 20)
        self.assertEqual(len(complex_cases), 20)
        self.assertEqual(fixture["invocation_scope"], "every_user_turn")
        self.assertEqual(fixture["simple_acceptance"]["status"], "AI Talk：跳过")
        self.assertEqual(fixture["complex_acceptance"]["status_prefix"], "AI Talk：介入")
        self.assertTrue(all(not case["expected_material_intervention"] for case in simple))
        self.assertTrue(all(case["expected_material_intervention"] for case in complex_cases))
        self.assertTrue(all(case["expected_artifact"] for case in complex_cases))


if __name__ == "__main__":
    unittest.main()
