import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { Search, Sparkles, Pin, ArrowBigUp, MessageCircle, Megaphone, MessagesSquare, Plus } from "lucide-react";
import { forumAPI } from "../forumApi";
import { useForumAuth } from "../context/ForumAuthContext";
import { CATEGORIES, COMMUNITY_CATEGORIES, formatRelativeTime } from "../constants";
import { CategoryBadge, StatusBadge, Avatar } from "../components/Badges";

const SORTS = [
  { id: "newest", label: "Newest" },
  { id: "active", label: "Most active" },
  { id: "top", label: "Most upvoted" },
];
const PAGE_SIZE = 12;

function ThreadCard({ thread, announcement }) {
  return (
    <Link to={`/forum/thread/${thread.id}`} className={`fm-thread ${thread.is_pinned ? "pinned" : ""} ${announcement ? "fm-announce" : ""}`}>
      {!announcement && (
        <div className="fm-vote">
          <ArrowBigUp size={18} />
          <b>{thread.upvote_count}</b>
          <small>votes</small>
        </div>
      )}
      <div className="fm-thread-main">
        <div className="fm-thread-top">
          {Boolean(thread.is_pinned) && <Pin size={13} style={{ color: "var(--fm-accent)" }} />}
          <CategoryBadge category={thread.category} />
          <StatusBadge status={thread.status} category={thread.category} />
        </div>
        <h3 className="fm-thread-title">{thread.title}</h3>
        {thread.excerpt && <p className="fm-thread-excerpt">{thread.excerpt}</p>}
        <div className="fm-thread-foot">
          <Avatar name={thread.authorName} size={22} />
          <b>{thread.authorName}</b>
          <span>·</span>
          <span>{formatRelativeTime(thread.last_activity_at || thread.created_at)}</span>
          <span className="fm-meta"><MessageCircle size={13} /> {thread.reply_count}</span>
        </div>
      </div>
    </Link>
  );
}

/** `section` is "community" (bugs / feature requests / discussions) or "announcements". */
export default function ForumHomePage({ section = "community" }) {
  const { user } = useForumAuth();
  const isAnnouncements = section === "announcements";

  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [threads, setThreads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([]);
  const [latestAnnouncements, setLatestAnnouncements] = useState([]);

  // Every filter change starts a fresh list from page 1 — reset in the same
  // handler (not an effect) so no request ever fires with a stale page.
  // Switching sections remounts this page (see ForumApp's `key`).
  const pickCategory = (c) => { setCategory(c); setPage(1); };
  const pickSort = (v) => { setSort(v); setPage(1); };
  const applySearch = (q) => { setSearch(q); setSearchInput(q); setPage(1); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await forumAPI.listThreads({
        section, category: category || undefined, sort, search: search || undefined, page, limit: PAGE_SIZE,
      });
      const incoming = res.data?.threads || [];
      setThreads((prev) => (page === 1 ? incoming : [...prev, ...incoming]));
      setTotal(res.data?.pagination?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [section, category, sort, search, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    forumAPI.getStats().then((res) => setStats(res.data?.breakdown || [])).catch(() => {});
    forumAPI.listThreads({ section: "announcements", limit: 3, sort: "newest" })
      .then((res) => setLatestAnnouncements(res.data?.threads || []))
      .catch(() => {});
  }, []);

  const countFor = (cat) => stats.filter((s) => s.category === cat).reduce((n, s) => n + s.count, 0);
  const communityTotal = COMMUNITY_CATEGORIES.reduce((n, c) => n + countFor(c), 0);
  const doneCount = stats
    .filter((s) => COMMUNITY_CATEGORIES.includes(s.category) && ["RESOLVED", "IMPLEMENTED", "COMPLETED"].includes(s.status))
    .reduce((n, s) => n + s.count, 0);

  return (
    <>
      {isAnnouncements ? (
        <div className="fm-container fm-pagehead">
          <h1><span className="fm-pagehead-icon"><Megaphone size={22} /></span> Announcements</h1>
          <p>Product updates, releases and important news from the Nexa team.</p>
        </div>
      ) : (
        <section className="fm-hero">
          <div className="fm-container">
            <span className="fm-eyebrow"><Sparkles size={13} /> Community</span>
            <h1>Help shape what we build next</h1>
            <p>Report bugs, vote on feature requests and talk with the Nexa team and other builders.</p>
            <form className="fm-search" onSubmit={(e) => { e.preventDefault(); applySearch(searchInput.trim()); }}>
              <Search size={17} />
              <input className="fm-input" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search bugs, ideas and discussions…" />
              <button type="submit" className="fm-btn">Search</button>
            </form>
            <div className="fm-hero-stats">
              <div><b>{communityTotal}</b><span>Threads</span></div>
              <div><b>{doneCount}</b><span>Resolved &amp; shipped</span></div>
              <div><b>{countFor("ANNOUNCEMENT")}</b><span>Announcements</span></div>
            </div>
          </div>
        </section>
      )}

      <div className="fm-container fm-section">
        <div className="fm-grid">
          <div>
            <div className="fm-toolbar">
              {!isAnnouncements ? (
                <div className="fm-tabs">
                  <button type="button" className={`fm-tab ${!category ? "active" : ""}`} onClick={() => pickCategory("")}>
                    All <span className="fm-count">{communityTotal}</span>
                  </button>
                  {COMMUNITY_CATEGORIES.map((key) => {
                    const meta = CATEGORIES[key];
                    const Icon = meta.icon;
                    return (
                      <button key={key} type="button" className={`fm-tab ${category === key ? "active" : ""}`} onClick={() => pickCategory(key)}>
                        <Icon size={13} /> {meta.plural} <span className="fm-count">{countFor(key)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : <span />}
              <select className="fm-select" value={sort} onChange={(e) => pickSort(e.target.value)} aria-label="Sort threads">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            {search && (
              <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--fm-text-2)" }}>
                Results for “{search}” — <button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={() => applySearch("")}>clear</button>
              </p>
            )}

            {loading && page === 1 ? (
              <div className="fm-stack">{[0, 1, 2].map((i) => <div key={i} className="fm-skel" />)}</div>
            ) : threads.length === 0 ? (
              <div className="fm-card fm-empty">
                {isAnnouncements ? <Megaphone size={34} /> : <MessagesSquare size={34} />}
                <h3>{isAnnouncements ? "No announcements yet" : "No threads found"}</h3>
                <p>{isAnnouncements ? "Check back soon." : "Be the first to start a conversation."}</p>
              </div>
            ) : (
              <>
                <div className="fm-stack">
                  {threads.map((t) => <ThreadCard key={t.id} thread={t} announcement={isAnnouncements} />)}
                </div>
                {threads.length < total && (
                  <div style={{ textAlign: "center", marginTop: 18 }}>
                    <button type="button" className="fm-btn fm-btn-secondary" disabled={loading} onClick={() => setPage((p) => p + 1)}>
                      {loading ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="fm-stack">
            {!isAnnouncements && (
              <div className="fm-card fm-card-pad">
                <Link to={user ? "/forum/new" : "/forum/login"} className="fm-btn fm-btn-primary fm-btn-block">
                  <Plus size={15} /> {user ? "Start a thread" : "Sign in to post"}
                </Link>
                <p style={{ marginTop: 10, fontSize: "0.78rem", color: "var(--fm-text-3)", textAlign: "center" }}>
                  New threads are reviewed before they go public.
                </p>
              </div>
            )}

            {!isAnnouncements && (
              <div className="fm-card fm-card-pad">
                <h4>Categories</h4>
                <div className="fm-catlist">
                  {COMMUNITY_CATEGORIES.map((key) => {
                    const meta = CATEGORIES[key];
                    const Icon = meta.icon;
                    return (
                      <button key={key} type="button" className={category === key ? "active" : ""} onClick={() => pickCategory(category === key ? "" : key)}>
                        <span className="fm-cat-dot" style={{ "--c": meta.color }}><Icon size={14} /></span>
                        {meta.plural}
                        <span className="fm-count">{countFor(key)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!isAnnouncements && latestAnnouncements.length > 0 && (
              <div className="fm-card fm-card-pad">
                <h4>Latest announcements</h4>
                {latestAnnouncements.map((a) => (
                  <Link key={a.id} to={`/forum/thread/${a.id}`} className="fm-mini">
                    <b>{a.title}</b>
                    <span>{formatRelativeTime(a.created_at)}</span>
                  </Link>
                ))}
              </div>
            )}

            <div className="fm-card fm-card-pad">
              <h4>Posting tips</h4>
              <ul className="fm-tips">
                <li>Search first — someone may already have reported it.</li>
                <li>For bugs, include the steps to reproduce.</li>
                <li>One idea per feature request; vote instead of “+1”.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
