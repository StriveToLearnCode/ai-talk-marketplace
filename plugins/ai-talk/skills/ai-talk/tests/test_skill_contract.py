import json, unittest
from pathlib import Path
S=Path(__file__).resolve().parents[1]; P=S.parents[1]
class Contract(unittest.TestCase):
 @classmethod
 def setUpClass(c):
  c.skill=(S/"SKILL.md").read_text(); c.agent=(S/"agents/openai.yaml").read_text(); c.router=(S/"scripts/route-company-skills.mjs").read_text(); c.manifest=json.loads((P/".codex-plugin/plugin.json").read_text()); c.cases=json.loads((S/"tests/company-skill-routing-cases.json").read_text())
 def test_profile(c):
  for f in ("task_action","target_category","desired_output","execution_mode","evidence_types","intent_terms","exclusion_terms","unknowns"): c.assertIn("`"+f+"`",c.skill); c.assertIn(f+":",c.router)
 def test_scope(c):
  for x in (".agents/skills/**/SKILL.md","显式批准的公司 Skill 根","ui-self-check","只解析 `SKILL.md` frontmatter","触发条件/适用场景","不读取其他正文、references、脚本或知识库","不索引 `plugins/ai-talk/docs/skills/`","重复 `name`"): c.assertIn(x,c.skill)
 def test_output(c):
  for x in ("推荐 Skill：","备选 Skill：","推荐依据：","排除相近 Skill：","待确认：","索引冲突："): c.assertIn(x,c.skill)
  c.assertIn("不得输出 `<details>`",c.skill); c.assertIn("短 Prompt",c.skill)
 def test_boundaries(c):
  for x in ("midscene-test.ts","ai-test","ui-self-check","docs/plan/","gen-frontend-plan","gen-code","Figma 只作为开发证据","PageCenter 配置/推送产物","活动积木或 uiMeta","“测一下”是泛化词"): c.assertIn(x,c.skill)
 def test_no_execution(c):
  for x in ("不要扩展 Prompt Builder","不调用推荐或备选 Skill","Context Builder","组件库","自定义 UI"): c.assertIn(x,c.skill)
 def test_metadata(c):
  c.assertIn("Top 1",c.agent); c.assertEqual(c.manifest["version"].split("+")[0],"0.3.0"); c.assertIn("Zero downstream execution",c.manifest["interface"]["capabilities"])
 def test_cases(c): c.assertGreaterEqual(len(c.cases),20)
if __name__=="__main__": unittest.main()
