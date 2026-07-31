# FeedbackEnvelope 1.0

This runtime-only sidecar collects user feedback about AI Talk without changing `RequirementContract 1.4`. Feedback is not a development request and must not create or revise a requirement contract. The AI Talk Skill does not read this file; only an installed Stop Hook or host adapter uses this protocol.

## Runtime ownership

The AI Talk Skill passes feedback replies and preference changes through unchanged. The installed Stop Hook or host
adapter owns classification, preference changes, and delivery. The executing Agent must not run an eligibility command
at task completion.

An installed Stop Hook or host adapter may check eligibility with the real terminal outcome:

```bash
node ../../scripts/report-feedback.mjs --should-ask --outcome completed
```

Only the runtime component acts when it returns `{"ask":true,...}`. By default, eligibility requires an HTTPS endpoint plus `AI_TALK_FEEDBACK_CONSENT=1`; `partial`, `failed`, and `blocked` outcomes are then always eligible, while `completed` is sampled at 20%. `AI_TALK_FEEDBACK_SAMPLE_RATE` may set a value from `0` to `1`. `AI_TALK_FEEDBACK_PROMPT=1` explicitly enables local-only evaluation without an endpoint, and `AI_TALK_FEEDBACK_PROMPT=0` disables all prompts.

Ask at most once after an eligible contract-path task reaches a terminal user-facing outcome. Fast Path tasks never run the reporter. Do not ask after a status update, confirmation, hard-blocker clarification, non-development message, intermediate progress update, unsampled completion, or another feedback response.

The host adapter supplies `ai_talk_task_id`, `ai_talk_route: contract`, and `ai_talk_outcome` to the
Stop Hook. The Skill and executing Agent do not append routing or eligibility markers. The Hook may
use the following markers in its one-time append instruction for compatibility:

```text
On the terminal response for this task, append the feedback question once and preserve both markers:
<!-- ai-talk-feedback:eligible -->
AI Talk 对这次需求理解和执行交接有帮助吗？回复“有帮助 / 一般 / 没帮助”，可补充原因。 <!-- ai-talk-feedback:asked -->
```

The optional project-level `Stop` Hook owns eligibility checks. It acts only when the host supplies the
routed task ID, contract route, and terminal outcome; a stop event alone is not evidence of completion.
Legacy eligible markers remain supported. Codex does not discover hooks from a Skill or plugin bundle
as a guaranteed configuration layer; users must explicitly install it into the target project's
`.codex/hooks.json` before relying on it.

If the user says `不再询问`, `关闭反馈询问`, or an equivalent opt-out, run:

```bash
node ../../scripts/report-feedback.mjs --preference off
```

Use `--preference on` only when the user explicitly enables the prompt again.

## Feedback routing

When the immediately preceding assistant response asked the feedback question:

- `有帮助`, `有用`, or an equivalent positive answer maps to `helpful`.
- `一般`, `部分有用`, or an equivalent mixed answer maps to `neutral`.
- `没帮助`, `无帮助`, `不好用`, or an equivalent negative answer maps to `unhelpful`.
- Preserve a short user explanation as `user_comment`, but never include the full transcript.
- Derive categories only when the user's words support them. Otherwise use `unclassified`.
- Do not ask the user to repeat a comment. A bare rating is a valid report.
- Do not route feedback to `gen-code`, run repository retrieval, or create RequirementContract YAML.

Supported categories are:

- `helpful`
- `unclassified`
- `misclassified_intent`
- `unnecessary_clarification`
- `wrong_target_binding`
- `insufficient_evidence`
- `failed_handoff`
- `repeated_work`
- `technical_error`

## Shape

Write only the following keys to the temporary JSON input consumed by `report-feedback.mjs`:

```yaml
feedback_version: "1.0"
feedback_id: generated when omitted
created_at: generated when omitted
plugin_version: "0.5.0+codex.example"
source: user_feedback
contract_result: handoff
mode: modify_and_verify
outcome: completed
rating: unhelpful
categories:
  - unnecessary_clarification
user_comment: 已经选中 DOM，仍然让我重新描述
error_codes: []
sanitized_context: 目标绑定阶段发生了重复澄清
```

Use `user_feedback` or `technical_error` for `source`; `helpful`, `neutral`, or `unhelpful` for a user rating; and `completed`, `partial`, `failed`, or `blocked` for the outcome. Keep unavailable fields `null` or empty.

## Delivery

Run the bundled reporter with a temporary JSON file:

```bash
node ../../scripts/report-feedback.mjs --input /absolute/path/to/feedback.json
```

The reporter allowlists fields, caps lengths, redacts common credentials and sensitive URL parameters, and then chooses delivery:

1. Without an endpoint, store an explicitly submitted envelope as one private file in the local `feedback-spool/pending` directory. Do not proactively ask unless local-only evaluation was explicitly enabled.
2. With `AI_TALK_FEEDBACK_ENDPOINT` but without `AI_TALK_FEEDBACK_CONSENT=1`, keep it local.
3. With an HTTPS endpoint and explicit consent, POST the envelope. A failed delivery returns it to the local spool.
4. Allow plain HTTP only for localhost development.

Never include source code, diffs, commands, tool output, raw URLs with secrets, attachments, DOM contents, or a full conversation transcript. The default project hook installs only the `Stop` safety net. A host adapter may call the bundled `PostToolUse` handler only when it supplies an `ai_talk_task_id`; without that routed-task identifier, tool errors are ignored and must not be attributed to AI Talk. Consent or explicit local-only evaluation is still required before recording the metadata.

After submission, tell the user whether feedback was `uploaded` or `queued_local`. Do not claim successful remote delivery for a local queue result.
