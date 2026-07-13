const MODE_LABELS = {
  analyze: "只分析",
  plan: "先给方案",
  modify_and_verify: "修改并验证",
  review: "只审查",
};

const CAPABILITY_PREFERENCES = new Set([
  "prefer_reuse",
  "prefer_reference",
  "excluded",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanScope(value) {
  const items = Array.isArray(value) ? value : String(value ?? "").split("\n");
  return items
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function composeTaskPrompt(card) {
  const lines = [
    `任务目标：${card.goal}`,
    `任务类型：${card.task_type.label}`,
    `执行方式：${card.execution.label}`,
    `任务范围：${card.scope.join("、")}`,
  ];

  if (card.adjustable.use_capabilities) {
    const skills = card.internal_skills.map((item) => item.name);
    const reusable = card.reusable_capabilities
      .filter((item) => item.user_choice !== "excluded")
      .map((item) => item.name);
    if (skills.length) lines.push(`内部 Skill：${skills.join("、")}`);
    if (reusable.length) {
      lines.push(`可复用能力：${reusable.join("、")}；实现前验证兼容性。`);
    }
  }

  if (card.constraints.length) {
    lines.push(`关键约束：${card.constraints.join(" ")}`);
  }
  if (card.risks.length) {
    lines.push(`风险与未确认信息：${card.risks.join(" ")}`);
  }
  lines.push("请按上述范围处理；不要扩展到未确认范围，并在完成后说明修改与验证结果。");
  return lines.join("\n");
}

export function normalizeTaskCard(input) {
  if (!input || typeof input !== "object") {
    throw new Error("confirmation must be an object");
  }
  if (!["ready", "needs_confirmation", "blocked"].includes(input.state)) {
    throw new Error("confirmation.state is invalid");
  }

  const card = clone(input);
  card.schema_version = 1;
  card.presentation = card.presentation === "bypass" ? "bypass" : "card";
  card.goal = String(card.goal ?? "").trim();
  card.scope = cleanScope(card.scope);
  card.constraints = Array.isArray(card.constraints) ? card.constraints.slice(0, 5) : [];
  card.risks = Array.isArray(card.risks) ? card.risks.slice(0, 5) : [];
  card.unconfirmed = Array.isArray(card.unconfirmed) ? card.unconfirmed.slice(0, 5) : [];
  card.internal_skills = Array.isArray(card.internal_skills) ? card.internal_skills : [];
  card.reusable_capabilities = Array.isArray(card.reusable_capabilities)
    ? card.reusable_capabilities
    : [];
  card.automatic_capabilities = Array.isArray(card.automatic_capabilities)
    ? card.automatic_capabilities
    : [];
  card.choice_required = Array.isArray(card.choice_required) ? card.choice_required : [];
  card.decision_requirements = card.decision_requirements ?? {
    capability_choice_ids: [],
    rule_conflict: false,
  };
  card.adjustable = card.adjustable ?? {};
  card.adjustable.execution_mode = MODE_LABELS[card.adjustable.execution_mode]
    ? card.adjustable.execution_mode
    : card.execution?.mode ?? "plan";
  card.adjustable.execution_mode_options = Object.keys(MODE_LABELS);
  card.adjustable.scope = cleanScope(card.adjustable.scope ?? card.scope);
  card.adjustable.use_capabilities = card.adjustable.use_capabilities !== false;
  card.adjustable.capability_preferences =
    card.adjustable.capability_preferences ?? {};
  card.actions = card.actions ?? {};
  card.task_prompt = composeTaskPrompt(card);
  return card;
}

export function applyTaskCardAdjustments(inputCard, adjustments = {}) {
  const card = normalizeTaskCard(inputCard);
  const mode = adjustments.execution_mode;
  if (mode !== undefined) {
    if (!MODE_LABELS[mode]) throw new Error("execution_mode is invalid");
    card.execution = { mode, label: MODE_LABELS[mode] };
    card.adjustable.execution_mode = mode;
  }

  if (adjustments.scope !== undefined) {
    const scope = cleanScope(adjustments.scope);
    if (!scope.length) throw new Error("scope must contain at least one item");
    card.scope = scope;
    card.adjustable.scope = scope;
  }

  if (adjustments.use_capabilities !== undefined) {
    if (typeof adjustments.use_capabilities !== "boolean") {
      throw new Error("use_capabilities must be a boolean");
    }
    card.adjustable.use_capabilities = adjustments.use_capabilities;
  }

  const allowedIds = new Set(
    card.choice_required.map((item) => item.id).filter(Boolean),
  );
  const preferences = adjustments.capability_preferences ?? {};
  for (const [id, preference] of Object.entries(preferences)) {
    if (!allowedIds.has(id)) continue;
    if (!CAPABILITY_PREFERENCES.has(preference)) {
      throw new Error(`capability preference for ${id} is invalid`);
    }
    card.adjustable.capability_preferences[id] = preference;
    for (const collection of [card.choice_required, card.reusable_capabilities]) {
      const item = collection.find((candidate) => candidate.id === id);
      if (item) {
        item.user_choice = preference;
        item.usage_preference = preference;
        item.selection_source = "user";
      }
    }
  }

  const pendingIds = card.decision_requirements.capability_choice_ids ?? [];
  const choicesResolved =
    !card.adjustable.use_capabilities ||
    pendingIds.every((id) =>
      CAPABILITY_PREFERENCES.has(card.adjustable.capability_preferences[id]),
    );
  const conflictResolved =
    !card.decision_requirements.rule_conflict ||
    typeof adjustments.use_capabilities === "boolean";
  const scopeResolved =
    !card.decision_requirements.scope_risk ||
    (adjustments.scope !== undefined && cleanScope(adjustments.scope).length > 0);

  if (card.state !== "blocked" && choicesResolved && conflictResolved && scopeResolved) {
    card.state = "ready";
    card.risks = card.risks.filter((risk) => !risk.includes("尚未确认"));
    card.unconfirmed = card.unconfirmed.filter((risk) => !risk.includes("尚未确认"));
  }

  card.actions.start_execution = {
    enabled: card.state === "ready",
    requires_click: true,
  };
  card.actions.insert_into_composer = {
    enabled: card.state !== "blocked",
    host_api: "unavailable",
    fallback: "copy_to_clipboard",
    auto_send: false,
  };
  card.task_prompt = composeTaskPrompt(card);
  return card;
}

export function createTaskCardStore() {
  const cards = new Map();
  let sequence = 0;

  return {
    create(input) {
      const card = normalizeTaskCard(input);
      sequence += 1;
      card.card_id = `ai-talk-${Date.now()}-${sequence}`;
      card.state_version = 1;
      cards.set(card.card_id, clone(card));
      return clone(card);
    },
    adjust(cardId, adjustments) {
      const current = cards.get(cardId);
      if (!current) throw new Error("task card was not found or has expired");
      const next = applyTaskCardAdjustments(current, adjustments);
      next.card_id = cardId;
      next.state_version = current.state_version + 1;
      cards.set(cardId, clone(next));
      return clone(next);
    },
    get(cardId) {
      const card = cards.get(cardId);
      return card ? clone(card) : null;
    },
  };
}
