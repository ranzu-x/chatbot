import { useState } from "react";
import { useNavigate } from "react-router";
import { LifeBuoy, Loader2 } from "lucide-react";
import { useSupportAuth } from "../context/SupportAuthContext";
import "../supportDesk.css";

const factorOf = (v) => (/[a-z-]/i.test(v) ? { backupCode: v.trim() } : { code: v.replace(/\s+/g, "") });

export default function SupportLoginPage() {
  const { login, completeTwoFactor, user } = useSupportAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null); // two-factor login on
  const [code, setCode] = useState("");

  if (user) {
    navigate("/support/tickets", { replace: true });
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (challenge) {
        await completeTwoFactor(challenge, factorOf(code));
      } else {
        const result = await login(email, password);
        if (result?.twoFactorRequired) { setChallenge(result.challengeToken); return; }
      }
      navigate("/support/tickets", { replace: true });
    } catch (err) {
      if (err.response?.data?.code === "CHALLENGE_EXPIRED") { setChallenge(null); setCode(""); }
      setError(err.response?.data?.message || (challenge ? "That code is not right" : "Invalid email or password"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sd-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 16 }}>
      <div className="sd-card sd-card-pad" style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, color: "var(--sd-primary-dark)" }}>
          <LifeBuoy size={24} />
          <span style={{ fontWeight: 800, fontSize: "1.2rem" }}>Support Desk</span>
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--sd-text-muted)", marginBottom: 20 }}>
          Sign in with your account to open or manage support tickets.
        </p>

        {error && (
          <div style={{ background: "#fee2e2", color: "#991b1b", padding: "8px 11px", borderRadius: 8, fontSize: "0.8rem", marginBottom: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {challenge ? (
            <div className="sd-field">
              <label className="sd-label">Two-factor code</label>
              <input className="sd-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code, or a backup code" autoComplete="one-time-code" required autoFocus />
            </div>
          ) : (<>
          <div className="sd-field">
            <label className="sd-label">Email</label>
            <input className="sd-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="sd-field">
            <label className="sd-label">Password</label>
            <input className="sd-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          </>)}
          <button type="submit" className="sd-btn sd-btn-primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? <Loader2 size={14} className="sd-spinner" /> : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
