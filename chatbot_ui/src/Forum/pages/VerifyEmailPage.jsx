import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router";
import { MailCheck, MailX, MessagesSquare } from "lucide-react";
import { forumAuthAPI } from "../forumApi";
import { useForumAuth } from "../context/ForumAuthContext";

// The page the verification email's link opens (${FRONTEND_URL}/forum/verify-email?token=…).
// Works whether or not the visitor is signed in to the forum; if they are,
// their session is refreshed so the "verify your email" banner disappears.
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const { user, refreshUser } = useForumAuth();
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This link is missing its verification token.");
      return;
    }
    forumAuthAPI.verifyEmail(token)
      .then(async () => {
        setStatus("success");
        await refreshUser();
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err?.response?.data?.message || "This verification link is invalid or has expired.");
      });
  }, [token, refreshUser]);

  return (
    <div className="fm-fullpage" style={{ padding: 20 }}>
      <div className="fm-card fm-center">
        <Link to="/forum" className="fm-brand" style={{ justifyContent: "center", marginBottom: 22 }}>
          <span className="fm-brand-mark"><MessagesSquare size={17} /></span> Nexa Community
        </Link>

        {status === "loading" && <div className="fm-spinner" />}

        {status === "success" && (
          <>
            <span className="fm-bigicon" style={{ background: "color-mix(in srgb, var(--fm-success) 14%, transparent)", color: "var(--fm-success)" }}><MailCheck size={28} /></span>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800 }}>Email verified</h2>
            <p style={{ color: "var(--fm-text-2)", margin: "8px 0 20px" }}>You can now post threads and replies in the community.</p>
            <Link to={user ? "/forum" : "/forum/login"} className="fm-btn fm-btn-primary">{user ? "Go to the forum" : "Sign in"}</Link>
          </>
        )}

        {status === "error" && (
          <>
            <span className="fm-bigicon" style={{ background: "color-mix(in srgb, var(--fm-danger) 14%, transparent)", color: "var(--fm-danger)" }}><MailX size={28} /></span>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800 }}>Verification failed</h2>
            <p style={{ color: "var(--fm-text-2)", margin: "8px 0 20px" }}>{message}</p>
            <Link to="/forum/login" className="fm-btn fm-btn-secondary">Sign in to request a new link</Link>
          </>
        )}
      </div>
    </div>
  );
}
