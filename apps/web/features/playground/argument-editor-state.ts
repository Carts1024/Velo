import {
  ArgumentValueError,
  createFunctionArgumentExamples,
  encodeFunctionArguments,
  validateFunctionArguments,
  type ArgumentSpecContext,
  type ArgumentValidationIssue,
  type CanonicalArgumentValue,
  type NormalizedContractFunction,
} from "@repo/stellar";

export type FunctionArgumentObject = Record<string, CanonicalArgumentValue>;
export type FunctionArgumentDraft = {
  formValue: FunctionArgumentObject;
  value: FunctionArgumentObject;
  jsonText: string;
  jsonError: string | null;
  issues: ArgumentValidationIssue[];
  preview: string | null;
};

function pretty(value: FunctionArgumentObject) {
  return JSON.stringify(value, null, 2);
}

function preview(
  functionSpec: NormalizedContractFunction,
  value: FunctionArgumentObject,
  context: ArgumentSpecContext,
) {
  const encoded = encodeFunctionArguments(functionSpec, value, context);
  return JSON.stringify(
    Object.fromEntries(
      functionSpec.parameters.map((parameter, index) => [
        parameter.name,
        encoded[index]!.toXDR("base64"),
      ]),
    ),
    null,
    2,
  );
}

function evaluate(
  previous: FunctionArgumentDraft | null,
  functionSpec: NormalizedContractFunction,
  candidate: unknown,
  jsonText: string,
  context: ArgumentSpecContext,
): FunctionArgumentDraft {
  const issues = validateFunctionArguments(functionSpec, candidate, context);
  if (issues.length || candidate === null || Array.isArray(candidate)) {
    const formValue =
      candidate !== null && !Array.isArray(candidate) && typeof candidate === "object"
        ? (candidate as FunctionArgumentObject)
        : (previous?.formValue ?? ({} as FunctionArgumentObject));
    return {
      formValue,
      value: previous?.value ?? ({} as FunctionArgumentObject),
      jsonText,
      jsonError: null,
      issues,
      preview: null,
    };
  }
  const value = candidate as FunctionArgumentObject;
  try {
    return {
      formValue: value,
      value,
      jsonText,
      jsonError: null,
      issues: [],
      preview: preview(functionSpec, value, context),
    };
  } catch (error) {
    const encodeIssues =
      error instanceof ArgumentValueError
        ? error.issues
        : [{ path: "$", code: "encode", message: "Unable to encode these arguments." }];
    return {
      formValue: value,
      value: previous?.value ?? value,
      jsonText,
      jsonError: null,
      issues: encodeIssues,
      preview: null,
    };
  }
}

export function createFunctionDraft(
  functionSpec: NormalizedContractFunction,
  context: ArgumentSpecContext,
): FunctionArgumentDraft {
  const value = createFunctionArgumentExamples(functionSpec, context) as FunctionArgumentObject;
  return evaluate(null, functionSpec, value, pretty(value), context);
}

export function updateDraftFromValue(
  previous: FunctionArgumentDraft,
  functionSpec: NormalizedContractFunction,
  candidate: FunctionArgumentObject,
  context: ArgumentSpecContext,
) {
  return evaluate(previous, functionSpec, candidate, pretty(candidate), context);
}

export function updateDraftFromJson(
  previous: FunctionArgumentDraft,
  functionSpec: NormalizedContractFunction,
  jsonText: string,
  context: ArgumentSpecContext,
) {
  let candidate: unknown;
  try {
    candidate = JSON.parse(jsonText);
  } catch (error) {
    return {
      ...previous,
      jsonText,
      jsonError: error instanceof Error ? error.message : "Invalid JSON.",
      preview: null,
    };
  }
  return evaluate(previous, functionSpec, candidate, jsonText, context);
}
