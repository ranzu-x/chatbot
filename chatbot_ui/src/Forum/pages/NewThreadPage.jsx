import { useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router";
import { Send } from "lucide-react";
import { forumAPI } from "../forumApi";
import { useForumAuth } from "../context/ForumAuthContext";
import { useForumUI } from "../context/ForumUIContext";
import { CATEGORIES, COMMUNITY_CATEGORIES, canForumPost, isStaff } from "../constants";
import EmailVerificationBanner from "../components/EmailVerificationBanner";

const PLACEHOLDERS = {
  BUG: "What happened? Include the steps to reproduce it and what you expected instead.",
  FEATURE_REQUEST: "What problem would this solve? How do you imagine it working?",
  DISCUSSION: "What's on your mind?",
  ANNOUNCEMENT: "Write the announcement…",
};

export default function NewThreadPage() {
  const { user } = useForumAuth();
  const { toast } = useForumUI();
  const navigate = useNavigate();
  const location = useLocation();
  const [category, setCategory] = useState("BUG");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  if (!user) return <Navigate to="/forum/login" replace state={{ from: location.pathname }} />;

  const choices = isStaff(user) ? [...COMMUNITY_CATEGORIES, "ANNOUNCEMENT"] : COMMUNITY_CATEGORIES;
  const autoPublished = isStaff(user);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const res = await forumAPI.createThread({ category, title: title.trim(), body: body.trim() });
      if (res.data.moderationStatus === "APPROVED") {
        toast("Published.");
        navigate(`/forum/thread/${res.data.threadId}`);
      } else {
        toast("Submitted — a moderator will review it shortly.");
        navigate("/forum/my-threads");
      }
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't submit your thread.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fm-container fm-section" style={{ maxWidth: 780 }}>
      <div className="fm-pagehead" style={{ padding: "0 0 18px" }}>
        <h1>Start a thread</h1>
        <p>{autoPublished ? "As staff, your thread publishes immediately." : "New threads are reviewed by a moderator before they go public."}</p>
      </div>

      <EmailVerificationBanner user={user} />

      {canForumPost(user) && (
        <form className="fm-card fm-card-pad" style={{ padding: 26 }} onSubmit={submit}>
          <div className="fm-field">
            <label className="fm-label">Category</label>
            <div className="fm-tabs">
              {choices.map((key) => {
                const meta = CATEGORIES[key];
                const Icon = meta.icon;
                return (
                  <button key={key} type="button" className={`fm-tab ${category === key ? "active" : ""}`} onClick={() => setCategory(key)}>
                    <Icon size={14} /> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="fm-field">
            <label className="fm-label" htmlFor="fm-title">Title</label>
            <input id="fm-title" className="fm-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="A short, specific summary" required />
          </div>

          <div className="fm-field">
            <label className="fm-label" htmlFor="fm-body">Details</label>
            <textarea id="fm-body" className="fm-textarea" rows={9} value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} placeholder={PLACEHOLDERS[category]} required />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Link to="/forum" className="fm-btn fm-btn-secondary">Cancel</Link>
            <button type="submit" className="fm-btn fm-btn-primary" disabled={saving}>
              <Send size={14} /> {saving ? "Submitting…" : autoPublished ? "Publish" : "Submit for review"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
