/**
 * Resend email service wrapper.
 * Uses fetch directly (no SDK) — compatible with Cloudflare Workers.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(
  { to, subject, html, from = "WSSCA <noreply@mail.wssca.org>" }: SendEmailParams,
  apiKey: string
): Promise<void> {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${response.status} ${error}`);
  }
}

// ─── Email Templates ─────────────────────────────────────────────────────────

export function invitationEmail({
  inviteeName,
  inviteUrl,
  clubName,
  tier,
}: {
  inviteeName?: string;
  inviteUrl: string;
  clubName: string;
  tier: string;
}): string {
  const tierLabel = tier === "member" ? "Full Member" : tier.replace(/_/g, " ");
  const greeting = inviteeName ? `Hello ${inviteeName},` : "Hello,";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="font-size:24px;font-weight:bold;">${clubName}</h1>
  <p>${greeting}</p>
  <p>You've been invited to join <strong>${clubName}</strong> as a <strong>${tierLabel}</strong>.</p>
  <p>Click the button below to accept your invitation and set up your account:</p>
  <p style="text-align:center;margin:32px 0;">
    <a href="${inviteUrl}" style="background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
      Accept Invitation
    </a>
  </p>
  <p style="color:#666;font-size:14px;">This link expires in 7 days. If you did not expect this invitation, you can ignore this email.</p>
  <p style="color:#666;font-size:14px;">— The ${clubName} Team</p>
</body>
</html>`;
}

export function newApplicationEmail({
  applicantName,
  applicantEmail,
  adminUrl,
  clubName,
}: {
  applicantName: string;
  applicantEmail: string;
  adminUrl: string;
  clubName: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="font-size:24px;font-weight:bold;">${clubName}</h1>
  <p>A new membership application has been submitted.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr>
      <td style="padding:8px 0;color:#555;width:140px;">Name:</td>
      <td style="padding:8px 0;font-weight:600;">${applicantName}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;color:#555;">Email:</td>
      <td style="padding:8px 0;">${applicantEmail}</td>
    </tr>
  </table>
  <p style="text-align:center;margin:32px 0;">
    <a href="${adminUrl}" style="background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
      Review Application
    </a>
  </p>
  <p style="color:#666;font-size:14px;">— The ${clubName} System</p>
</body>
</html>`;
}

export function sireApprovalRequestEmail({
  sireOwnerName,
  sireName,
  breederName,
  litterName,
  whelpDate,
  dashboardUrl,
  clubName,
}: {
  sireOwnerName: string;
  sireName: string;
  breederName: string;
  litterName: string | null;
  whelpDate: string | null;
  dashboardUrl: string;
  clubName: string;
}): string {
  const greeting = sireOwnerName ? `Hello ${sireOwnerName},` : "Hello,";
  const litterLabel = litterName ? ` (${litterName})` : "";
  const whelpLabel = whelpDate ? `<tr><td style="padding:8px 0;color:#555;width:140px;">Whelp Date:</td><td style="padding:8px 0;">${whelpDate}</td></tr>` : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="font-size:24px;font-weight:bold;">${clubName}</h1>
  <p>${greeting}</p>
  <p><strong>${breederName}</strong> has registered a litter${litterLabel} using your sire <strong>${sireName}</strong> and is requesting your approval.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr>
      <td style="padding:8px 0;color:#555;width:140px;">Sire:</td>
      <td style="padding:8px 0;font-weight:600;">${sireName}</td>
    </tr>
    <tr>
      <td style="padding:8px 0;color:#555;">Breeder:</td>
      <td style="padding:8px 0;">${breederName}</td>
    </tr>
    ${whelpLabel}
  </table>
  <p>Please review and approve or reject this request from your dashboard:</p>
  <p style="text-align:center;margin:32px 0;">
    <a href="${dashboardUrl}" style="background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
      Go to Dashboard
    </a>
  </p>
  <p style="color:#666;font-size:14px;">— The ${clubName} Team</p>
</body>
</html>`;
}

export function welcomeEmail({
  memberName,
  tier,
  dashboardUrl,
  clubName,
}: {
  memberName: string;
  tier: string;
  dashboardUrl: string;
  clubName: string;
}): string {
  const tierLabel = tier === "member" ? "Full Member" : tier.replace(/_/g, " ");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="font-size:24px;font-weight:bold;">${clubName}</h1>
  <p>Welcome, ${memberName}!</p>
  <p>Your account has been set up as a <strong>${tierLabel}</strong> of ${clubName}.</p>
  <p style="text-align:center;margin:32px 0;">
    <a href="${dashboardUrl}" style="background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
      Go to Dashboard
    </a>
  </p>
  <p style="color:#666;font-size:14px;">— The ${clubName} Team</p>
</body>
</html>`;
}
