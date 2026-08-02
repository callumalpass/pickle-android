import type { JsonObject } from "@mdbase-dev/connect";
import type { PickleRequest } from "@mdbase-dev/pickle";
import { useMemo, useState } from "react";

const SYSTEM_FIELDS = new Set([
  "type",
  "types",
  "id",
  "request",
  "responded_at",
  "responder",
  "attachment_paths",
]);

interface FieldSchema extends JsonObject {
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  items?: JsonObject;
}

interface ResponseFormProps {
  request: PickleRequest;
  busy: boolean;
  onSubmit: (payload: JsonObject) => Promise<void>;
}

export function ResponseForm({ request, busy, onSubmit }: ResponseFormProps) {
  const schema = responseSchema(request);
  const fields = useMemo(() => responseFields(schema), [schema]);
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      fields.flatMap(([name, field]) =>
        field.default === undefined ? [] : [[name, field.default]],
      ),
    ),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const decision = fields.find(([name]) => name === "decision");
  const regularFields = fields.filter(([name]) => name !== "decision");

  async function submit(decisionValue?: string) {
    const payload: Record<string, unknown> = {
      ...values,
      ...(decisionValue ? { decision: decisionValue } : {}),
    };
    const missing = fields.find(
      ([name]) => required.has(name) && empty(payload[name]),
    );
    if (missing) {
      setFormError(`${label(missing[0], missing[1])} is required.`);
      return;
    }
    setFormError(null);
    await onSubmit(payload as JsonObject);
  }

  return (
    <form
      className="response-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="section-heading">
        <p className="eyebrow">Your response</p>
        {request.responseTypeDefinition?.description ? (
          <p>{request.responseTypeDefinition.description}</p>
        ) : null}
      </div>

      {regularFields.map(([name, field]) => (
        <ResponseField
          key={name}
          field={field}
          name={name}
          required={required.has(name)}
          value={values[name]}
          onChange={(value) =>
            setValues((current) => ({ ...current, [name]: value }))
          }
        />
      ))}

      {formError ? (
        <p className="inline-error" role="alert">
          {formError}
        </p>
      ) : null}

      {decision?.[1].enum ? (
        <div className="decision-actions" aria-label="Decision">
          {decision[1].enum
            .filter((value): value is string => typeof value === "string")
            .map((value) => (
              <button
                key={value}
                className={`decision-action decision-${value}`}
                disabled={busy}
                type="button"
                onClick={() => void submit(value)}
              >
                {decisionLabel(value)}
              </button>
            ))}
        </div>
      ) : (
        <button className="primary-action" disabled={busy} type="submit">
          {busy
            ? "Recording…"
            : request.kind === "notice"
              ? "Acknowledge"
              : "Send response"}
        </button>
      )}
    </form>
  );
}

interface ResponseFieldProps {
  name: string;
  field: FieldSchema;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ResponseField({
  name,
  field,
  required,
  value,
  onChange,
}: ResponseFieldProps) {
  const fieldLabel = label(name, field);
  const id = `response-${name}`;
  if (field.type === "boolean") {
    return (
      <label className="check-field" htmlFor={id}>
        <input
          checked={value === true}
          id={id}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{fieldLabel}</span>
      </label>
    );
  }
  if (field.enum) {
    return (
      <label className="form-field" htmlFor={id}>
        <span>
          {fieldLabel}
          {required ? " *" : ""}
        </span>
        <select
          aria-required={required}
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose…</option>
          {field.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {sentence(String(option))}
            </option>
          ))}
        </select>
        {field.description ? <small>{field.description}</small> : null}
      </label>
    );
  }
  const multiline =
    field.type === "object" ||
    field.type === "array" ||
    /comment|message|copy|description|note/i.test(name);
  return (
    <label className="form-field" htmlFor={id}>
      <span>
        {fieldLabel}
        {required ? " *" : ""}
      </span>
      {multiline ? (
        <textarea
          aria-required={required}
          id={id}
          rows={field.type === "object" ? 5 : 3}
          value={serialize(value, field)}
          onChange={(event) => onChange(parse(event.target.value, field))}
        />
      ) : (
        <input
          aria-required={required}
          id={id}
          type={
            field.type === "number" || field.type === "integer"
              ? "number"
              : "text"
          }
          value={
            typeof value === "string" || typeof value === "number" ? value : ""
          }
          onChange={(event) =>
            onChange(
              field.type === "number" || field.type === "integer"
                ? event.target.valueAsNumber
                : event.target.value,
            )
          }
        />
      )}
      {field.description ? <small>{field.description}</small> : null}
    </label>
  );
}

function responseSchema(request: PickleRequest): JsonObject {
  const outer = request.responseTypeDefinition?.schema ?? {};
  return isObject(outer.value) ? outer.value : outer;
}

function responseFields(schema: JsonObject): Array<[string, FieldSchema]> {
  if (!isObject(schema.properties)) return [];
  return Object.entries(schema.properties).flatMap(([name, definition]) =>
    SYSTEM_FIELDS.has(name) || !isObject(definition)
      ? []
      : [[name, definition as FieldSchema]],
  );
}

function label(name: string, field: FieldSchema): string {
  return typeof field.title === "string" ? field.title : sentence(name);
}

function sentence(value: string): string {
  const spaced = value.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function decisionLabel(value: string): string {
  return value === "approve"
    ? "Approve"
    : value === "reject"
      ? "Reject"
      : value === "revise"
        ? "Request revision"
        : sentence(value);
}

function empty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

function serialize(value: unknown, field: FieldSchema): string {
  if (value === undefined || value === null) return "";
  if (field.type === "array" && Array.isArray(value)) return value.join(", ");
  if (field.type === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function parse(value: string, field: FieldSchema): unknown {
  if (field.type === "array") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (field.type === "object") {
    try {
      return JSON.parse(value) as JsonObject;
    } catch {
      return value;
    }
  }
  return value;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
