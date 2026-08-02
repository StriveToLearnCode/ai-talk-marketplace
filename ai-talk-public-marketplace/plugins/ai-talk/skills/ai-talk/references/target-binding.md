# Target Binding

Bind visual references to `RequirementContract 1.4.target_refs` so the executing Agent does not need to guess what “这里”, “这两部分”, or “第二个头像” means.

## Shape

Each target reference uses the exact keys below:

```json
{
  "id": "target_1",
  "label": "voice 区第二个用户头像",
  "source": "dom_selection",
  "attachment": null,
  "browser": {
    "url": "https://example.test/activity?tab=voice",
    "route": "/activity",
    "viewport": {"width": 390, "height": 844},
    "page_state": ["voice tab active"],
    "frame_path": [],
    "captured_at": "2026-07-22T09:00:00+08:00"
  },
  "dom": {
    "selector": "[data-role=\"user-avatar\"]",
    "match_ordinal": 2,
    "strategy": "data_attribute",
    "fingerprint": {
      "tag_name": "img",
      "role": "img",
      "accessible_name": "用户头像",
      "stable_attributes": {"data-role": "user-avatar"}
    }
  }
}
```

- Use `screenshot_annotation`, `dom_selection`, or `browser_context` for `source`.
- Use stable IDs `target_1`, `target_2`, and so on. Preserve IDs and order while updating the same contract.
- Use `null` for an unavailable `attachment`, `browser`, or `dom` object. Do not invent a cross-source binding.

## Screenshot annotations

Use this exact attachment shape:

```json
{
  "attachment_id": "attachment_1",
  "annotation_id": "annotation_1",
  "bounds": {"x": 0.08, "y": 0.21, "width": 0.36, "height": 0.12, "unit": "ratio"},
  "image_size": {"width": 1170, "height": 2532}
}
```

- Assign stable attachment and annotation IDs in conversation order.
- Store normalized ratio bounds and the original pixel size. Clamp every ratio value to `[0, 1]`.
- Create one target reference per marked region. “这两部分” with two annotations must produce two references, not one merged description.
- A screenshot proves only the marked visual region. Keep `browser` and `dom` null unless separately observed.

## DOM selection

- Capture the selected node from the current browser without clicking or mutating business state.
- Prefer selector strategies in this order: `test_id`, `data_attribute`, `id`, `accessible`, `semantic`, `css_fallback`.
- Never use a dynamic class, generated ID, absolute XPath, or `nth-child` as the primary selector.
- When the stable selector matches a group and the user refers to an ordinal item, store the 1-based `match_ordinal`. Do not encode the ordinal in a brittle selector.
- Record `tag_name`, role, accessible name, and only stable attributes in `fingerprint`. Omit volatile text, style, framework internals, and session-specific values.
- If no stable selector exists, keep `selector` null, preserve the fingerprint and browser state, and add one unresolved target question when the distinction changes implementation.

## Browser context

- Record the exact sanitized URL, route, viewport, observable page state, frame path, and capture time.
- Remove auth tokens, session IDs, signatures, and other secrets from URL query or fragment values. Keep non-sensitive state such as the active tab.
- Use `browser_context` when the page or visible state is the stable target but no DOM node is selected.
- Reuse browser context only when it was captured for the current contract and still matches the active URL and page state. Recapture changed context; never silently reuse another task's tab, screenshot, or DOM selection.

## Resolution rules

1. Prefer an explicit DOM selection, then a screenshot annotation, then matching current browser context.
2. Bind every independently referenced region or node. Keep the plain-language `target` as their shared summary.
3. Resolve each identifier's semantic role from annotation bounds, adjacent labels, branch or locale, configuration keys, and fresh conversation context. A number may be an item, gift, reward, activity, or other business ID; never classify it as a Pagecenter page ID from shape alone.
4. If exactly one fresh context resolves the phrase and identifier roles, bind it without asking the user to repeat the target.
5. If multiple fresh candidates or identifier roles remain, ask one short choice question and keep the contract `clarifying`.
6. If no evidence resolves the phrase, request a screenshot annotation or DOM selection; do not guess from code, filenames, an old browser tab, or visual similarity.
7. Preserve all `target_refs` during routing, execution, and verification.
