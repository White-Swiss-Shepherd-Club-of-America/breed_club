/**
 * Structured API errors with HTTP status codes.
 */

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const notFound = (resource: string) =>
  new ApiError(404, "NOT_FOUND", `${resource} not found`);

export const forbidden = (message = "You do not have permission to perform this action") =>
  new ApiError(403, "FORBIDDEN", message);

export const unauthorized = (message = "Authentication required") =>
  new ApiError(401, "UNAUTHORIZED", message);

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new ApiError(400, "BAD_REQUEST", message, details);

export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);

export const validationError = (errors: Record<string, string[]>) =>
  new ApiError(422, "VALIDATION_ERROR", "Validation failed", { errors });
