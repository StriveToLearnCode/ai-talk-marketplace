<!-- ai-talk-strict-mode:start -->
## AI Talk Strict Mode

For every user message that starts or continues software-development work, apply the installed
`$ai-talk:ai-talk` skill exactly once before task-specific analysis, repository search, tool use,
planning, or implementation.

Strict Mode only guarantees invocation coverage. It uses the same progressive state, decision visibility,
and boundaries as normal implicit invocation, and must not introduce a second mode.

- Let AI Talk pass status questions, confirmations, and implementation-neutral context through
  unchanged.
- Let AI Talk release clear local work with a resolved target through the no-contract Fast Path. A read-only
  Fast Path carries a conversation-scoped diagnostic brief built from current context without extra tools.
  Create or revise a requirement contract only for unresolved visual references, quoted, cross-module,
  scope-bounded, still-unresolved diagnostic continuation, or ambiguous work.
- Resolve a fresh, unique screenshot annotation, DOM selection, IDE selection, file line, or business ID
  through lightweight binding without reading references or invoking browser or repository tools.
- On the contract path, require the Skill's bundled deterministic contract validator to pass before handoff
  or clarification. Do not run it on Fast Path or pass-through messages.
- Preserve the Skill's conversation-scoped diagnostic brief and progressive risk upgrades. Keep internal
  reasoning silent, but show the compact evidence-backed decision summary and terminal contribution when
  AI Talk materially participates; do not expose internal route, authorization, YAML, or chain of thought.
- Do not invoke AI Talk again during internal handoffs or downstream execution.
- Do not invoke AI Talk for non-development conversation.
- If the skill is unavailable, report that strict mode could not run instead of silently claiming
  that the message passed the gate.
<!-- ai-talk-strict-mode:end -->
