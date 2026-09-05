import { useEffect, useState } from "react";
import { HeartIcon } from "../icons/Icons.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function CommentSection({ postId, currentUser, accessToken }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [posting, setPosting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/posts/${postId}/comments`);
      const data = await res.json();
      if (res.ok) setComments(data.comments || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  async function submit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          username: currentUser?.user_metadata?.full_name || currentUser?.email?.split("@")[0] || "Anonymous",
          text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error === "moderated"
            ? "That comment didn't meet the content guidelines."
            : data?.error === "not_authenticated" || data?.error === "invalid_session"
            ? "Your session expired - try logging in again."
            : "Couldn't post that comment."
        );
      }
      setComments((prev) => [...prev, data.comment]);
      setDraft("");
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="comment-section">
      {loading && <p className="chat-hint small">Loading comments…</p>}
      {!loading && comments.length === 0 && (
        <p className="chat-hint small">No comments yet.</p>
      )}
      <div className="comment-list">
        {comments.map((c) => (
          <div key={c.id} className="comment-row">
            <strong>{c.username}</strong> {c.text}
          </div>
        ))}
      </div>
      {error && <p className="error-text small">{error}</p>}
      <form className="comment-form" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          maxLength={280}
        />
        <button type="submit" className="link-btn" disabled={posting || !draft.trim()}>
          Post
        </button>
      </form>
    </div>
  );
}

export default function Feed({ refreshSignal, onViewProfile, currentUser, accessToken }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedPostId, setExpandedPostId] = useState(null);
  const myId = currentUser?.id;

  async function loadFeed() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/posts?viewerId=${myId || ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "failed");
      setPosts(data.posts || []);
    } catch (e) {
      setError(
        e.message === "feed_not_configured"
          ? "The feed isn't set up yet - see README for Supabase setup."
          : "Couldn't load the feed right now."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, [refreshSignal]);

  async function toggleLike(postId) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const already = (p.likes || []).includes(myId);
        const likes = already
          ? p.likes.filter((id) => id !== myId)
          : [...(p.likes || []), myId];
        return { ...p, likes };
      })
    );
    try {
      await fetch(`${BACKEND_URL}/api/posts/${postId}/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // optimistic UI already reflects intent; ignore transient failures
    }
  }

  if (loading && posts.length === 0) {
    return (
      <div className="feed-screen">
        <p className="chat-hint">Loading feed…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="feed-screen">
        <p className="error-text">{error}</p>
        <button className="btn-secondary" onClick={loadFeed}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="feed-screen">
      <div className="feed-header">
        <h2>Home</h2>
        <button className="link-btn" onClick={loadFeed}>
          Refresh
        </button>
      </div>

      {posts.length === 0 && (
        <p className="chat-hint">No posts yet. Be the first to share something.</p>
      )}

      <div className="post-list">
        {posts.map((post) => {
          const liked = (post.likes || []).includes(myId);
          const isExpanded = expandedPostId === post.id;
          return (
            <div key={post.id} className="post-card">
              <div className="post-header">
                <button
                  className="post-username-btn"
                  onClick={() => onViewProfile?.(post.persistent_id)}
                >
                  {post.username}
                </button>
                <span className="post-time">{timeAgo(post.created_at)}</span>
              </div>
              <img className="post-image" src={post.image_url} alt="" loading="lazy" />
              {post.caption && <p className="post-caption">{post.caption}</p>}
              <div className="post-actions">
                <button
                  className={`like-btn ${liked ? "liked" : ""}`}
                  onClick={() => toggleLike(post.id)}
                >
                  <HeartIcon size={19} filled={liked} /> {(post.likes || []).length}
                </button>
                <button
                  className="link-btn"
                  onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                >
                  {isExpanded ? "Hide comments" : "Comments"}
                </button>
              </div>
              {isExpanded && (
                <CommentSection postId={post.id} currentUser={currentUser} accessToken={accessToken} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
