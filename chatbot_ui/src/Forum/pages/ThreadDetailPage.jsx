import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { ArrowLeft, ArrowBigUp, ShieldCheck, AlertTriangle, Pin, PinOff, Trash2, SearchX } from "lucide-react";
import { forumAPI, moderationAPI } from "../forumApi";
import { useForumAuth } from "../context/ForumAuthContext";
import { useForumUI } from "../context/ForumUIContext";
import { STATUS_META, formatRelativeTime, canForumPost, isStaff } from "../constants";
import { CategoryBadge, StatusBadge, Avatar } from "../components/Badges";
import EmailVerificationBanner from "../components/EmailVerificationBanner";

export default function ThreadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useForumAuth();
  const { toast, confirm } = useForumUI();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [voting, setVoting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await forumAPI.getThread(id);
      setData(res.data);
      setNotFound(false);
    } catch (err) {
      if (err?.response?.status === 404) setNotFound(true);
      else toast("Couldn't load this thread.", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const toggleVote = async () => {
    if (!user) return navigate("/forum/login", { state: { from: `/forum/thread/${id}` } });
    setVoting(true);
    try {
      const res = data.thread.hasUpvoted ? await forumAPI.removeUpvote(id) : await forumAPI.upvote(id);
      setData((prev) => ({ ...prev, thread: { ...prev.thread, hasUpvoted: res.data.upvoted, upvote_count: res.data.upvoteCount } }));
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't register your vote.", "error");
    } finally {
      setVoting(false);
    }
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await forumAPI.reply(id, reply.trim());
      setReply("");
      await load();
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't post your reply.", "error");
    } finally {
      setSending(false);
    }
  };

  // ── Staff controls (ADMIN only — the server re-checks every one) ──
  const changeStatus = async (status) => {
    try {
      await moderationAPI.setStatus(id, status);
      toast("Status updated.");
      await load();
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't update the status.", "error");
    }
  };
  const togglePin = async () => {
    try {
      await moderationAPI.setPinned(id, !data.thread.is_pinned);
      await load();
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't update the pin.", "error");
    }
  };
  const deleteThread = async () => {
    const ok = await confirm({ title: "Delete this thread?", text: "This permanently removes it along with every reply and vote.", confirmLabel: "Delete thread", danger: true });
    if (!ok) return;
    try {
      await moderationAPI.deleteThread(id);
      toast("Thread deleted.");
      navigate("/forum", { replace: true });
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't delete the thread.", "error");
    }
  };
  const deleteReply = async (replyId) => {
    const ok = await confirm({ title: "Delete this reply?", confirmLabel: "Delete reply", danger: true });
    if (!ok) return;
    try {
      await moderationAPI.deleteReply(replyId);
      await load();
    } catch (err) {
      toast(err?.response?.data?.message || "Couldn't delete the reply.", "error");
    }
  };

  if (loading) {
    return <div className="fm-container fm-section"><div className="fm-spinner" style={{ marginTop: 60 }} /></div>;
  }

  if (notFound || !data) {
    return (
      <div className="fm-container fm-section">
        <div className="fm-card fm-empty">
          <SearchX size={36} />
          <h3>Thread not found</h3>
          <p>It may still be awaiting review, or it may have been removed.</p>
          <Link to="/forum" className="fm-btn fm-btn-secondary" style={{ marginTop: 14 }}>Back to the forum</Link>
        </div>
      </div>
    );
  }

  const { thread, replies, statusOptions } = data;
  const staff = isStaff(user);
  const isPending = thread.moderation_status !== "APPROVED";
  const hasWorkflow = statusOptions?.length > 0;

  return (
    <div className="fm-container fm-section">
      <Link to={thread.category === "ANNOUNCEMENT" ? "/forum/announcements" : "/forum"} className="fm-back">
        <ArrowLeft size={15} /> Back to {thread.category === "ANNOUNCEMENT" ? "announcements" : "the community"}
      </Link>

      {isPending && (
        <div className={`fm-banner ${thread.moderation_status === "REJECTED" ? "fm-banner-danger" : "fm-banner-warn"}`}>
          <AlertTriangle size={18} />
          <span>
            {thread.moderation_status === "REJECTED"
              ? `This thread wasn't approved.${thread.rejection_reason ? ` Reason: ${thread.rejection_reason}` : ""}`
              : "Pending review — only you and the moderators can see this thread right now."}
          </span>
        </div>
      )}

      <div className="fm-grid">
        <div className="fm-stack" style={{ gap: 16 }}>
          <article className="fm-card fm-card-pad" style={{ padding: 26 }}>
            <div className="fm-row">
              <CategoryBadge category={thread.category} />
              <StatusBadge status={thread.status} category={thread.category} />
              {Boolean(thread.is_pinned) && <span className="fm-badge"><Pin size={11} /> Pinned</span>}
            </div>
            <h1 className="fm-detail-title">{thread.title}</h1>
            <div className="fm-byline">
              <Avatar name={thread.authorName} size={28} />
              <span><b>{thread.authorName}</b>{thread.authorAgencyName ? ` · ${thread.authorAgencyName}` : ""}</span>
              <span>· {formatRelativeTime(thread.created_at)}</span>
            </div>
            <p className="fm-body">{thread.body}</p>
            {!isPending && thread.category !== "ANNOUNCEMENT" && (
              <div style={{ marginTop: 22 }}>
                <button type="button" className={`fm-votebtn ${thread.hasUpvoted ? "on" : ""}`} onClick={toggleVote} disabled={voting}>
                  <ArrowBigUp size={18} /> {thread.upvote_count} {thread.upvote_count === 1 ? "upvote" : "upvotes"}
                </button>
              </div>
            )}
          </article>

          <h3 style={{ fontSize: "1.02rem", fontWeight: 800, margin: "6px 2px 0" }}>
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </h3>

          {replies.length > 0 && (
            <div className="fm-card">
              {replies.map((r) => (
                <div key={r.id} className="fm-reply">
                  <Avatar name={r.authorName} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fm-reply-head">
                      <b>{r.authorName}</b>
                      {Boolean(r.is_admin_reply) && <span className="fm-staff"><ShieldCheck size={10} /> Staff</span>}
                      <time>{formatRelativeTime(r.created_at)}</time>
                      {staff && (
                        <button type="button" className="fm-iconbtn" style={{ marginLeft: "auto", width: 28, height: 28 }} onClick={() => deleteReply(r.id)} title="Delete reply" aria-label="Delete reply">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <p>{r.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isPending && (
            user ? (
              canForumPost(user) ? (
                <form className="fm-card fm-card-pad" onSubmit={submitReply}>
                  <textarea className="fm-textarea" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                    <button type="submit" className="fm-btn fm-btn-primary" disabled={sending || !reply.trim()}>{sending ? "Posting…" : "Post reply"}</button>
                  </div>
                </form>
              ) : (
                <EmailVerificationBanner user={user} />
              )
            ) : (
              <div className="fm-card fm-card-pad" style={{ textAlign: "center" }}>
                <p style={{ marginBottom: 12, color: "var(--fm-text-2)" }}>Join the conversation.</p>
                <Link to="/forum/login" state={{ from: `/forum/thread/${id}` }} className="fm-btn fm-btn-primary">Sign in to reply</Link>
              </div>
            )
          )}
        </div>

        <aside className="fm-stack">
          <div className="fm-card fm-card-pad">
            <h4>Thread info</h4>
            <div className="fm-facts">
              <div>Category <CategoryBadge category={thread.category} /></div>
              {hasWorkflow && <div>Status <StatusBadge status={thread.status} category={thread.category} /></div>}
              <div>Upvotes <b>{thread.upvote_count}</b></div>
              <div>Replies <b>{thread.reply_count}</b></div>
              <div>Started <b>{formatRelativeTime(thread.created_at)}</b></div>
            </div>
          </div>

          {staff && (
            <div className="fm-card fm-card-pad">
              <h4>Staff controls</h4>
              <div className="fm-stack" style={{ gap: 10 }}>
                {hasWorkflow && !isPending && (
                  <select className="fm-select" style={{ width: "100%" }} value={thread.status} onChange={(e) => changeStatus(e.target.value)} aria-label="Change status">
                    {statusOptions.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}
                  </select>
                )}
                <button type="button" className="fm-btn fm-btn-secondary fm-btn-sm" onClick={togglePin}>
                  {thread.is_pinned ? <><PinOff size={14} /> Unpin</> : <><Pin size={14} /> Pin to top</>}
                </button>
                <button type="button" className="fm-btn fm-btn-danger fm-btn-sm" onClick={deleteThread}><Trash2 size={14} /> Delete thread</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
