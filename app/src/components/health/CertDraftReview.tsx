/**
 * Draft review component for LLM-extracted cert data.
 *
 * Shows pre-filled form fields with confidence highlighting and
 * verification flags. The user can edit any field before submitting
 * through the existing batch clearance endpoint.
 */

import { useState } from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle, Edit3 } from "lucide-react";
import {
  ResultFormRouter,
  computeResultSummary,
  type TestType,
  type GradingOrg,
} from "./ResultForms";

// ─── Types (mirrors API response) ───────────────────────────────────────────

export interface VerificationFlag {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  field?: string;
  expected?: string;
  extracted?: string;
}

export interface ExtractionDraft {
  health_test_type_id: string;
  health_test_type_name: string;
  health_test_type_short_name: string;
  organization_id: string;
  organization_name: string;
  result: string;
  result_data: Record<string, unknown> | null;
  test_date: string | null;
  certificate_number: string | null;
  field_confidences: Record<string, number>;
  row_confidence: number;
  escalated: boolean;
  extraction_reliable: boolean;
  flags: VerificationFlag[];
  raw_result_text?: string;
  // OFA Preliminary (Consultation) reports
  is_preliminary?: boolean;
  application_number?: string | null;
}

export interface ExtractionResponse {
  certificate_url: string;
  drafts: ExtractionDraft[];
  fallback_to_manual: boolean;
  fallback_reason?: string;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface CertDraftReviewProps {
  extraction: ExtractionResponse;
  /** All test types with org schemas (from /health/test-types) */
  allTestTypes: TestType[];
  /** Callback when user confirms submission */
  onSubmit: (clearances: SubmitClearance[], certificateUrl: string, notes: string) => void;
  /** Callback to switch to manual entry mode */
  onFallbackToManual: (certificateUrl: string) => void;
}

export interface SubmitClearance {
  health_test_type_id: string;
  organization_id: string;
  result: string;
  result_data: Record<string, unknown> | null;
  test_date: string;
  certificate_number?: string;
  // OFA Preliminary (Consultation) reports
  is_preliminary?: boolean;
  application_number?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CertDraftReview({
  extraction,
  allTestTypes,
  onSubmit,
  onFallbackToManual,
}: CertDraftReviewProps) {
  // Editable state for each draft
  const [editableDrafts, setEditableDrafts] = useState<
    Array<{
      result: string;
      resultData: Record<string, unknown>;
      testDate: string;
      certificateNumber: string;
    }>
  >(() =>
    extraction.drafts.map((d) => ({
      result: d.result,
      resultData: d.result_data ?? {},
      testDate: d.test_date ?? "",
      // For prelim drafts, use application_number since certificate_number is null
      certificateNumber: d.is_preliminary
        ? (d.application_number ?? "")
        : (d.certificate_number ?? ""),
    }))
  );

  const [notes, setNotes] = useState("");

  const updateDraft = (
    index: number,
    updates: Partial<(typeof editableDrafts)[0]>
  ) => {
    setEditableDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...updates } : d))
    );
  };

  const hasErrorFlags = extraction.drafts.some((d) =>
    d.flags.some((f) => f.severity === "error")
  );

  const hasUnreliable = extraction.drafts.some((d) => !d.extraction_reliable);

  const handleSubmit = () => {
    // Validate all dates are filled
    for (let i = 0; i < editableDrafts.length; i++) {
      if (!editableDrafts[i].testDate) {
        alert(`Please enter a test date for ${extraction.drafts[i].health_test_type_name}`);
        return;
      }
    }

    const clearances: SubmitClearance[] = extraction.drafts.map((draft, i) => {
      const editable = editableDrafts[i];
      const testType = allTestTypes.find(
        (tt) => tt.id === draft.health_test_type_id
      );
      const orgSchema = testType?.organizations.find(
        (o) => o.id === draft.organization_id
      )?.result_schema;

      // For structured schemas, recompute result summary from edited data
      let finalResult = editable.result;
      let finalResultData: Record<string, unknown> | null = null;

      if (orgSchema && orgSchema.type !== "enum") {
        finalResult = computeResultSummary(editable.resultData, orgSchema) || editable.result;
        finalResultData = editable.resultData;
      } else if (draft.is_preliminary && editable.resultData && Object.keys(editable.resultData).length > 0) {
        // Prelim enum result — preserve result_data (contains findings)
        finalResultData = editable.resultData;
      }

      return {
        health_test_type_id: draft.health_test_type_id,
        organization_id: draft.organization_id,
        result: finalResult,
        result_data: finalResultData,
        test_date: editable.testDate,
        certificate_number: draft.is_preliminary ? undefined : (editable.certificateNumber || undefined),
        ...(draft.is_preliminary && {
          is_preliminary: true,
          application_number: editable.certificateNumber || undefined,
        }),
      };
    });

    onSubmit(clearances, extraction.certificate_url, notes);
  };

  return (
    <div className="space-y-4">
      {/* Unreliable banner */}
      {hasUnreliable && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">
            We couldn't confidently read some fields on this certificate.
            Please verify all highlighted fields below.
          </p>
        </div>
      )}

      {/* Draft cards */}
      {extraction.drafts.map((draft, index) => {
        const editable = editableDrafts[index];
        const testType = allTestTypes.find(
          (tt) => tt.id === draft.health_test_type_id
        );
        const orgEntry = testType?.organizations.find(
          (o) => o.id === draft.organization_id
        );
        const orgSchema = orgEntry?.result_schema ?? null;
        const enumOptions =
          orgSchema?.type === "enum"
            ? orgSchema.options
            : testType?.result_options ?? [];

        return (
          <div
            key={`${draft.health_test_type_id}-${draft.organization_id}`}
            className="border rounded-lg p-4 space-y-3"
          >
            {/* Header: test type + org */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-gray-900">
                  {draft.health_test_type_name}
                </span>
                <span className="text-sm text-gray-500">
                  via {draft.organization_name}
                </span>
                {draft.is_preliminary && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                    Prelim
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onFallbackToManual(extraction.certificate_url)}
                className="flex items-center gap-1 text-xs text-purple-600 hover:underline"
              >
                <Edit3 className="w-3 h-3" /> Edit manually
              </button>
            </div>

            {/* Flags */}
            {draft.flags.length > 0 && (
              <div className="space-y-1">
                {draft.flags.map((flag, fi) => (
                  <FlagPill key={fi} flag={flag} />
                ))}
              </div>
            )}

            {/* Confidence indicator */}
            <div className="flex items-center gap-2 text-xs">
              <ConfidenceBadge confidence={draft.row_confidence} />
              {draft.escalated && (
                <span className="text-gray-400">
                  (enhanced model used)
                </span>
              )}
            </div>

            {/* Result form */}
            <div className={confidenceClass(draft.field_confidences.result)}>
              <ResultFormRouter
                schema={orgSchema}
                enumOptions={enumOptions}
                resultValue={editable.result}
                resultData={editable.resultData}
                onResultChange={(v) => updateDraft(index, { result: v })}
                onResultDataChange={(v) =>
                  updateDraft(index, { resultData: v })
                }
              />
            </div>

            {/* Raw text from cert (for reference) */}
            {draft.raw_result_text && (
              <p className="text-xs text-gray-400">
                Certificate text: "{draft.raw_result_text}"
              </p>
            )}

            {/* Shared fields: date + cert number */}
            <div className="grid grid-cols-2 gap-3">
              <div className={confidenceClass(draft.field_confidences.test_date)}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Test Date *
                </label>
                <input
                  type="date"
                  value={editable.testDate}
                  onChange={(e) =>
                    updateDraft(index, { testDate: e.target.value })
                  }
                  className="w-full px-2 py-1.5 border rounded-lg text-sm"
                  required
                />
              </div>
              <div
                className={confidenceClass(
                  draft.field_confidences.certificate_number
                )}
              >
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {draft.is_preliminary ? "Application #" : "Certificate #"}
                </label>
                <input
                  type="text"
                  value={editable.certificateNumber}
                  onChange={(e) =>
                    updateDraft(index, {
                      certificateNumber: e.target.value,
                    })
                  }
                  className="w-full px-2 py-1.5 border rounded-lg text-sm"
                  placeholder="e.g., OFA123456"
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-2 py-1.5 border rounded-lg text-sm"
          rows={2}
          placeholder="Any additional notes..."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onFallbackToManual(extraction.certificate_url)}
          className="text-sm text-purple-600 hover:underline"
        >
          Enter manually instead
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={hasErrorFlags}
          className="bg-purple-600 text-white py-2 px-4 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex-1"
        >
          Submit{" "}
          {extraction.drafts.length > 1
            ? `${extraction.drafts.length} Tests`
            : "Test"}
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FlagPill({ flag }: { flag: VerificationFlag }) {
  const Icon =
    flag.severity === "error"
      ? AlertCircle
      : flag.severity === "warning"
        ? AlertTriangle
        : Info;

  const colors =
    flag.severity === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : flag.severity === "warning"
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-gray-50 border-gray-200 text-gray-600";

  return (
    <div
      className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-md border text-xs ${colors}`}
    >
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{flag.message}</span>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.9) {
    return (
      <span className="flex items-center gap-1 text-green-600">
        <CheckCircle className="w-3 h-3" /> High confidence ({pct}%)
      </span>
    );
  }
  if (confidence >= 0.7) {
    return (
      <span className="flex items-center gap-1 text-amber-600">
        <AlertTriangle className="w-3 h-3" /> Moderate confidence ({pct}%)
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-red-600">
      <AlertCircle className="w-3 h-3" /> Low confidence ({pct}%)
    </span>
  );
}

/**
 * Returns a CSS class string for confidence-based field highlighting.
 */
function confidenceClass(confidence: number | undefined): string {
  if (confidence === undefined) return "";
  if (confidence === 0) return "rounded-md ring-2 ring-red-300 p-1";
  if (confidence < 0.7) return "rounded-md ring-2 ring-amber-300 p-1";
  if (confidence < 0.9) return "rounded-md ring-1 ring-yellow-200 p-1";
  return "";
}
