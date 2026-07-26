import assert from "node:assert/strict";
import test from "node:test";

import type { ArgumentSpecContext, NormalizedContractFunction } from "@repo/stellar";

import {
  createFunctionDraft,
  updateDraftFromJson,
  updateDraftFromValue,
} from "./argument-editor-state.ts";

const source = { index: 0, xdr: "" };
const fn: NormalizedContractFunction = {
  name: "set_profile",
  documentation: "",
  parameters: [
    { name: "name", documentation: "", type: { kind: "string" } },
    { name: "amount", documentation: "", type: { kind: "u128" } },
  ],
  outputs: [],
  source,
};
const context: ArgumentSpecContext = { customTypes: [], errors: [] };

test("draft starts from valid examples with a valid-only XDR preview", () => {
  const draft = createFunctionDraft(fn, context);
  assert.deepEqual(draft.value, { name: "", amount: "0" });
  assert.deepEqual(draft.formValue, draft.value);
  assert.equal(draft.jsonError, null);
  assert.deepEqual(draft.issues, []);
  assert.match(draft.preview ?? "", /"name"/);
});

test("valid Form edits synchronize canonical JSON without numeric coercion", () => {
  const draft = updateDraftFromValue(
    createFunctionDraft(fn, context),
    fn,
    { name: "Ada", amount: "9007199254740993" },
    context,
  );
  assert.match(draft.jsonText, /"9007199254740993"/);
  assert.equal(draft.preview !== null, true);
});

test("invalid JSON remains editable and preserves the last valid canonical value", () => {
  const initial = createFunctionDraft(fn, context);
  const draft = updateDraftFromJson(initial, fn, '{"name":', context);
  assert.equal(draft.jsonText, '{"name":');
  assert.equal(draft.jsonError !== null, true);
  assert.deepEqual(draft.value, initial.value);
  assert.deepEqual(draft.formValue, initial.formValue);
  assert.equal(draft.preview, null);
});

test("valid JSON updates Form state while schema-invalid JSON cannot replace it", () => {
  const initial = createFunctionDraft(fn, context);
  const valid = updateDraftFromJson(initial, fn, '{"name":"Ada","amount":"42"}', context);
  assert.deepEqual(valid.value, { name: "Ada", amount: "42" });

  const invalid = updateDraftFromJson(valid, fn, '{"name":"Ada","amount":42}', context);
  assert.equal(invalid.jsonError, null);
  assert.equal(invalid.issues[0]?.path, "$.amount");
  assert.deepEqual(invalid.value, valid.value);
  assert.deepEqual(invalid.formValue, { name: "Ada", amount: 42 });
  assert.equal(invalid.preview, null);
});

test("invalid Form fields remain editable while last-valid canonical state and preview are guarded", () => {
  const initial = createFunctionDraft(fn, context);
  const invalid = updateDraftFromValue(initial, fn, { name: "Ada", amount: "-1" }, context);
  assert.deepEqual(invalid.formValue, { name: "Ada", amount: "-1" });
  assert.deepEqual(invalid.value, initial.value);
  assert.equal(invalid.preview, null);
});
