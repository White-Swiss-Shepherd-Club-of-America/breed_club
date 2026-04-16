/**
 * Modal for viewing health clearance certificate images and PDFs.
 */

import { useState, useEffect } from "react";
import { PdfViewer } from "@/components/PdfViewer";

interface CertificateModalProps {
  url: string;
  onClose: () => void;
  token?: string | null;
}

export function CertificateModal({ url, onClose, token }: CertificateModalProps) {
  const isPdf =
    url.toLowerCase().endsWith(".pdf") || url.includes("application/pdf");

  const httpHeaders: Record<string, string> | undefined = token
    ? { Authorization: `Bearer ${token}` }
    : undefined;

  // For images, fetch with auth token and create a blob URL
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (isPdf || !token) return;
    let objectUrl: string | null = null;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setImageBlobUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token, isPdf]);

  const imageDisplayUrl = !isPdf ? (imageBlobUrl ?? (token ? null : url)) : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Certificate</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {isPdf ? (
          <PdfViewer url={url} httpHeaders={httpHeaders} />
        ) : imageDisplayUrl ? (
          <img src={imageDisplayUrl} alt="Certificate" className="w-full rounded border" />
        ) : (
          <p className="text-sm text-gray-400 mt-2">Loading...</p>
        )}

        <div className="mt-4 flex justify-end">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Open in new tab
          </a>
        </div>
      </div>
    </div>
  );
}
