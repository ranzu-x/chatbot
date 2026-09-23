import { useState, useEffect } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { ListChecks, MessageCircle, ArrowBigUp } from "lucide-react";
import { forumAPI } from "../forumApi";
import { useForumAuth } from "../context/ForumAuthContext";
import { formatRelativeTime } from "../constants";
import { CategoryBadge, StatusBadge, ModerationBadge } from "../components/Badges";

export default function MyThreadsPage() {
  const { user } = useForumAuth();
  const location = useLocation();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    forumAPI.myThreads().then((res) => setThreads(res.data?.threads || [])).finally(() => setLoading(false));
  }, [user]);

  if (!user) return <Navigate to="/forum/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="fm-container fm-section" style={{ maxWidth: 860 }}>
      <div className="fm-pagehead" style={{ padding: "0 0 18px" }}>
        <h1><span className="fm-pagehead-icon"><ListChecks size={22} /></span> My threads</h1>
        <p>Everything you've posted, including threads still awaiting review.</p>
      </div>

      {loading ? (
        <div className="fm-stack">{[0, 1].map((i) => <div key={i} className="fm-skel" />)}</div>
      ) : threads.length === 0 ? (
        <div className="fm-card fm-empty">
          <ListChecks size={34} />
          <h3>Nothing here yet</h3>
          <p>Start a thread and it will show up here.</p>
          <Link to="/forum/new" className="fm-btn fm-btn-primary" style={{ marginTop: 14 }}>Start a thread</Link>
        </div>
      ) : (
        <div className="fm-stack">
          {threads.map((t) => (
            <Link key={t.id} to={`/forum/thread/${t.id}`} className="fm-thread">
              <div className="fm-thread-main">
                <div className="fm-thread-top">
                  <CategoryBadge category={t.category} />
                  <ModerationBadge status={t.moderation_status} />
                  {t.moderation_status === "APPROVED" && <StatusBadge status={t.status} category={t.category} />}
                </div>
                <h3 className="fm-thread-title">{t.title}</h3>
                {t.moderation_status === "REJECTED" && t.rejection_reason && (
                  <p className="fm-thread-excerpt" style={{ color: "var(--fm-danger)" }}>Reason: {t.rejection_reason}</p>
                )}
                <div className="fm-thread-foot">
                  <span>{formatRelativeTime(t.created_at)}</span>
                  <span className="fm-meta"><ArrowBigUp size={14} /> {t.upvote_count}</span>
                  <span className="fm-meta"><MessageCircle size={13} /> {t.reply_count}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
