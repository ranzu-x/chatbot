import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { ShieldCheck, Check, X, Pin, PinOff, Trash2, Clock, MessagesSquare, Inbox } from "lucide-react";
import { forumAPI, moderationAPI } from "../forumApi";
import { useForumUI } from "../context/ForumUIContext";
import { STATUS_OPTIONS_BY_CATEGORY, STATUS_META, formatRelativeTime } from "../constants";
import { CategoryBadge, Avatar } from "../components/Badges";

/**
 * Staff-only (ForumApp only mounts this for role ADMIN; every endpoint it
 * calls re-checks that server-side). Pending queue + management of
 * published threads, all inside the forum portal — no dashboard page.
 */
export default function ModerationPage() {
  const { toast, confirm } = useForumUI();
  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState([]);
  const [published, setPublished] = useState([]);
  const [stats, setStats] = useState({ pendingCount: 0, byCategory: [] });
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");

  const loadQueue = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([moderationAPI.getPending(), moderationAPI.getStats()]);
      setPending(p.data?.threads || []);
      setStats(s.data || { pendingCount: 0, byCategory: [] });
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't load the moderation queue.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadPublished = useCallback(async () => {
    try {
      const res = await forumAPI.listThreads({ sort: "newest", limit: 100 });
      setPublished(res.data?.threads || []);
    } catch {
      toast("Couldn't load published threads.", "error");
    }
  }, [toast]);

  useEffect(() => { loadQueue(); }, [loadQueue]);
  useEffect(() => { if (tab === "published") loadPublished(); }, [tab, loadPublished]);

  const approve = async (id) => {
    try {
      await moderationAPI.approve(id);
      toast("Thread approved and published.");
      loadQueue();
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't approve the thread.", "error");
    }
  };

  const submitReject = async () => {
    try {
      await moderationAPI.reject(rejecting, reason.trim() || undefined);
      toast("Thread rejected.");
      setRejecting(null);
      setReason("");
      loadQueue();
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't reject the thread.", "error");
    }
  };

  const changeStatus = async (thread, status) => {
    try {
      await moderationAPI.setStatus(thread.id, status);
      setPublished((prev) => prev.map((t) => (t.id === thread.id ? { ...t, status } : t)));
      toast("Status updated.");
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't update the status.", "error");
    }
  };

  const togglePin = async (thread) => {
    try {
      const res = await moderationAPI.setPinned(thread.id, !thread.is_pinned);
      setPublished((prev) => prev.map((t) => (t.id === thread.id ? { ...t, is_pinned: res.data.pinned ? 1 : 0 } : t)));
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't update the pin.", "error");
    }
  };

  const remove = async (thread) => {
    const ok = await confirm({ title: `Delete “${thread.title}”?`, text: "This permanently removes the thread with all its replies and votes.", confirmLabel: "Delete thread", danger: true });
    if (!ok) return;
    try {
      await moderationAPI.deleteThread(thread.id);
      setPublished((prev) => prev.filter((t) => t.id !== thread.id));
      toast("Thread deleted.");
      loadQueue();
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't delete the thread.", "error");
    }
  };

  const publishedCount = stats.byCategory.filter((r) => r.moderation_status === "APPROVED").reduce((n, r) => n + r.count, 0);
  const totalCount = stats.byCategory.reduce((n, r) => n + r.count, 0);

  return (
    <div className="fm-container fm-section">
      <div className="fm-pagehead" style={{ padding: "0 0 4px" }}>
        <h1><span className="fm-pagehead-icon"><ShieldCheck size={22} /></span> Moderation</h1>
        <p>Review new threads and manage what's live in the community.</p>
      </div>

      <div className="fm-stats">
        <div className="fm-card fm-stat"><small>Pending review</small><b>{stats.pendingCount}</b></div>
        <div className="fm-card fm-stat"><small>Published</small><b>{publishedCount}</b></div>
        <div className="fm-card fm-stat"><small>All threads</small><b>{totalCount}</b></div>
      </div>

      <div className="fm-tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={`fm-tab ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>
          <Clock size={14} /> Pending <span className="fm-count">{stats.pendingCount}</span>
        </button>
        <button type="button" className={`fm-tab ${tab === "published" ? "active" : ""}`} onClick={() => setTab("published")}>
          <MessagesSquare size={14} /> Published <span className="fm-count">{publishedCount}</span>
        </button>
      </div>

      {tab === "pending" && (
        loading ? (
          <div className="fm-stack">{[0, 1].map((i) => <div key={i} className="fm-skel" />)}</div>
        ) : pending.length === 0 ? (
          <div className="fm-card fm-empty"><Inbox size={34} /><h3>The queue is clear</h3><p>Nothing is waiting for review.</p></div>
        ) : (
          <div className="fm-stack">
            {pending.map((t) => (
              <div key={t.id} className="fm-card fm-card-pad" style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div className="fm-thread-top">
                    <CategoryBadge category={t.category} />
                    <span style={{ fontSize: "0.76rem", color: "var(--fm-text-3)" }}>{formatRelativeTime(t.created_at)}</span>
                  </div>
                  <h3 className="fm-thread-title">{t.title}</h3>
                  <div className="fm-thread-foot" style={{ marginTop: 6 }}>
                    <Avatar name={t.authorName} size={22} />
                    <b>{t.authorName}</b> <span>({t.authorEmail})</span> <span>·</span> <span>{t.authorAgencyName}</span>
                  </div>
                  <p className="fm-body" style={{ fontSize: "0.9rem", marginTop: 12, maxHeight: 150, overflow: "auto" }}>{t.body}</p>
                </div>
                <div className="fm-stack" style={{ gap: 8 }}>
                  <button type="button" className="fm-btn fm-btn-success fm-btn-sm" onClick={() => approve(t.id)}><Check size={14} /> Approve</button>
                  <button type="button" className="fm-btn fm-btn-secondary fm-btn-sm" onClick={() => { setRejecting(t.id); setReason(""); }}><X size={14} /> Reject</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "published" && (
        <div className="fm-card fm-tablewrap">
          <table className="fm-table">
            <thead>
              <tr><th>Thread</th><th>Author</th><th>Status</th><th>Replies</th><th>Votes</th><th>Posted</th><th /></tr>
            </thead>
            <tbody>
              {published.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--fm-text-3)", padding: 30 }}>No published threads yet.</td></tr>}
              {published.map((t) => {
                const options = STATUS_OPTIONS_BY_CATEGORY[t.category];
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="fm-row" style={{ gap: 6, marginBottom: 4 }}>
                        {Boolean(t.is_pinned) && <Pin size={12} style={{ color: "var(--fm-accent)" }} />}
                        <CategoryBadge category={t.category} />
                      </div>
                      <Link to={`/forum/thread/${t.id}`} className="fm-link">{t.title}</Link>
                    </td>
                    <td>{t.authorName}</td>
                    <td>
                      {options ? (
                        <select className="fm-select" value={t.status} onChange={(e) => changeStatus(t, e.target.value)} aria-label="Status">
                          {options.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
                        </select>
                      ) : <span style={{ color: "var(--fm-text-3)" }}>—</span>}
                    </td>
                    <td>{t.reply_count}</td>
                    <td>{t.upvote_count}</td>
                    <td style={{ color: "var(--fm-text-3)", whiteSpace: "nowrap" }}>{formatRelativeTime(t.created_at)}</td>
                    <td>
                      <div className="fm-row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button type="button" className="fm-iconbtn" onClick={() => togglePin(t)} title={t.is_pinned ? "Unpin" : "Pin"}>{t.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
                        <button type="button" className="fm-iconbtn" onClick={() => remove(t)} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rejecting && (
        <div className="fm-modal-backdrop" onClick={() => setRejecting(null)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="fm-modal-x" onClick={() => setRejecting(null)} aria-label="Close"><X size={16} /></button>
            <h3>Reject this thread</h3>
            <p>Optionally tell the author why — they'll see it on their thread.</p>
            <textarea className="fm-textarea" rows={3} style={{ marginTop: 12 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate of an existing thread" />
            <div className="fm-modal-actions">
              <button type="button" className="fm-btn fm-btn-secondary" onClick={() => setRejecting(null)}>Cancel</button>
              <button type="button" className="fm-btn fm-btn-danger" onClick={submitReject}>Reject thread</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
