/**
 * Image utility helpers for the extraction pipeline.
 */

/**
 * Detect the actual media type of a base64-encoded image by inspecting
 * the leading magic bytes — independent of whatever Content-Type the
 * client claims.
 *
 * Anthropic's API rejects requests where the declared media_type doesn't
 * match the actual image format, so we must sniff rather than trust the
 * upload metadata.
 *
 * Supports: JPEG, PNG, GIF, WebP.
 * Falls back to "image/jpeg" (most common for scanned certs) if unknown.
 */
export function detectImageMediaType(base64Data: string): string {
  // Decode just the first few bytes (we only need up to 12 bytes for WebP)
  // atob is available in both browser and Cloudflare Workers
  const prefix = base64Data.slice(0, 16);
  let bytes: Uint8Array;
  try {
    const binary = atob(prefix);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } catch {
    return "image/jpeg"; // safe fallback
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP  (bytes 0-3 = 52 49 46 46, bytes 8-11 = 57 45 42 50)
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // Default: JPEG is by far the most common format for scanned registration certs
  return "image/jpeg";
}

/**
 * Build LLM image content blocks from base64 strings, automatically
 * detecting the correct media type for each image.
 */
export function buildImageBlocks(
  pageImages: string[]
): Array<{ type: "image"; media_type: string; data: string }> {
  return pageImages.map((data) => ({
    type: "image" as const,
    media_type: detectImageMediaType(data),
    data,
  }));
}
