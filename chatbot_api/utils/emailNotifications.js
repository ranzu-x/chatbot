/**
 * Platform-wide SMTP notifications — Support Desk new-ticket/new-reply
 * emails, the guest-checkout welcome email, and account email verification
 * (see utils/emailVerification.js).
 *
 * One SMTP account (SMTP_HOST/PORT/USER/PASS/FROM env vars) sends every
 * notification across every agency's helpdesk — not per-agency BYO SMTP.
 * If those env vars aren't set (e.g. this hasn't been configured yet), every
 * call here logs what WOULD have been sent instead of throwing — a missing
 * mail server must never break ticket creation or replies.
 */
import nodemailer from "nodemailer";

let cachedTransporter = null;
let transporterConfigured = null; // null = not yet checked, true/false after

export function getTransporter() {
  if (transporterConfigured !== null) return cachedTransporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("[Email] SMTP_HOST/SMTP_USER/SMTP_PASS not set — emails (verification, tickets, welcome) will be logged, not sent. Set them in .env to enable real delivery (see .env.example, and `npm run test:email`).");
    transporterConfigured = false;
    cachedTransporter = null;
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  transporterConfigured = true;
  return cachedTransporter;
}

export const smtpFromAddress = () => process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost";

function wrapHtml(title, bodyHtml, footer = "This is an automated notification from your Support Desk.") {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:0.95rem;font-weight:700;color:#0f172a;">${title}</div>
      </div>
      <div style="padding:20px 24px;color:#334155;font-size:0.9rem;line-height:1.6;">${bodyHtml}</div>
      <div style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:0.75rem;">${footer}</div>
    </div>
  </body></html>`;
}

/** Sends one email, or logs it if SMTP isn't configured yet. Never throws —
 * a notification failure must never break the ticket action that triggered
 * it, so every call site should fire this without awaiting-and-handling. */
export async function sendTicketEmail({ to, subject, title, bodyHtml }) {
  if (!to) return;
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost";
  const html = wrapHtml(title || subject, bodyHtml);

  if (!transporter) {
    console.log(`[Email:not-sent] to=${to} subject="${subject}" — SMTP not configured`);
    return;
  }

  try {
    await transporter.sendMail({ from, to, subject, html });
  } catch (err) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, err.message);
  }
}

export function ticketUrl(ticketId) {
  const base = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
  return `${base}/support/tickets/${ticketId}`;
}

/** Sent once by the guest-checkout flow (routes/billing.js) right after a
 * payment webhook creates a brand-new account — the buyer's only notice
 * that their workspace now exists, since guest checkout never shows them
 * a signup form. Never throws, same posture as sendTicketEmail. */
export async function sendWelcomeEmail({ to, name, agencyName, loginUrl }) {
  if (!to) return;
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost";
  const subject = `Welcome to ${agencyName} — your account is ready`;
  const html = wrapHtml(
    "Your workspace is ready",
    `<p>Hi ${name || "there"},</p>
     <p>Thanks for your purchase! Your workspace <strong>${agencyName}</strong> has been created and your plan is active.</p>
     <p><a href="${loginUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700;">Log in to your workspace</a></p>
     <p style="color:#64748b;">Use the email and password you entered at checkout to sign in.</p>`,
    "This is an automated notification from your account."
  );

  if (!transporter) {
    console.log(`[Email:not-sent] to=${to} subject="${subject}" — SMTP not configured`);
    return;
  }

  try {
    await transporter.sendMail({ from, to, subject, html });
  } catch (err) {
    console.error(`[Email] Failed to send welcome email to ${to}:`, err.message);
  }
}

/** Sent on signup, after a guest checkout, and on demand (resend) — see
 * utils/emailVerification.js. Never throws, same posture as
 * sendTicketEmail/sendWelcomeEmail.
 *
 * When SMTP isn't configured the email can't go anywhere, so outside
 * production the verification link is printed to the server console instead
 * — otherwise a developer running locally could never complete signup. It is
 * deliberately NOT logged in production (the link is a credential). */
export async function sendVerificationEmail({ to, name, verifyUrl }) {
  if (!to) return;
  const transporter = getTransporter();
  const from = smtpFromAddress();
  const subject = "Verify your email address";
  const html = wrapHtml(
    "Confirm your email address",
    `<p>Hi ${name || "there"},</p>
     <p>Thanks for signing up! Please confirm this is your email address to verify your account.</p>
     <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700;">Verify my email</a></p>
     <p style="color:#64748b;font-size:0.82rem;">Or paste this link into your browser:<br/><span style="word-break:break-all;">${verifyUrl}</span></p>
     <p style="color:#64748b;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>`,
    "This is an automated message about your account."
  );

  if (!transporter) {
    console.log(`[Email:not-sent] to=${to} subject="${subject}" — SMTP not configured`);
    if (process.env.NODE_ENV !== "production") console.log(`[Email:dev] verification link for ${to}: ${verifyUrl}`);
    return;
  }

  try {
    await transporter.sendMail({ from, to, subject, html });
  } catch (err) {
    console.error(`[Email] Failed to send verification email to ${to}:`, err.message);
  }
}
