/**
 * Client-side PDF → PNG image rendering.
 *
 * Pluggable interface: the default uses pdfjs-dist in the browser.
 * Can be swapped for server-side rendering in v2.
 */

export interface PdfRenderResult {
  pages: Blob[];
  pageCount: number;
}

export type PdfRenderer = (file: File) => Promise<PdfRenderResult>;

/** Default DPI for rendering. 150 DPI gives ~1275x1650 for a letter-size page. */
const RENDER_DPI = 150;
const RENDER_SCALE = RENDER_DPI / 72; // PDF units are 72 DPI

/**
 * Render a PDF file to PNG images using pdfjs-dist.
 * Renders only the first page for MVP (single-result certs).
 * Set maxPages > 1 for panel certs in v2.
 */
export async function renderPdfToImages(
  file: File,
  maxPages = 1
): Promise<PdfRenderResult> {
  // Dynamic import so pdfjs-dist is only loaded when needed
  const pdfjsLib = await import("pdfjs-dist");

  // Set the worker source to the bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pagesToRender = Math.min(pdf.numPages, maxPages);
  const pages: Blob[] = [];

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas 2d context");
    }

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
        "image/png"
      );
    });

    pages.push(blob);

    // Clean up
    canvas.width = 0;
    canvas.height = 0;
  }

  return { pages, pageCount: pdf.numPages };
}

/**
 * Check if a file is a PDF (vs. a direct image upload).
 */
export function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Convert an image File directly to a Blob (for JPEG/PNG cert uploads).
 * No rendering needed — just wrap the file.
 */
export async function imageFileToBlob(file: File): Promise<PdfRenderResult> {
  return {
    pages: [file],
    pageCount: 1,
  };
}

/**
 * Prepare page images for upload to the extraction API.
 * Handles both PDF and direct image uploads.
 */
export async function preparePageImages(
  file: File,
  maxPages = 1
): Promise<PdfRenderResult> {
  if (isPdf(file)) {
    return renderPdfToImages(file, maxPages);
  }
  return imageFileToBlob(file);
}
