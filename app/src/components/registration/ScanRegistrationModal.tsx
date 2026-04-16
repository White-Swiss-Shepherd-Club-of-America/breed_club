/**
 * Modal for adding one or more external registrations to an existing dog.
 *
 * Two paths:
 *   1. Scan documents  → LLM extraction → pick which registrations to add
 *   2. Manual entry    → org + number form
 *
 * On success calls onSuccess() so the parent can invalidate/refetch.
 */

import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Plus,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { preparePageImages } from "@/lib/pdf-to-images";
import { useAddDogRegistration } from "@/hooks/useDogs";
import { usePublicOrganizations } from "@/hooks/useAdmin";
import { CertificateModal } from "@/components/CertificateModal";
import type { Organization, RegistrationExtractionResponse, MergedRegistration } from "@breed-club/shared";

interface ScanRegistrationModalProps {
  dogId: string;
  dogName: string;
  onSuccess: () => void;
  onClose: () => void;
}

type ModalStep = "choice" | "scanning" | "pick" | "manual";

// ─── Extracted registration row the user can select ──────────────────────────

interface SelectableReg {
  reg: MergedRegistration;
  selected: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || "/api";
function getCertUrl(urlOrKey: string): string {
  return urlOrKey.startsWith("http")
    ? urlOrKey
    : `${API_BASE}/uploads/certificate/${urlOrKey}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScanRegistrationModal({
  dogId,
  dogName,
  onSuccess,
  onClose,
}: ScanRegistrationModalProps) {
  const { getToken } = useAuth();
  const addMutation = useAddDogRegistration();
  const { data: orgsData } = usePublicOrganizations();
  const allOrgs: Organization[] = orgsData?.data || [];
  const kennelClubs = allOrgs.filter((o) => o.type === "kennel_club");

  const [step, setStep] = useState<ModalStep>("choice");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<RegistrationExtractionResponse | null>(null);
  const [selectableRegs, setSelectableRegs] = useState<SelectableReg[]>([]);
  const [viewingCert, setViewingCert] = useState<string | null>(null);
  const [certToken, setCertToken] = useState<string | null>(null);

  // Manual entry state
  const [manualOrgId, setManualOrgId] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // ─── Scan handler ──────────────────────────────────────────────────

  const handleScanFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setStep("scanning");
    setScanError(null);

    try {
      const token = await getToken();
      const fileArr = Array.from(files);

      const pageImagesByFile: Blob[][] = [];
      for (const file of fileArr) {
        const { pages } = await preparePageImages(file, 4);
        pageImagesByFile.push(pages);
      }

      const result = await api.extractRegistration<RegistrationExtractionResponse>(
        fileArr,
        pageImagesByFile,
        { token }
      );

      setScanResult(result);

      if (result.fallback_to_manual || result.registrations.length === 0) {
        setScanError(
          result.fallback_reason ||
            "Could not identify any registrations. Try uploading a clearer image or enter manually."
        );
        setStep("manual");
        return;
      }

      // Pre-select all registrations
      setSelectableRegs(
        result.registrations.map((reg) => ({ reg, selected: true }))
      );
      setStep("pick");
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : "Scan failed. Please try manually."
      );
      setStep("manual");
    }
  };

  // ─── Submit selected scanned registrations ─────────────────────────

  const handleSubmitScanned = async () => {
    const toAdd = selectableRegs.filter((sr) => sr.selected && sr.reg.organization_id);
    if (toAdd.length === 0) {
      setScanError("Please select at least one registration to add, or enter manually.");
      return;
    }

    setScanError(null);
    for (const { reg } of toAdd) {
      await addMutation.mutateAsync({
        dogId,
        organization_id: reg.organization_id!,
        registration_number: reg.registration_number,
        registration_url: scanResult?.certificate_urls[reg.document_index],
      });
    }
    onSuccess();
    onClose();
  };

  // ─── Submit manual entry ───────────────────────────────────────────

  const handleSubmitManual = async () => {
    if (!manualOrgId || !manualNumber.trim()) {
      setManualError("Please select an organization and enter a registration number.");
      return;
    }

    setManualError(null);

    let certUrl: string | undefined;
    if (manualFile) {
      try {
        setUploading(true);
        const token = await getToken();
        const result = await api.upload<{ key: string }>(
          "/uploads/certificate",
          manualFile,
          { token }
        );
        certUrl = result.key;
      } catch {
        setManualError("Failed to upload certificate file. Please try again.");
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    try {
      await addMutation.mutateAsync({
        dogId,
        organization_id: manualOrgId,
        registration_number: manualNumber.trim(),
        registration_url: certUrl,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setManualError(
        err instanceof ApiRequestError
          ? err.error?.message || "Failed to add registration."
          : "Failed to add registration. Please try again."
      );
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Add Registration</h2>
            <p className="text-xs text-gray-500 mt-0.5">{dogName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* ── Choice step ── */}
          {step === "choice" && (
            <div className="space-y-3">
              {/* Scan option */}
              <label
                htmlFor="reg-scan-input"
                className="flex items-center gap-3 p-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-gray-600 hover:bg-gray-50 transition-colors"
              >
                <ScanLine className="w-7 h-7 text-gray-600 shrink-0" />
                <div>
                  <span className="font-medium text-sm text-gray-900 block">
                    Scan Registration Documents
                  </span>
                  <span className="text-xs text-gray-500">
                    Upload a PDF or photo — we'll extract the registration automatically
                  </span>
                </div>
                <input
                  id="reg-scan-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  className="hidden"
                  onChange={(e) => handleScanFiles(e.target.files)}
                />
              </label>

              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              <button
                type="button"
                onClick={() => setStep("manual")}
                className="w-full py-2.5 px-4 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Enter Registration Manually
              </button>
            </div>
          )}

          {/* ── Scanning step ── */}
          {step === "scanning" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-8 h-8 text-gray-700 animate-spin" />
              <p className="text-sm text-gray-600">Scanning documents...</p>
            </div>
          )}

          {/* ── Pick registrations from scan ── */}
          {step === "pick" && scanResult && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Found <strong>{selectableRegs.length}</strong> registration
                {selectableRegs.length !== 1 ? "s" : ""} in your documents.
                Select which ones to add to{" "}
                <span className="font-medium">{dogName}</span>:
              </p>

              <div className="space-y-2">
                {selectableRegs.map((sr, i) => {
                  const doc = scanResult.documents[sr.reg.document_index];
                  const hasOrgId = !!sr.reg.organization_id;
                  return (
                    <label
                      key={i}
                      className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                        sr.selected
                          ? "border-gray-800 bg-gray-50"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sr.selected}
                        onChange={(e) => {
                          const updated = [...selectableRegs];
                          updated[i] = { ...sr, selected: e.target.checked };
                          setSelectableRegs(updated);
                        }}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded">
                            {sr.reg.organization_abbreviation}
                          </span>
                          <span className="font-mono text-sm text-gray-900">
                            {sr.reg.registration_number}
                          </span>
                          {hasOrgId ? (
                            <span className="text-xs text-green-600 flex items-center gap-0.5">
                              <CheckCircle className="w-3 h-3" /> Matched
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3" /> New org will be created
                            </span>
                          )}
                        </div>
                        {doc && (
                          <div className="mt-0.5 text-xs text-gray-500">
                            from {doc.registry_name}
                            {doc.document_type === "export_pedigree" && " (export pedigree)"}
                            {" · "}
                            {doc.registered_name && (
                              <span>name on cert: <em>{doc.registered_name}</em></span>
                            )}
                          </div>
                        )}
                        {/* View the certificate scan (auth-gated modal) */}
                        {scanResult.certificate_urls[sr.reg.document_index] && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const tok = await getToken();
                              setCertToken(tok);
                              setViewingCert(getCertUrl(scanResult.certificate_urls[sr.reg.document_index]));
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 hover:underline mt-0.5 inline-block"
                          >
                            View certificate
                          </button>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Cross-doc conflicts */}
              {(scanResult.conflicts || []).length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                  {scanResult.conflicts.map((c, ci) => (
                    <div key={ci} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                      <span>
                        <strong>{c.field}</strong> differs across documents:{" "}
                        {c.values.map((v) => `${v.registry}: "${v.value}"`).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {scanError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex gap-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {scanError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("manual")}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Enter manually instead
                </button>
                <button
                  type="button"
                  onClick={handleSubmitScanned}
                  disabled={
                    addMutation.isPending ||
                    selectableRegs.filter((sr) => sr.selected).length === 0
                  }
                  className="flex-1 py-2 px-4 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {addMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Add {selectableRegs.filter((sr) => sr.selected).length}{" "}
                      Registration{selectableRegs.filter((sr) => sr.selected).length !== 1 ? "s" : ""}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Manual entry step ── */}
          {step === "manual" && (
            <div className="space-y-4">
              {scanError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  {scanError} Please enter the details below.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Organization <span className="text-red-500">*</span>
                </label>
                <select
                  value={manualOrgId}
                  onChange={(e) => setManualOrgId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="">Select organization...</option>
                  {kennelClubs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Registration Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={manualNumber}
                  onChange={(e) => setManualNumber(e.target.value)}
                  placeholder="e.g., DN22777109, P748-594, JR 72023 Bso"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificate Document{" "}
                  <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setManualFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                {manualFile && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <span>{manualFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setManualFile(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {manualError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex gap-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {manualError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep("choice")}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmitManual}
                  disabled={addMutation.isPending || uploading}
                  className="flex-1 py-2 px-4 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {uploading || addMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {uploading ? "Uploading..." : "Saving..."}</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Add Registration</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewingCert && (
        <CertificateModal
          url={viewingCert}
          token={certToken}
          onClose={() => { setViewingCert(null); setCertToken(null); }}
        />
      )}
    </div>
  );
}
