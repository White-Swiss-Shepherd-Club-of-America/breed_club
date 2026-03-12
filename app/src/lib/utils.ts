/**
 * Date formatting utilities.
 *
 * All DATE fields from the API arrive as bare "YYYY-MM-DD" strings.
 * Passing those to `new Date(str)` causes UTC midnight parsing, which
 * toLocaleDateString() then shifts back one day in US timezones.
 * These helpers parse date parts directly to avoid that offset.
 */

/**
 * Parse a bare "YYYY-MM-DD" date string into a local-midnight Date.
 * Safe to use with DATE columns from the API.
 * Returns null if the input is falsy.
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a bare "YYYY-MM-DD" date string for display using the user's locale.
 * Returns "—" for null/undefined/empty input.
 * Accepts optional Intl.DateTimeFormatOptions for custom formatting.
 */
export function formatDate(
  dateStr: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseLocalDate(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, options);
}

/**
 * Extract just the year from a bare "YYYY-MM-DD" date string.
 * Returns null for null/undefined/empty input.
 */
export function dateYear(dateStr: string | null | undefined): number | null {
  const d = parseLocalDate(dateStr);
  return d ? d.getFullYear() : null;
}
