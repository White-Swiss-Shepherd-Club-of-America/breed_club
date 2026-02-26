/**
 * reCAPTCHA token verification utility.
 * Supports both v2 (checkbox/invisible) and v3 (score-based).
 */

export async function verifyRecaptcha(
  token: string,
  secretKey: string
): Promise<boolean> {
  const response = await fetch(
    "https://www.google.com/recaptcha/api/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    }
  );
  const data = (await response.json()) as {
    success: boolean;
    score?: number;
  };
  // v2: just check success; v3: also check score >= 0.5
  return data.success === true && (data.score === undefined || data.score >= 0.5);
}
