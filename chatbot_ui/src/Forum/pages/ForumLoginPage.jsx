import { useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router";
import { MessagesSquare, Loader2, Bug, Lightbulb, Megaphone } from "lucide-react";
import { useForumAuth } from "../context/ForumAuthContext";

const factorOf = (v) => (/[a-z-]/i.test(v) ? { backupCode: v.trim() } : { code: v.replace(/\s+/g, "") });

export default function ForumLoginPage() {
  const { user, login, completeTwoFactor } = useForumAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/forum";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(null); // two-factor login on
  const [code, setCode] = useState("");

  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (challenge) {
        await completeTwoFactor(challenge, factorOf(code));
      } else {
        const result = await login(email, password);
        if (result?.twoFactorRequired) { setChallenge(result.challengeToken); return; }
      }
      navigate(from, { replace: true });
    } catch (err) {
      if (err?.response?.data?.code === "CHALLENGE_EXPIRED") { setChallenge(null); setCode(""); }
      setError(err?.response?.data?.message || (challenge ? "That code is not right." : "Invalid email or password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fm-auth">
      <div className="fm-auth-brand">
        <div className="fm-brand" style={{ color: "#fff" }}>
          <span className="fm-brand-mark" style={{ background: "rgba(255,255,255,0.2)", boxShadow: "none" }}><MessagesSquare size={17} /></span>
          Nexa Community
        </div>
        <div>
          <h2>Where Nexa gets built, together.</h2>
          <p>Sign in with your Nexa AI Chat account to report bugs, vote on ideas and join the conversation.</p>
          <ul>
            <li><Bug size={17} /> Report bugs and follow the fix</li>
            <li><Lightbulb size={17} /> Request and upvote features</li>
            <li><Megaphone size={17} /> Read product announcements</li>
          </ul>
        </div>
        <span />
      </div>

      <div className="fm-auth-form">
        <div className="fm-auth-card">
          <h1>Sign in</h1>
          <p>Use the same email and password as your Nexa AI Chat account.</p>

          {error && <div className="fm-banner fm-banner-danger">{error}</div>}

          <form onSubmit={submit}>
            {challenge ? (
              <div className="fm-field">
                <label className="fm-label" htmlFor="fm-code">Two-factor code</label>
                <input id="fm-code" className="fm-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code, or a backup code" autoComplete="one-time-code" required autoFocus />
              </div>
            ) : (<>
            <div className="fm-field">
              <label className="fm-label" htmlFor="fm-email">Email</label>
              <input id="fm-email" className="fm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="fm-field">
              <label className="fm-label" htmlFor="fm-password">Password</label>
              <input id="fm-password" className="fm-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            </>)}
            <button type="submit" className="fm-btn fm-btn-primary fm-btn-block" style={{ padding: 12 }} disabled={busy}>
              {busy ? <Loader2 size={16} style={{ animation: "fm-spin 0.7s linear infinite" }} /> : challenge ? "Verify" : "Sign in"}
            </button>
          </form>

          <p style={{ marginTop: 18, textAlign: "center", fontSize: "0.85rem" }}>
            <Link to="/forum" style={{ color: "var(--fm-accent)", fontWeight: 700 }}>Browse the forum without signing in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
