import { useState } from "react";
import { MailWarning } from "lucide-react";
import { forumAuthAPI } from "../forumApi";
import { useForumUI } from "../context/ForumUIContext";

/** "Verify your email to post" nudge — renders nothing unless a signed-in user is unverified. */
export default function EmailVerificationBanner({ user }) {
  const { toast } = useForumUI();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerified || user.role === "ADMIN") return null;

  const resend = async () => {
    setSending(true);
    try {
      await forumAuthAPI.resendVerification();
      setSent(true);
      toast("Verification email sent — check your inbox.");
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't send the email. Try again shortly.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fm-banner fm-banner-warn">
      <MailWarning size={18} />
      <span>Verify your email ({user.email}) to post threads and replies.</span>
      <button type="button" className="fm-btn fm-btn-secondary fm-btn-sm" onClick={resend} disabled={sending || sent}>
        {sent ? "Email sent" : sending ? "Sending…" : "Resend email"}
      </button>
    </div>
  );
}
