/**
 * Modal for viewing health clearance certificate images and PDFs.
 */

import { PdfViewer } from "@/components/PdfViewer";

interface CertificateModalProps {
  url: string;
  onClose: () => void;
}

export function CertificateModal({ url, onClose }: CertificateModalProps) {
  const isPdf =
    url.toLowerCase().endsWith(".pdf") || url.includes("application/pdf");

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
          <PdfViewer url={url} />
        ) : (
          <img src={url} alt="Certificate" className="w-full rounded border" />
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
