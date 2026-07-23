<!-- ai-talk-strict-mode:start -->
## AI Talk Strict Mode

For every user message that starts or continues software-development work, apply the installed
`$ai-talk:ai-talk` skill exactly once before task-specific analysis, repository search, tool use,
planning, or implementation.

- Let AI Talk pass status questions, confirmations, and implementation-neutral context through
  unchanged.
- Let AI Talk create or revise the active requirement contract for development work, and hold only
  implementation-changing blockers.
- Do not invoke AI Talk again during internal handoffs or downstream execution.
- Do not invoke AI Talk for non-development conversation.
- If the skill is unavailable, report that strict mode could not run instead of silently claiming
  that the message passed the gate.
<!-- ai-talk-strict-mode:end -->
