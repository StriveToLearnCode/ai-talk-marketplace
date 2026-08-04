import json
import unittest
from pathlib import Path


TESTS = Path(__file__).resolve().parent
CASES = TESTS / "intervention-boundary-cases.json"


class InterventionBoundary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(CASES.read_text())
        cls.cases = cls.fixture["cases"]

    def test_corpus_has_twenty_simple_and_twenty_complex_cases(self):
        self.assertEqual(len(self.cases), 40)
        self.assertEqual(len({case["id"] for case in self.cases}), 40)
        self.assertEqual(
            sum(case["cohort"] == "simple_negative" for case in self.cases),
            20,
        )
        self.assertEqual(
            sum(case["cohort"] == "complex_positive" for case in self.cases),
            20,
        )

    def test_every_development_turn_invokes_ai_talk_once(self):
        self.assertEqual(
            self.fixture["invocation_scope"],
            "every_development_turn",
        )

    def test_simple_cases_show_skip_without_material_intervention(self):
        self.assertEqual(self.fixture["simple_acceptance"], {
            "skill_reads_exact": 1,
            "reference_reads_max": 0,
            "ai_talk_tool_calls_max": 0,
            "visible_protocol_messages_max": 0,
        })
        simple = [
            case for case in self.cases if case["cohort"] == "simple_negative"
        ]
        for case in simple:
            with self.subTest(case=case["id"]):
                self.assertFalse(case["expected_material_intervention"])
                self.assertIsNone(case["trigger"])
                self.assertIsNone(case["expected_artifact"])

        messages = "\n".join(case["message"] for case in simple)
        self.assertIn("文字颜色", messages)
        self.assertIn("Cannot read properties of undefined", messages)

    def test_complex_cases_require_risk_signal_and_reusable_artifact(self):
        complex_cases = [
            case for case in self.cases if case["cohort"] == "complex_positive"
        ]
        required_triggers = {
            "product_semantics_ambiguity",
            "cross_module_behavior",
            "long_task_continuation",
            "external_write",
            "production_operation",
            "scope_drift_risk",
        }
        triggers = {case["trigger"] for case in complex_cases}
        self.assertLessEqual(required_triggers, triggers)

        allowed_artifacts = {
            "requirement_contract",
            "active_task_state",
            "diagnostic_evidence_chain",
            "scope_boundary",
            "external_write_boundary",
            "stable_target_binding",
        }
        for case in complex_cases:
            with self.subTest(case=case["id"]):
                self.assertTrue(case["expected_material_intervention"])
                self.assertTrue(case["trigger"])
                self.assertIn(case["expected_artifact"], allowed_artifacts)

        self.assertEqual(self.fixture["complex_acceptance"], {
            "required_artifact": True,
            "material_summary_messages_max": 1,
            "terminal_contribution_prefix": "AI Talk 帮我们补全了：",
            "metrics": {
                "rework_count": "decrease",
                "repeated_confirmation_count": "decrease",
                "out_of_scope_change_count": "decrease",
                "context_loss_count": "decrease",
            },
        })

    def test_terminal_contribution_names_the_fields_ai_talk_filled(self):
        acceptance = self.fixture["terminal_contribution_acceptance"]
        allowed = set(acceptance["allowed_labels"])
        prefix = self.fixture["complex_acceptance"]["terminal_contribution_prefix"]

        def is_valid(line):
            if not line.startswith(prefix):
                return False
            if any(phrase in line for phrase in acceptance["forbidden_phrases"]):
                return False
            items = line.removeprefix(prefix).split("；")
            filled = []
            for item in items:
                label, separator, value = item.partition("：")
                if not separator or label not in allowed or not value.strip():
                    return False
                filled.append((label, value))
            return len(filled) >= acceptance["minimum_filled_items"]

        for case in acceptance["cases"]:
            with self.subTest(case=case["id"]):
                self.assertEqual(is_valid(case["line"]), case["expected_valid"])

if __name__ == "__main__":
    unittest.main()
