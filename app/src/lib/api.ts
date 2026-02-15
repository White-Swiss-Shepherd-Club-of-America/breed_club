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
      const error = await response.json().catch(() => ({
        error: { code: "UNKNOWN", message: response.statusText },
      }));
      throw new ApiRequestError(response.status, error.error);
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

  delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public error: { code: string; message: string; details?: Record<string, unknown> }
  ) {
    super(error.message);
    this.name = "ApiRequestError";
  }
}

export const api = new ApiClient(API_BASE);
