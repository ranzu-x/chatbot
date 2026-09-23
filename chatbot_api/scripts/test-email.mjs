/**
 * Checks that the SMTP settings in .env actually work, and (optionally) sends
 * a real test email — so you find out BEFORE a customer's verification email
 * silently goes nowhere.
 *
 *   npm run test:email                      -> checks the connection/login only
 *   npm run test:email -- you@example.com   -> also sends a test email there
 *
 * Never prints SMTP_PASS. Uses the exact same transporter the app uses
 * (utils/emailNotifications.js), so if this works, verification emails work.
 */
import dotenv from "dotenv";
dotenv.config();
import { getTransporter, smtpFromAddress } from "../utils/emailNotifications.js";

const to = process.argv[2];
const mask = (v) => (v ? `${String(v).slice(0, 3)}…(${String(v).length} chars)` : "(not set)");

console.log("\nSMTP settings found in .env:");
console.log(`  SMTP_HOST : ${process.env.SMTP_HOST || "(not set)"}`);
console.log(`  SMTP_PORT : ${process.env.SMTP_PORT || "(not set — defaults to 587)"}`);
console.log(`  SMTP_USER : ${process.env.SMTP_USER || "(not set)"}`);
console.log(`  SMTP_PASS : ${mask(process.env.SMTP_PASS)}`);
console.log(`  SMTP_FROM : ${smtpFromAddress()}\n`);

const transporter = getTransporter();
if (!transporter) {
  console.log("❌ SMTP isn't configured — the app is only LOGGING emails, not sending them.");
  console.log("   Fill in SMTP_HOST / SMTP_USER / SMTP_PASS in chatbot_api/.env (free options are listed in .env.example), then run this again.\n");
  process.exit(1);
}

try {
  await transporter.verify();
  console.log("✅ Connected and logged in to the SMTP server.");
} catch (err) {
  console.log(`❌ Could not connect/log in: ${err.message}`);
  const hints = {
    EAUTH: "Wrong SMTP_USER/SMTP_PASS. (Gmail needs an App Password, not your normal password; Brevo needs an SMTP key, not your account password.)",
    ECONNECTION: "Can't reach the server — check SMTP_HOST and SMTP_PORT (587 = STARTTLS, 465 = SSL).",
    ESOCKET: "Connection/TLS problem — try the other port (587 ↔ 465).",
    ETIMEDOUT: "Timed out — your network/host may block outbound SMTP; try port 465 or 2525.",
  };
  const unreachable = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(err.message);
  const hint = unreachable ? hints.ECONNECTION + ' (A typo in SMTP_HOST is the usual cause.)' : hints[err.code];
  if (hint) console.log(`   Hint: ${hint}`);
  console.log("");
  process.exit(1);
}

if (!to) {
  console.log("   (Add an address to also send a test email:  npm run test:email -- you@example.com)\n");
  process.exit(0);
}

try {
  const info = await transporter.sendMail({
    from: smtpFromAddress(),
    to,
    subject: "Test email from your Nexa AI Chat server",
    text: "If you can read this, your SMTP settings work and account verification emails will be delivered.",
  });
  console.log(`✅ Test email sent to ${to} (id ${info.messageId}).`);
  console.log("   Check the inbox — and the spam folder. If it landed in spam, add your provider's SPF/DKIM DNS records.\n");
} catch (err) {
  console.log(`❌ Connected, but sending failed: ${err.message}`);
  console.log("   Most often SMTP_FROM isn't a sender/domain your provider has verified.\n");
  process.exit(1);
}
