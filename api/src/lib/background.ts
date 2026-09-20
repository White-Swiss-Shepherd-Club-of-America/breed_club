import type { Context } from "hono";

/**
 * Schedule work that must outlive the response without dropping it.
 *
 * Cloudflare Workers may cancel a request's execution context as soon as the
 * response is returned, so a bare `promise.catch(() => {})` is not guaranteed
 * to run — that is how health-rating recomputes silently went missing. The
 * correct idiom is `executionCtx.waitUntil`.
 *
 * `c.executionCtx` is a getter that THROWS ("This context has no
 * ExecutionContext") outside the Workers runtime — under vitest, `app.fetch`
 * without a third argument, or plain Node. Guarding here keeps that platform
 * detail out of every call site.
 *
 * Failures are always logged. Swallowing them with an empty catch is what made
 * the original bug invisible.
 */
export function scheduleBackground(c: Context, work: Promise<unknown>, label: string): void {
  const guarded = work.catch((err) => console.error(`${label} failed:`, err));
  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    // No ExecutionContext — the promise is already running; nothing to await.
  }
}
