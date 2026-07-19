import json
import unittest
from pathlib import Path


SKILL = Path(__file__).resolve().parents[1]
PLUGIN = SKILL.parents[1]
ROUTER = SKILL / "scripts/route-company-skills"


class Contract(unittest.TestCase):
    def test_plugin_manifest_and_skill_are_valid(self):
        manifest = json.loads((PLUGIN / ".codex-plugin/plugin.json").read_text())
        self.assertTrue(manifest["name"])
        self.assertIn("name: ai-talk", (SKILL / "SKILL.md").read_text())

    def test_router_is_split_by_responsibility(self):
        expected = {
            "parse-args.mjs",
            "discover-skills.mjs",
            "classify-request.mjs",
            "rank-skills.mjs",
            "collect-context.mjs",
            "build-execution-prompt.mjs",
            "rules.mjs",
        }
        self.assertEqual(expected, {path.name for path in ROUTER.glob("*.mjs")})

    def test_public_result_contract_is_minimal(self):
        source = (ROUTER / "build-execution-prompt.mjs").read_text()
        for field in (
            "original_request", "task_goal", "engineering_judgment",
            "required_knowledge", "retrieval_entries", "intent", "evidence", "recommended_skill",
            "alternative_skills", "selection_reason", "boundaries", "unknowns",
            "stage", "execution_mode", "execution_prompt",
        ):
            self.assertIn(field, source)
        for removed in ("retrieval_query_groups", "business_object", "visual_effect"):
            self.assertNotIn(removed, source)

    def test_rules_are_centralized(self):
        source = (ROUTER / "rules.mjs").read_text()
        for name in ("ui-self-check", "ai-test", "gen-code", "gen-frontend-plan", "figma-analyze"):
            self.assertIn(name, source)
        self.assertIn("CONFUSION_GROUPS", source)

    def test_context_reads_are_bounded(self):
        source = (ROUTER / "collect-context.mjs").read_text()
        for text in ("node_modules", "MAX_DIRECT_DEPENDENCIES", "nearestAgentsFile", "safeFile"):
            self.assertIn(text, source)


if __name__ == "__main__":
    unittest.main()
