/**
 * Prompted after a registration scan that produced no pedigree data.
 *
 * Offers the user the chance to upload a separate export pedigree document
 * (FCI export pedigree, AKC three-generation pedigree, etc.) and scan it
 * to extract ancestor information.
 *
 * On success, calls onSuccess with the extracted pedigree tree merged into
 * the caller's extraction result. On skip, calls onSkip to proceed to review.
 */

import { useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  FileText,
  GitFork,
  Loader2,
  SkipForward,
  UploadCloud,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { preparePageImages } from "@/lib/pdf-to-images";
import type { ExtractedPedigree, RegistrationExtractionResponse } from "@breed-club/shared";

interface PedigreeScanPromptProps {
  dogName: string;
  onSuccess: (pedigree: ExtractedPedigree) => void;
  onSkip: () => void;
}

export function PedigreeScanPrompt({ dogName, onSuccess, onSkip }: PedigreeScanPromptProps) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    if (!file) return;
    setScanning(true);
    setError(null);

    try {
      const token = await getToken();
      const { pages } = await preparePageImages(file, 4);

      const result = await api.extractRegistration<RegistrationExtractionResponse>(
        [file],
        [pages],
        { token }
      );

      // Look for a pedigree in the extracted result — either from the
      // suggested merge or directly on the first document.
      const pedigree =
        result.suggested?.pedigree ??
        result.documents?.[0]?.pedigree ??
        null;

      if (!pedigree || !hasPedigreeData(pedigree)) {
        setError(
          "No pedigree data could be extracted from this document. " +
          "Make sure you're uploading an export pedigree or multi-generation pedigree certificate."
        );
        return;
      }

      onSuccess(pedigree);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong reading the pedigree document."
      );
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex justify-center">
          <div className="p-3 bg-gray-100 rounded-full">
            <GitFork className="w-8 h-8 text-gray-700" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Add Pedigree?</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          The registration certificate for{" "}
          <strong className="text-gray-700">{dogName}</strong> doesn't include
          pedigree information. Upload a separate export pedigree document to
          extract the ancestors automatically.
        </p>
      </div>

      {/* Upload area */}
      <div
        onClick={() => !scanning && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          scanning
            ? "border-gray-200 bg-gray-50 cursor-not-allowed"
            : file
              ? "border-green-400 bg-green-50"
              : "border-gray-300 hover:border-gray-500 hover:bg-gray-50"
        }`}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="w-6 h-6 text-green-600 shrink-0" />
            <div className="text-left min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
              <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            {!scanning && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); setError(null); }}
                className="text-gray-400 hover:text-gray-600 shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <>
            <UploadCloud className="mx-auto w-10 h-10 text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-700">
              Upload export pedigree document
            </p>
            <p className="text-xs text-gray-400 mt-1">
              FCI export pedigree, AKC pedigree, etc. · PDF, JPG, or PNG
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); setError(null); }
            e.target.value = "";
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleScan}
          disabled={!file || scanning}
          className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {scanning ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Scanning pedigree...</>
          ) : (
            <><GitFork className="w-4 h-4" /> Scan Pedigree Document</>
          )}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={scanning}
          className="w-full py-2 px-4 text-gray-500 text-sm hover:text-gray-700 hover:underline disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Skip — I don't have a pedigree document
        </button>
      </div>
    </div>
  );
}

function hasPedigreeData(pedigree: ExtractedPedigree): boolean {
  return Object.values(pedigree).some((v) => v != null);
}
