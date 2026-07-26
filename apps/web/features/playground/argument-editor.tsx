"use client";

import {
  ARGUMENT_LIMITS,
  classifyContractAddress,
  createArgumentExample,
  type ArgumentSpecContext,
  type ArgumentValidationIssue,
  type CanonicalArgumentValue,
  type NormalizedContractFunction,
  type NormalizedContractSpecType,
} from "@repo/stellar";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  PlusIcon,
  RotateCcwIcon,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";

import {
  createFunctionDraft,
  updateDraftFromJson,
  updateDraftFromValue,
  type FunctionArgumentDraft,
  type FunctionArgumentObject,
} from "./argument-editor-state";

type EditorProps = {
  functionSpec: NormalizedContractFunction;
  context: ArgumentSpecContext;
  draft: FunctionArgumentDraft;
  onChange: (draft: FunctionArgumentDraft) => void;
};

export function ArgumentEditor({ functionSpec, context, draft, onChange }: EditorProps) {
  const [mode, setMode] = useState<"form" | "json">("form");
  const [announcement, setAnnouncement] = useState("");

  function updateParameter(name: string, value: CanonicalArgumentValue) {
    onChange(
      updateDraftFromValue(draft, functionSpec, { ...draft.formValue, [name]: value }, context),
    );
  }

  async function copyValue() {
    await navigator.clipboard.writeText(JSON.stringify(draft.value, null, 2));
    setAnnouncement("Canonical argument JSON copied.");
  }

  return (
    <section className="grid gap-4 rounded-lg border bg-muted/10 p-4" aria-label="Argument builder">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">Argument builder</h3>
          <p className="text-xs text-muted-foreground">
            Form and JSON share one lossless canonical value.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Argument editor mode">
          <Button
            type="button"
            size="sm"
            variant={mode === "form" ? "secondary" : "outline"}
            aria-pressed={mode === "form"}
            onClick={() => setMode("form")}
          >
            Form
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "json" ? "secondary" : "outline"}
            aria-pressed={mode === "json"}
            onClick={() => setMode("json")}
          >
            JSON
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange(createFunctionDraft(functionSpec, context))}
            aria-label={`Reset ${functionSpec.name} arguments to examples`}
          >
            <RotateCcwIcon /> Reset
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void copyValue()}>
            <CopyIcon /> Copy value
          </Button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {mode === "json" ? (
        <label className="grid gap-1 text-sm font-medium">
          Canonical argument JSON
          <textarea
            aria-label="Canonical argument JSON"
            value={draft.jsonText}
            onChange={(event) =>
              onChange(updateDraftFromJson(draft, functionSpec, event.target.value, context))
            }
            spellCheck={false}
            aria-invalid={Boolean(draft.jsonError || draft.issues.length)}
            aria-describedby="argument-json-errors"
            className="min-h-72 rounded-md border bg-background p-3 font-mono text-xs"
          />
        </label>
      ) : (
        <div className="grid gap-4">
          {functionSpec.parameters.length ? (
            functionSpec.parameters.map((parameter) => (
              <fieldset key={parameter.name} className="grid gap-2 rounded-md border p-3">
                <legend className="px-1 font-mono text-sm font-medium">
                  {parameter.name}{" "}
                  <span className="text-muted-foreground">· {parameter.type.kind}</span>
                </legend>
                {parameter.documentation ? (
                  <p className="text-xs text-muted-foreground">{parameter.documentation}</p>
                ) : null}
                <ArgumentControl
                  type={parameter.type}
                  value={draft.formValue[parameter.name]}
                  context={context}
                  path={`$.${parameter.name}`}
                  issues={draft.issues}
                  onChange={(value) => updateParameter(parameter.name, value)}
                />
              </fieldset>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">This function has no arguments.</p>
          )}
        </div>
      )}

      <IssueList id="argument-json-errors" issues={draft.issues} jsonError={draft.jsonError} />

      <label className="grid gap-1 text-sm font-medium">
        Encoded ScVal preview (base64 XDR)
        <textarea
          value={draft.preview ?? ""}
          readOnly
          aria-label="Read-only encoded ScVal preview"
          placeholder="A preview appears only when every argument is valid."
          className="min-h-28 rounded-md border bg-muted p-3 font-mono text-xs"
        />
      </label>
    </section>
  );
}

function IssueList({
  id,
  issues,
  jsonError,
}: {
  id?: string;
  issues: ArgumentValidationIssue[];
  jsonError?: string | null;
}) {
  if (!jsonError && !issues.length) return null;
  return (
    <div id={id} role="alert" className="grid gap-1 text-xs text-destructive">
      {jsonError ? <p>JSON: {jsonError}</p> : null}
      {issues.map((item, index) => (
        <p key={`${item.path}-${item.code}-${index}`}>
          <span className="font-mono">{item.path}</span>: {item.message}
        </p>
      ))}
    </div>
  );
}

type ControlProps = {
  type: NormalizedContractSpecType;
  value: CanonicalArgumentValue | undefined;
  context: ArgumentSpecContext;
  path: string;
  issues: ArgumentValidationIssue[];
  onChange: (value: CanonicalArgumentValue) => void;
  depth?: number;
};

const INTEGER_KINDS = new Set([
  "u32",
  "i32",
  "u64",
  "i64",
  "u128",
  "i128",
  "u256",
  "i256",
  "timepoint",
  "duration",
]);

function ArgumentControl(props: ControlProps) {
  const { type, value, context, path, issues, onChange, depth = 0 } = props;
  const ownIssues = issues.filter((item) => item.path === path || item.path.startsWith(`${path}.`));

  if (depth > ARGUMENT_LIMITS.depth) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {path}: nesting exceeds the safe depth limit of {ARGUMENT_LIMITS.depth}.
      </p>
    );
  }
  if (type.kind === "value" || type.kind === "muxedAddress") {
    return (
      <p className="text-xs text-muted-foreground">
        {type.kind} is inspection-only and cannot be encoded in Sprint 2.
      </p>
    );
  }
  if (type.kind === "void") return <p className="text-xs text-muted-foreground">null (void)</p>;
  if (type.kind === "bool") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          aria-label={`${path} boolean value`}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {value ? "true" : "false"}
      </label>
    );
  }
  if (
    INTEGER_KINDS.has(type.kind) ||
    type.kind === "string" ||
    type.kind === "symbol" ||
    type.kind === "address"
  ) {
    const text = typeof value === "string" ? value : "";
    const classification = type.kind === "address" ? classifyContractAddress(text) : null;
    return (
      <label className="grid gap-1 text-xs">
        {INTEGER_KINDS.has(type.kind) ? "Decimal string" : type.kind}
        <Input
          value={text}
          inputMode={INTEGER_KINDS.has(type.kind) ? "numeric" : "text"}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={ownIssues.length > 0}
          className="font-mono"
        />
        {classification ? (
          <span className="text-muted-foreground">Address classification: {classification}</span>
        ) : null}
        <IssueList issues={ownIssues.filter((item) => item.path === path)} />
      </label>
    );
  }
  if (type.kind === "bytes" || type.kind === "bytesN") {
    const bytes =
      value && !Array.isArray(value) && typeof value === "object"
        ? (value as { encoding?: CanonicalArgumentValue; value?: CanonicalArgumentValue })
        : {};
    return (
      <label className="grid gap-1 text-xs">
        Base64 {type.kind === "bytesN" ? `(${type.length} decoded bytes)` : ""}
        <Input
          value={typeof bytes.value === "string" ? bytes.value : ""}
          onChange={(event) => onChange({ encoding: "base64", value: event.target.value })}
          spellCheck={false}
          aria-invalid={ownIssues.length > 0}
          className="font-mono"
        />
        <IssueList issues={ownIssues} />
      </label>
    );
  }
  if (type.kind === "option") {
    return (
      <div className="grid gap-2">
        <label className="grid gap-1 text-xs">
          Option
          <select
            value={value === null ? "none" : "some"}
            onChange={(event) =>
              onChange(
                event.target.value === "none"
                  ? null
                  : createArgumentExample(type.valueType, context),
              )
            }
            className="h-9 rounded-md border bg-background px-3"
          >
            <option value="none">None</option>
            <option value="some">Some</option>
          </select>
        </label>
        {value !== null ? (
          <ArgumentControl {...props} type={type.valueType} value={value} depth={depth + 1} />
        ) : null}
      </div>
    );
  }
  if (type.kind === "result") {
    const result =
      value && !Array.isArray(value) && typeof value === "object"
        ? (value as { status?: CanonicalArgumentValue; value?: CanonicalArgumentValue })
        : {};
    const status = result.status === "error" ? "error" : "ok";
    const selectedType = status === "ok" ? type.okType : type.errorType;
    return (
      <div className="grid gap-2">
        <label className="grid gap-1 text-xs">
          Result
          <select
            value={status}
            onChange={(event) => {
              const nextStatus = event.target.value as "ok" | "error";
              onChange({
                status: nextStatus,
                value: createArgumentExample(
                  nextStatus === "ok" ? type.okType : type.errorType,
                  context,
                ),
              });
            }}
            className="h-9 rounded-md border bg-background px-3"
          >
            <option value="ok">Ok</option>
            <option value="error">Error</option>
          </select>
        </label>
        <ArgumentControl
          {...props}
          type={selectedType}
          path={`${path}.value`}
          value={result.value}
          depth={depth + 1}
          onChange={(next) => onChange({ status, value: next })}
        />
      </div>
    );
  }
  if (type.kind === "vector") {
    return (
      <CollectionControl
        values={Array.isArray(value) ? value : []}
        path={path}
        label="vector item"
        create={() => createArgumentExample(type.elementType, context)}
        onChange={onChange}
        render={(item, index, change) => (
          <ArgumentControl
            type={type.elementType}
            value={item}
            context={context}
            path={`${path}[${index}]`}
            issues={issues}
            depth={depth + 1}
            onChange={change}
          />
        )}
      />
    );
  }
  if (type.kind === "map") {
    const entries = Array.isArray(value) ? value : [];
    return (
      <CollectionControl
        values={entries}
        path={path}
        label="map entry"
        create={() => ({
          key: createArgumentExample(type.keyType, context),
          value: createArgumentExample(type.valueType, context),
        })}
        onChange={onChange}
        render={(item, index, change) => {
          const entry =
            item && !Array.isArray(item) && typeof item === "object"
              ? (item as { key?: CanonicalArgumentValue; value?: CanonicalArgumentValue })
              : {};
          return (
            <div className="grid gap-2 sm:grid-cols-2">
              <ArgumentControl
                type={type.keyType}
                value={entry.key}
                context={context}
                path={`${path}[${index}].key`}
                issues={issues}
                depth={depth + 1}
                onChange={(key) => change({ key, value: entry.value ?? null })}
              />
              <ArgumentControl
                type={type.valueType}
                value={entry.value}
                context={context}
                path={`${path}[${index}].value`}
                issues={issues}
                depth={depth + 1}
                onChange={(nextValue) => change({ key: entry.key ?? null, value: nextValue })}
              />
            </div>
          );
        }}
      />
    );
  }
  if (type.kind === "tuple") {
    const tuple = Array.isArray(value) ? value : [];
    return (
      <div className="grid gap-2">
        {type.elements.map((element, index) => (
          <div key={index} className="rounded-md border p-2">
            <span className="text-xs text-muted-foreground">Tuple #{index}</span>
            <ArgumentControl
              type={element}
              value={tuple[index]}
              context={context}
              path={`${path}[${index}]`}
              issues={issues}
              depth={depth + 1}
              onChange={(next) => {
                const updated = [...tuple];
                updated[index] = next;
                onChange(updated);
              }}
            />
          </div>
        ))}
      </div>
    );
  }
  if (type.kind === "error") {
    return <ErrorControl {...props} errorName={undefined} />;
  }
  if (type.kind === "custom") {
    const errorEnum = context.errors.find((item) => item.name === type.name);
    if (errorEnum) return <ErrorControl {...props} errorName={errorEnum.name} />;
    const definition = context.customTypes.find((item) => item.name === type.name);
    if (!definition) return <IssueList issues={ownIssues} />;
    if (definition.kind === "enum") {
      const current =
        value && !Array.isArray(value) && typeof value === "object"
          ? (value as { case?: CanonicalArgumentValue }).case
          : "";
      return (
        <select
          value={typeof current === "string" ? current : ""}
          onChange={(event) => onChange({ case: event.target.value })}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label={`${type.name} enum variant`}
        >
          {definition.cases.map((item) => (
            <option key={item.name}>{item.name}</option>
          ))}
        </select>
      );
    }
    if (definition.kind === "union") {
      const union =
        value && !Array.isArray(value) && typeof value === "object"
          ? (value as { case?: CanonicalArgumentValue; values?: CanonicalArgumentValue })
          : {};
      const selected =
        definition.cases.find((item) => item.name === union.case) ?? definition.cases[0];
      const values = Array.isArray(union.values) ? union.values : [];
      return (
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs">
            Union variant
            <select
              value={selected?.name ?? ""}
              onChange={(event) => {
                const next = definition.cases.find((item) => item.name === event.target.value)!;
                onChange({
                  case: next.name,
                  values: next.types.map((item) => createArgumentExample(item, context)),
                });
              }}
              className="h-9 rounded-md border bg-background px-3"
            >
              {definition.cases.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
          {selected?.types.map((item, index) => (
            <ArgumentControl
              key={index}
              type={item}
              value={values[index]}
              context={context}
              path={`${path}.values[${index}]`}
              issues={issues}
              depth={depth + 1}
              onChange={(next) => {
                const updated = [...values];
                updated[index] = next;
                onChange({ case: selected.name, values: updated });
              }}
            />
          ))}
        </div>
      );
    }
    const object =
      value && !Array.isArray(value) && typeof value === "object"
        ? (value as FunctionArgumentObject)
        : {};
    return (
      <div className="grid gap-3">
        {definition.fields.map((field) => (
          <div
            key={field.name}
            data-argument-struct-field={field.name}
            className="grid gap-1 rounded-md border p-2 text-xs"
          >
            <span className="font-medium">{field.name}</span>
            <ArgumentControl
              type={field.type}
              value={object[field.name]}
              context={context}
              path={`${path}.${field.name}`}
              issues={issues}
              depth={depth + 1}
              onChange={(next) => onChange({ ...object, [field.name]: next })}
            />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function ErrorControl({
  value,
  context,
  onChange,
  errorName,
}: ControlProps & { errorName?: string }) {
  const selected =
    value && !Array.isArray(value) && typeof value === "object"
      ? (value as { type?: CanonicalArgumentValue; case?: CanonicalArgumentValue })
      : {};
  const errorEnum =
    context.errors.find((item) => item.name === (errorName ?? selected.type)) ?? context.errors[0];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="grid gap-1 text-xs">
        Error enum
        <select
          value={errorEnum?.name ?? ""}
          disabled={Boolean(errorName)}
          onChange={(event) => {
            const next = context.errors.find((item) => item.name === event.target.value);
            onChange({ type: event.target.value, case: next?.cases[0]?.name ?? "" });
          }}
          className="h-9 rounded-md border bg-background px-3"
        >
          {context.errors.map((item) => (
            <option key={item.name}>{item.name}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        Error case
        <select
          value={typeof selected.case === "string" ? selected.case : ""}
          onChange={(event) => onChange({ type: errorEnum?.name ?? "", case: event.target.value })}
          className="h-9 rounded-md border bg-background px-3"
        >
          {errorEnum?.cases.map((item) => (
            <option key={item.name}>{item.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function CollectionControl({
  values,
  path,
  label,
  create,
  onChange,
  render,
}: {
  values: CanonicalArgumentValue[];
  path: string;
  label: string;
  create: () => CanonicalArgumentValue;
  onChange: (value: CanonicalArgumentValue) => void;
  render: (
    item: CanonicalArgumentValue,
    index: number,
    onChange: (value: CanonicalArgumentValue) => void,
  ) => React.ReactNode;
}) {
  function replace(index: number, item: CanonicalArgumentValue) {
    const updated = [...values];
    updated[index] = item;
    onChange(updated);
  }
  function move(index: number, offset: number) {
    const updated = [...values];
    const [item] = updated.splice(index, 1);
    updated.splice(index + offset, 0, item!);
    onChange(updated);
  }
  return (
    <div className="grid gap-2">
      {values.map((item, index) => (
        <div key={index} className="grid gap-2 rounded-md border p-2">
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Move ${label} ${index + 1} up`}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={index === values.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move ${label} ${index + 1} down`}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              aria-label={`Remove ${label} ${index + 1}`}
            >
              <TrashIcon />
            </Button>
          </div>
          {render(item, index, (next) => replace(index, next))}
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={values.length >= ARGUMENT_LIMITS.collectionEntries}
        onClick={() => onChange([...values, create()])}
      >
        <PlusIcon /> Add {label}
      </Button>
      <span className="text-xs text-muted-foreground">
        {path}: {values.length}/100 entries
      </span>
    </div>
  );
}
