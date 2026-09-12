"use client";

/**
 * Orbit Studio — shared custom-field form renderer.
 *
 * Given a tenant's (module-scoped) FieldDef list, renders the right input
 * per field.type. Every input is named `custom_<code>` so a plain server
 * action can collect them straight off FormData (`formData.get("custom_x")`
 * / `formData.getAll("custom_x")` for multipicklist) without any client-side
 * serialization step. Purely presentational — validation happens server-side
 * via lib/studio/validate.ts.
 */

export type CustomFieldSpec = {
  code: string;
  label: string;
  type: string; // text|longtext|number|currency|date|datetime|checkbox|picklist|multipicklist|phone|email|url|lookup
  required: boolean;
  helpText: string | null;
  picklistOptions?: { value: string; label: string }[];
  lookupOptions?: { id: string; label: string }[];
};

export function CustomFieldInputs({ fields }: { fields: CustomFieldSpec[] }) {
  if (!fields || fields.length === 0) return null;
  return (
    <>
      {fields.map((f) => (
        <CustomFieldInput key={f.code} field={f} />
      ))}
    </>
  );
}

function CustomFieldInput({ field: f }: { field: CustomFieldSpec }) {
  const name = `custom_${f.code}`;

  if (f.type === "checkbox") {
    return (
      <div className="flex items-center gap-2 pt-5">
        <input id={name} type="checkbox" name={name} className="h-4 w-4 rounded border-slate-300" />
        <label htmlFor={name} className="label !mb-0">
          {f.label}
          {f.required ? " *" : ""}
        </label>
        {f.helpText && <p className="text-xs text-slate-400">{f.helpText}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="label" htmlFor={name}>
        {f.label}
        {f.required ? " *" : ""}
      </label>
      {renderControl(f, name)}
      {f.helpText && <p className="text-xs text-slate-400 mt-0.5">{f.helpText}</p>}
    </div>
  );
}

function renderControl(f: CustomFieldSpec, name: string) {
  switch (f.type) {
    case "longtext":
      return <textarea id={name} name={name} required={f.required} className="input" rows={3} />;
    case "number":
      return <input id={name} type="number" name={name} required={f.required} className="input" step="any" />;
    case "currency":
      return <input id={name} type="number" name={name} required={f.required} className="input" step="0.01" />;
    case "date":
      return <input id={name} type="date" name={name} required={f.required} className="input" />;
    case "datetime":
      return <input id={name} type="datetime-local" name={name} required={f.required} className="input" />;
    case "picklist":
      return (
        <select id={name} name={name} required={f.required} defaultValue="" className="input">
          <option value="" disabled>
            Select…
          </option>
          {(f.picklistOptions ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "multipicklist":
      return (
        <select
          id={name}
          name={name}
          multiple
          required={f.required}
          className="input"
          size={Math.min(4, Math.max(2, (f.picklistOptions ?? []).length))}
        >
          {(f.picklistOptions ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "lookup":
      return (
        <select id={name} name={name} required={f.required} defaultValue="" className="input">
          <option value="" disabled>
            Select…
          </option>
          {(f.lookupOptions ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "phone":
      return <input id={name} type="tel" name={name} required={f.required} className="input" />;
    case "email":
      return <input id={name} type="email" name={name} required={f.required} className="input" />;
    case "url":
      return <input id={name} type="url" name={name} required={f.required} className="input" />;
    case "text":
    default:
      return <input id={name} type="text" name={name} required={f.required} className="input" />;
  }
}
