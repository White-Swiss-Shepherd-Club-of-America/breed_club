/**
 * Scan-first registration flow.
 *
 * Lets the user drop or pick 1+ registration certificate files.
 * Renders PDF pages client-side, ships them to POST /api/dogs/extract-registration,
 * and hands the draft response off to RegistrationDraftReview.
 */

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { FileText, Loader2, ScanLine, UploadCloud, X } from "lucide-react";
import { api } from "@/lib/api";
import { preparePageImages } from "@/lib/pdf-to-images";
import type { RegistrationExtractionResponse } from "@breed-club/shared";

interface ScanRegistrationFlowProps {
  /** Called when extraction succeeds with usable draft data. */
  onSuccess: (result: RegistrationExtractionResponse) => void;
  /** Called when extraction fails or returns fallback_to_manual. */
  onFallback: (reason: string) => void;
  /** Skip scan and go straight to manual entry. */
  onSkip: () => void;
}

interface FileStatus {
  file: File;
  status: "pending" | "rendering" | "done" | "error";
  error?: string;
}

export function ScanRegistrationFlow({
  onSuccess,
  onFallback,
  onSkip,
}: ScanRegistrationFlowProps) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileStatus[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ─── File management ──────────────────────────────────────────────

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const valid = arr.filter((f) => {
      const allowed = ["application/pdf", "image/jpeg", "image/png"];
      return allowed.includes(f.type) || f.name.match(/\.(pdf|jpg|jpeg|png)$/i);
    });
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.file.name));
      const newEntries = valid
        .filter((f) => !names.has(f.name))
        .map((f) => ({ file: f, status: "pending" as const }));
      return [...prev, ...newEntries].slice(0, 10); // max 10
    });
    setScanError(null);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Drag & drop ──────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  // ─── Scan ─────────────────────────────────────────────────────────

  const handleScan = async () => {
    if (files.length === 0) return;

    setScanning(true);
    setScanError(null);

    try {
      const token = await getToken();

      // Render each file to page images
      const pageImagesByFile: Blob[][] = [];
      const updatedStatuses = [...files];

      for (let i = 0; i < files.length; i++) {
        updatedStatuses[i] = { ...files[i], status: "rendering" };
        setFiles([...updatedStatuses]);

        const { pages } = await preparePageImages(files[i].file, 4); // max 4 pages per doc
        pageImagesByFile.push(pages);

        updatedStatuses[i] = { ...updatedStatuses[i], status: "done" };
        setFiles([...updatedStatuses]);
      }

      // Call extraction API
      const result = await api.extractRegistration<RegistrationExtractionResponse>(
        files.map((f) => f.file),
        pageImagesByFile,
        { token }
      );

      if (result.fallback_to_manual) {
        onFallback(result.fallback_reason || "Could not read the documents automatically.");
        return;
      }

      onSuccess(result);
    } catch (err) {
      console.error("[ScanRegistrationFlow] Extraction failed:", err);
      setScanError(
        err instanceof Error
          ? err.message
          : "Something went wrong reading the documents. You can enter the details manually."
      );
    } finally {
      setScanning(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  const hasFiles = files.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex justify-center">
          <div className="p-3 bg-gray-100 rounded-full">
            <ScanLine className="w-8 h-8 text-gray-700" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          Scan Registration Documents
        </h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Upload one or more registration certificates and we'll extract the dog's details automatically.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !scanning && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-gray-700 bg-gray-50"
            : scanning
              ? "border-gray-200 bg-gray-50 cursor-not-allowed"
              : "border-gray-300 hover:border-gray-500 hover:bg-gray-50"
        }`}
      >
        <UploadCloud className="mx-auto w-10 h-10 text-gray-400 mb-2" />
        <p className="text-sm font-medium text-gray-700">
          {isDragging ? "Drop files here" : "Click to upload or drag & drop"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          PDF, JPG, or PNG &middot; Up to 10 files &middot; 10MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="space-y-2">
          {files.map((entry, i) => (
            <div
              key={`${entry.file.name}-${i}`}
              className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            >
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="flex-1 truncate text-gray-700">{entry.file.name}</span>
              <span className="text-xs text-gray-400 shrink-0">
                {(entry.file.size / 1024).toFixed(0)} KB
              </span>
              {entry.status === "rendering" && (
                <Loader2 className="w-4 h-4 text-gray-500 animate-spin shrink-0" />
              )}
              {entry.status === "done" && scanning && (
                <span className="text-xs text-green-600 shrink-0">Ready</span>
              )}
              {!scanning && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {scanError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {scanError}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleScan}
          disabled={!hasFiles || scanning}
          className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {scanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning {files.length} document{files.length !== 1 ? "s" : ""}...
            </>
          ) : (
            <>
              <ScanLine className="w-4 h-4" />
              Scan {hasFiles ? `${files.length} ` : ""}Document{files.length !== 1 ? "s" : ""}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={scanning}
          className="w-full py-2 px-4 text-gray-500 text-sm hover:text-gray-700 hover:underline disabled:opacity-40"
        >
          Skip — enter details manually instead
        </button>
      </div>
    </div>
  );
}
