/**
 * PdfViewer - Cross-browser inline PDF renderer using PDF.js
 *
 * Renders a PDF to a <canvas> element using pdfjs-dist.
 * Supports multi-page navigation and scales to container width.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfViewer({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPageNum(1);

    pdfjsLib.getDocument(url).promise
      .then((pdf) => {
        if (cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [url]);

  const renderPage = useCallback(async (num: number) => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!pdf || !canvas || !container) return;

    // Cancel any in-progress render
    renderTaskRef.current?.cancel();

    const page = await pdf.getPage(num);
    const containerWidth = container.clientWidth;
    const naturalViewport = page.getViewport({ scale: 1 });
    const scale = containerWidth / naturalViewport.width;
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    renderTaskRef.current = page.render({ canvas, viewport });
    try {
      await renderTaskRef.current.promise;
    } catch {
      // Cancelled renders throw — ignore
    }
  }, []);

  useEffect(() => {
    if (!loading && !error) renderPage(pageNum);
  }, [pageNum, loading, error, renderPage]);

  if (error) return <p className="text-sm text-red-500 mt-2">Failed to load PDF.</p>;
  if (loading) return <p className="text-sm text-gray-400 mt-2">Loading PDF...</p>;

  return (
    <div ref={containerRef} className="mt-2">
      <canvas ref={canvasRef} className="w-full rounded border" />
      {numPages > 1 && (
        <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
          <button
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum === 1}
            className="px-2 py-0.5 rounded border disabled:opacity-40 hover:bg-gray-100"
          >
            ←
          </button>
          <span>Page {pageNum} of {numPages}</span>
          <button
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            disabled={pageNum === numPages}
            className="px-2 py-0.5 rounded border disabled:opacity-40 hover:bg-gray-100"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
