import type { ResultSchema } from "@breed-club/shared";

export interface GradingOrg {
  id: string;
  name: string;
  type: string;
  country?: string;
  website_url?: string;
  result_schema: ResultSchema | null;
  confidence?: number | null;
}

export interface TestType {
  id: string;
  name: string;
  short_name: string;
  category: string;
  result_options: string[];
  organizations: GradingOrg[];
}

export function EnumResultForm({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">Result</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg"
        required
      >
        <option value="">Select result...</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NumericLRForm({
  schema,
  value,
  onChange,
}: {
  schema: Extract<ResultSchema, { type: "numeric_lr" }>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const left = (value.left as Record<string, number>) || {};
  const right = (value.right as Record<string, number>) || {};

  const updateSide = (side: "left" | "right", key: string, val: number) => {
    const current = (value[side] as Record<string, number>) || {};
    onChange({ ...value, [side]: { ...current, [key]: val } });
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Results</label>
      <div className="grid grid-cols-3 gap-2 text-sm font-medium text-gray-600">
        <div />
        <div className="text-center">Left</div>
        <div className="text-center">Right</div>
      </div>
      {schema.fields.map((field) => (
        <div key={field.key} className="grid grid-cols-3 gap-2 items-center">
          <label className="text-sm">
            {field.label}
            {field.unit && <span className="text-gray-400 ml-1">({field.unit})</span>}
          </label>
          <input
            type="number"
            value={left[field.key] ?? ""}
            onChange={(e) => updateSide("left", field.key, parseFloat(e.target.value))}
            min={field.min}
            max={field.max}
            step={field.step}
            className="px-2 py-1 border rounded text-center"
            required
          />
          <input
            type="number"
            value={right[field.key] ?? ""}
            onChange={(e) => updateSide("right", field.key, parseFloat(e.target.value))}
            min={field.min}
            max={field.max}
            step={field.step}
            className="px-2 py-1 border rounded text-center"
            required
          />
        </div>
      ))}
    </div>
  );
}

export function PointScoreLRForm({
  schema,
  value,
  onChange,
}: {
  schema: Extract<ResultSchema, { type: "point_score_lr" }>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const left = (value.left as Record<string, number>) || {};
  const right = (value.right as Record<string, number>) || {};

  const leftTotal = schema.subcategories.reduce((sum, sc) => sum + (left[sc.key] || 0), 0);
  const rightTotal = schema.subcategories.reduce((sum, sc) => sum + (right[sc.key] || 0), 0);
  const grandTotal = leftTotal + rightTotal;

  const updateSide = (side: "left" | "right", key: string, val: number) => {
    const current = (value[side] as Record<string, number>) || {};
    const updated = { ...current, [key]: val };
    const sideTotal = schema.subcategories.reduce((sum, sc) => sum + (updated[sc.key] || 0), 0);
    updated.total = sideTotal;

    const otherSide = side === "left" ? "right" : "left";
    const otherTotal = ((value[otherSide] as Record<string, number>) || {}).total || 0;

    onChange({
      ...value,
      [side]: updated,
      total: sideTotal + otherTotal,
    });
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Point Scores</label>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Subcategory</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Right</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Left</th>
              <th className="px-3 py-2 text-center font-medium text-gray-400 w-16">Max</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {schema.subcategories.map((sc) => (
              <tr key={sc.key}>
                <td className="px-3 py-1.5 text-gray-700">{sc.label}</td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    value={right[sc.key] ?? ""}
                    onChange={(e) => updateSide("right", sc.key, parseInt(e.target.value) || 0)}
                    min={0}
                    max={sc.max}
                    className="w-full px-2 py-1 border rounded text-center"
                    required
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    value={left[sc.key] ?? ""}
                    onChange={(e) => updateSide("left", sc.key, parseInt(e.target.value) || 0)}
                    min={0}
                    max={sc.max}
                    className="w-full px-2 py-1 border rounded text-center"
                    required
                  />
                </td>
                <td className="px-3 py-1.5 text-center text-gray-400">{sc.max}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-center">{rightTotal}</td>
              <td className="px-3 py-2 text-center">{leftTotal}</td>
              <td className="px-3 py-2 text-center text-purple-600">{grandTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function ElbowLRForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const left = (value.left as { mm_change?: number; grade?: number; uap?: boolean }) || {};
  const right = (value.right as { mm_change?: number; grade?: number; uap?: boolean }) || {};

  const updateSide = (side: "left" | "right", key: string, val: unknown) => {
    const current = (value[side] as Record<string, unknown>) || {};
    onChange({ ...value, [side]: { ...current, [key]: val } });
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Elbow Results</label>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Measurement</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">Right</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">Left</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Mm of change</td>
              <td className="px-3 py-1.5">
                <input
                  type="number"
                  value={right.mm_change ?? ""}
                  onChange={(e) => updateSide("right", "mm_change", parseInt(e.target.value) || 0)}
                  min={0}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                />
              </td>
              <td className="px-3 py-1.5">
                <input
                  type="number"
                  value={left.mm_change ?? ""}
                  onChange={(e) => updateSide("left", "mm_change", parseInt(e.target.value) || 0)}
                  min={0}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                />
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Grade</td>
              <td className="px-3 py-1.5">
                <select
                  value={right.grade ?? ""}
                  onChange={(e) => updateSide("right", "grade", parseInt(e.target.value))}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                >
                  <option value="">-</option>
                  {[0, 1, 2, 3].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <select
                  value={left.grade ?? ""}
                  onChange={(e) => updateSide("left", "grade", parseInt(e.target.value))}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                >
                  <option value="">-</option>
                  {[0, 1, 2, 3].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-700">UAP</td>
              <td className="px-3 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={right.uap || false}
                  onChange={(e) => updateSide("right", "uap", e.target.checked)}
                  className="w-4 h-4"
                />
              </td>
              <td className="px-3 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={left.uap || false}
                  onChange={(e) => updateSide("left", "uap", e.target.checked)}
                  className="w-4 h-4"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EnumLRForm({
  schema,
  value,
  onChange,
}: {
  schema: Extract<ResultSchema, { type: "enum_lr" }>;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const left = (value.left as { value?: string }) || {};
  const right = (value.right as { value?: string }) || {};

  const updateSide = (side: "left" | "right", val: string) => {
    onChange({ ...value, [side]: { value: val } });
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Results</label>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Side</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Right</td>
              <td className="px-3 py-1.5">
                <select
                  value={right.value ?? ""}
                  onChange={(e) => updateSide("right", e.target.value)}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                >
                  <option value="">-</option>
                  {schema.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Left</td>
              <td className="px-3 py-1.5">
                <select
                  value={left.value ?? ""}
                  onChange={(e) => updateSide("left", e.target.value)}
                  className="w-full px-2 py-1 border rounded text-center"
                  required
                >
                  <option value="">-</option>
                  {schema.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function computeResultSummary(
  resultData: Record<string, unknown>,
  schema: ResultSchema
): string {
  switch (schema.type) {
    case "numeric_lr": {
      const left = resultData.left as Record<string, number> | undefined;
      const right = resultData.right as Record<string, number> | undefined;
      if (!left || !right) return "";
      const parts = schema.fields.map(
        (f) => `${f.label}: L=${left[f.key]}, R=${right[f.key]}`
      );
      return parts.join("; ");
    }
    case "point_score_lr": {
      const total = resultData.total as number | undefined;
      const left = resultData.left as Record<string, number> | undefined;
      const right = resultData.right as Record<string, number> | undefined;
      if (total != null && left?.total != null && right?.total != null) {
        return `${total} (R:${right.total}, L:${left.total})`;
      }
      return "";
    }
    case "elbow_lr": {
      const left = resultData.left as { grade?: number } | undefined;
      const right = resultData.right as { grade?: number } | undefined;
      if (left && right) {
        return `L: Grade ${left.grade ?? "?"}, R: Grade ${right.grade ?? "?"}`;
      }
      return "";
    }
    case "enum_lr": {
      const left = resultData.left as { value?: string } | undefined;
      const right = resultData.right as { value?: string } | undefined;
      if (left && right) {
        return `L: ${left.value ?? "?"}, R: ${right.value ?? "?"}`;
      }
      return "";
    }
    default:
      return "";
  }
}

/** Picks the right result form component based on schema type */
export function ResultFormRouter({
  schema,
  enumOptions,
  resultValue,
  resultData,
  onResultChange,
  onResultDataChange,
}: {
  schema: ResultSchema | null;
  enumOptions: string[];
  resultValue: string;
  resultData: Record<string, unknown>;
  onResultChange: (v: string) => void;
  onResultDataChange: (v: Record<string, unknown>) => void;
}) {
  const isStructured = schema && schema.type !== "enum";

  if (!isStructured && enumOptions.length > 0) {
    return (
      <EnumResultForm
        options={enumOptions}
        value={resultValue}
        onChange={onResultChange}
      />
    );
  }

  if (schema?.type === "enum" && schema.options.length > 0) {
    return (
      <EnumResultForm
        options={schema.options}
        value={resultValue}
        onChange={onResultChange}
      />
    );
  }

  if (schema?.type === "numeric_lr") {
    return <NumericLRForm schema={schema} value={resultData} onChange={onResultDataChange} />;
  }

  if (schema?.type === "point_score_lr") {
    return <PointScoreLRForm schema={schema} value={resultData} onChange={onResultDataChange} />;
  }

  if (schema?.type === "elbow_lr") {
    return <ElbowLRForm value={resultData} onChange={onResultDataChange} />;
  }

  if (schema?.type === "enum_lr") {
    return <EnumLRForm schema={schema} value={resultData} onChange={onResultDataChange} />;
  }

  return null;
}
