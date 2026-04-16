/**
 * API client for the breed-club-manager backend.
 * All API calls go through this module.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  params?: Record<string, string | number | undefined>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, token, params } = options;

    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.set(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const responseData = await response.json().catch(() => ({
        error: { code: "UNKNOWN", message: response.statusText },
      }));

      // For 402, preserve the full response (requiresPayment, amountCents, etc.)
      if (response.status === 402) {
        throw new ApiRequestError(
          402,
          { code: "PAYMENT_REQUIRED", message: "Payment required" },
          responseData
        );
      }

      throw new ApiRequestError(response.status, responseData.error || responseData);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }

  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "PUT", body });
  }

  delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  async upload<T>(path: string, file: File, options?: { token?: string | null }): Promise<T> {
    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (options?.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const responseData = await response.json().catch(() => ({
        error: { code: "UNKNOWN", message: response.statusText },
      }));
      throw new ApiRequestError(response.status, responseData.error || responseData);
    }

    return response.json();
  }

  /**
   * Upload 1+ registration documents + pre-rendered page images to the extraction endpoint.
   * Returns a draft with suggested dog fields, detected conflicts, and matched registrations.
   *
   * @param files - Original PDF/image files (stored to R2)
   * @param pageImagesByFile - Per-file arrays of pre-rendered PNG blobs (for LLM vision)
   * @param options - Auth token etc.
   */
  async extractRegistration<T>(
    files: File[],
    pageImagesByFile: Blob[][],
    options?: { token?: string | null }
  ): Promise<T> {
    const formData = new FormData();

    for (const file of files) {
      formData.append("files[]", file);
    }

    for (let i = 0; i < pageImagesByFile.length; i++) {
      for (const page of pageImagesByFile[i]) {
        formData.append(`pages[${i}][]`, page, "page.png");
      }
    }

    const headers: Record<string, string> = {};
    if (options?.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }

    const response = await fetch(`${this.baseUrl}/dogs/extract-registration`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const responseData = await response.json().catch(() => ({
        error: { code: "UNKNOWN", message: response.statusText },
      }));
      throw new ApiRequestError(
        response.status,
        responseData.error || responseData
      );
    }

    return response.json();
  }

  /**
   * Upload a certificate file + pre-rendered page images to the extraction endpoint.
   * Returns draft clearance rows with confidence scores and verification flags.
   */
  async extractCert<T>(
    dogId: string,
    file: File,
    pageImages: Blob[],
    options?: { token?: string | null }
  ): Promise<T> {
    const formData = new FormData();
    formData.append("file", file);
    for (const page of pageImages) {
      formData.append("pages[]", page, "page.png");
    }

    const headers: Record<string, string> = {};
    if (options?.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }

    const response = await fetch(
      `${this.baseUrl}/health/dogs/${dogId}/extract`,
      {
        method: "POST",
        headers,
        body: formData,
      }
    );

    if (!response.ok) {
      const responseData = await response.json().catch(() => ({
        error: { code: "UNKNOWN", message: response.statusText },
      }));
      throw new ApiRequestError(
        response.status,
        responseData.error || responseData
      );
    }

    return response.json();
  }
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public error: { code: string; message: string; details?: Record<string, unknown> },
    public data?: unknown // Preserve full response data (e.g., 402 payment info)
  ) {
    super(error.message);
    this.name = "ApiRequestError";
  }
}

export const api = new ApiClient(API_BASE);
