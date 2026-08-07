import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { locateCompanyComponents } from "../scripts/locate-company-components.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-components-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src", "components"), { recursive: true });
  return root;
}

async function write(root, relative, source) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, source);
  return file;
}

test("keeps ui-prop-wrapper confirmed when only local preload is empty", async (t) => {
  const root = await fixture(t);
  await write(root, "src/Card.vue", [
    "<script setup>",
    "import UiPropWrapper from './components/ui-prop-wrapper.vue'",
    "</script>",
    "<template><ui-prop-wrapper /></template>",
  ].join("\n"));
  await write(root, "src/components/ui-prop-wrapper.vue", "<template><slot /></template>\n");

  const result = await locateCompanyComponents({
    root,
    component: "ui-prop-wrapper",
    query: "这里使用 ui-prop-wrapper。本地预加载时 wrapper 暂时为空，不要换成 a-img。",
    targets: ["src/Card.vue"],
    sourceRoots: [],
  });

  assert.equal(result.component.name, "ui-prop-wrapper");
  assert.equal(result.component.status, "confirmed");
  assert.equal(result.component.substitution_authorized, false);
  assert.deepEqual(result.component.environment, ["local", "preload"]);
  assert.equal(result.component.implementation_status, "found");
  assert.equal(result.component.next_check, null);
  assert.deepEqual(result.candidates, ["ui-prop-wrapper", "a-img"]);
  assert.equal(result.component.source[0].kind, "user_instruction");
  assert.ok(result.component.source.some((entry) => entry.kind === "target_import"));
});

test("does not promote a prohibited alternative", async (t) => {
  const root = await fixture(t);
  const result = await locateCompanyComponents({
    root,
    query: "这里用 ui-prop-wrapper，不要用 a-img。",
    targets: [],
    sourceRoots: [],
  });

  assert.equal(result.component.name, "ui-prop-wrapper");
  assert.equal(result.component.status, "confirmed");
  assert.equal(result.component.substitution_authorized, false);
});

test("does not guess between multiple component candidates", async (t) => {
  const root = await fixture(t);
  const result = await locateCompanyComponents({
    root,
    query: "ui-prop-wrapper 和 a-img 哪个符合当前项目约定？",
    targets: [],
    sourceRoots: [],
  });

  assert.equal(result.component.name, null);
  assert.equal(result.component.status, "unresolved");
  assert.equal(result.metrics.search_expansions, 0);
  assert.deepEqual(result.metrics.files_read, []);
});

test("keeps registry evidence as a candidate until confirmed", async (t) => {
  const root = await fixture(t);
  await write(root, "src/registry.ts", "app.component('ui-prop-wrapper', UiPropWrapper)\n");
  const result = await locateCompanyComponents({
    root,
    query: "排查 Unknown custom element: ui-prop-wrapper",
    targets: [],
    sourceRoots: [],
  });

  assert.equal(result.component.status, "candidate");
  assert.ok(result.component.source.some((entry) => entry.kind === "component_registration"));
});

test("respects the three-file lookup budget", async (t) => {
  const root = await fixture(t);
  for (let index = 0; index < 6; index += 1) {
    await write(root, `src/components/Use${index}.vue`, "<template><ui-prop-wrapper /></template>\n");
  }
  const result = await locateCompanyComponents({
    root,
    query: "检查 ui-prop-wrapper 的项目用法",
    targets: [],
    sourceRoots: [],
  });

  assert.equal(result.limits.max_body_files, 3);
  assert.ok(result.metrics.files_read.length <= 3);
});

test("rejects targets outside the project", async (t) => {
  const root = await fixture(t);
  const outside = await write(path.dirname(root), `${path.basename(root)}-outside.vue`, "<ui-prop-wrapper />\n");
  t.after(() => rm(outside, { force: true }));

  await assert.rejects(
    locateCompanyComponents({
      root,
      component: "ui-prop-wrapper",
      query: "使用 ui-prop-wrapper",
      targets: [outside],
      sourceRoots: [],
    }),
    /Target escapes project root/,
  );
});

test("keeps non-component requests at zero lookup cost", async (t) => {
  const root = await fixture(t);
  const result = await locateCompanyComponents({
    root,
    query: "把标题文案改成活动规则",
    targets: [],
    sourceRoots: [],
  });

  assert.equal(result.component.status, "unresolved");
  assert.equal(result.component.name, null);
  assert.equal(result.metrics.search_expansions, 0);
  assert.deepEqual(result.metrics.files_read, []);
});

test("does not use the AI Talk root SKILL as component implementation evidence", async (t) => {
  const root = await fixture(t);
  await write(root, "SKILL.md", "Do not replace ui-prop-wrapper with a-img.\n");
  const result = await locateCompanyComponents({
    root,
    component: "ui-prop-wrapper",
    query: "使用 ui-prop-wrapper",
    targets: [],
    sourceRoots: [],
  });

  assert.equal(result.component.status, "confirmed");
  assert.equal(result.component.implementation_status, "unresolved");
  assert.deepEqual(result.metrics.files_read, []);
});
