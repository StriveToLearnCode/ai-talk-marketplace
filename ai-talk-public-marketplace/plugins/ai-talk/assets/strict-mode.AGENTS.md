<!-- ai-talk-strict-mode:start -->
## AI Talk Strict Mode

For every user message that starts or continues software-development work, apply the installed
`$ai-talk:ai-talk` skill exactly once before task-specific analysis, repository search, tool use,
planning, or implementation.

- Let AI Talk pass status questions, confirmations, and implementation-neutral context through
  unchanged.
- Let AI Talk release clear local work with a resolved target through the no-contract Fast Path. Create or
  revise a requirement contract only for unresolved visual references, quoted, cross-module, scope-bounded,
  diagnostic, or ambiguous work.
- Do not invoke AI Talk again during internal handoffs or downstream execution.
- Do not invoke AI Talk for non-development conversation.
- If the skill is unavailable, report that strict mode could not run instead of silently claiming
  that the message passed the gate.
<!-- ai-talk-strict-mode:end -->
