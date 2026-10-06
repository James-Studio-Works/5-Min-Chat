import { useEffect, useRef, useState, useCallback } from "react";
import {
  HeartIcon,
  DislikeIcon,
  CommentIcon,
  ShareIcon,
  RemixIcon,
  XIcon,
} from "../icons/Icons.jsx";
import { isVideoUrl } from "../cloudinary.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function CommentPanel({ postId, currentUser, accessToken, onClose }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/posts/${postId}/comments`);
        const data = await res.json();
        if (!cancelled && res.ok) setComments(data.comments || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
          username:
            currentUser?.user_metadata?.full_name ||
            currentUser?.email?.split("@")[0] ||
            "Anonymous",
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
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="vf-comment-panel" onClick={(e) => e.stopPropagation()}>
      <div className="vf-comment-header">
        <span>Comments</span>
        <button className="vf-comment-close" onClick={onClose} aria-label="Close comments">
          <XIcon size={20} />
        </button>
      </div>
      <div className="vf-comment-list">
        {loading && <p className="chat-hint small">Loading…</p>}
        {!loading && comments.length === 0 && (
          <p className="chat-hint small">No comments yet. Be the first.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="vf-comment-row">
            <strong>{c.username}</strong> {c.text}
          </div>
        ))}
      </div>
      {error && <p className="error-text small">{error}</p>}
      <form className="vf-comment-form" onSubmit={submit}>
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

function VideoSlide({
  post,
  isActive,
  myId,
  accessToken,
  currentUser,
  onLike,
  onDislike,
  onViewProfile,
  disliked,
}) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const liked = (post.likes || []).includes(myId);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isActive) {
      el.currentTime = 0;
      el.play().catch(() => {});
    } else {
      el.pause();
      setShowComments(false);
    }
  }, [isActive]);

  function toggleMute(e) {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  async function handleShare(e) {
    e.stopPropagation();
    const url = post.image_url;
    const title = `@${post.username} on 5-Min-Chat`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url, text: post.caption || title });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        alert("Link copied!");
      }
    } catch {
      // user cancelled share
    }
  }

  function handleRemix(e) {
    e.stopPropagation();
    try {
      sessionStorage.setItem(
        "5minchat_remix",
        JSON.stringify({ imageUrl: post.image_url, caption: post.caption || "" })
      );
    } catch {
      /* ignore */
    }
    alert("Remix saved — open the Post tab to create a new post inspired by this.");
  }

  return (
    <div className="vf-slide">
      <video
        ref={videoRef}
        className="vf-video"
        src={post.image_url}
        playsInline
        muted={muted}
        loop
        preload="metadata"
        onClick={toggleMute}
      />

      <div className="vf-gradient" />

      <div className="vf-overlay">
        <div className="vf-meta">
          <button
            className="vf-username"
            onClick={() => onViewProfile?.(post.persistent_id)}
          >
            @{post.username}
          </button>
          <span className="vf-time">{timeAgo(post.created_at)}</span>
          {post.caption && <p className="vf-caption">{post.caption}</p>}
        </div>

        <div className="vf-actions">
          <button
            className={`vf-action-btn ${liked ? "liked" : ""}`}
            onClick={() => onLike(post.id)}
            aria-label="Like"
          >
            <HeartIcon size={28} filled={liked} />
            <span>{(post.likes || []).length}</span>
          </button>

          <button
            className={`vf-action-btn ${disliked ? "disliked" : ""}`}
            onClick={() => onDislike(post.id)}
            aria-label="Dislike"
          >
            <DislikeIcon size={26} filled={disliked} />
          </button>

          <button
            className="vf-action-btn"
            onClick={() => setShowComments((v) => !v)}
            aria-label="Comments"
          >
            <CommentIcon size={26} />
          </button>

          <button className="vf-action-btn" onClick={handleShare} aria-label="Share">
            <ShareIcon size={26} />
          </button>

          <button className="vf-action-btn" onClick={handleRemix} aria-label="Remix">
            <RemixIcon size={26} />
          </button>

          <button
            className="vf-action-btn"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            <span className="vf-mute-icon">{muted ? "🔇" : "🔊"}</span>
          </button>
        </div>
      </div>

      {showComments && (
        <CommentPanel
          postId={post.id}
          currentUser={currentUser}
          accessToken={accessToken}
          onClose={() => setShowComments(false)}
        />
      )}
    </div>
  );
}

export default function VideoFeed({ refreshSignal, onViewProfile, currentUser, accessToken }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dislikes, setDislikes] = useState({});
  const containerRef = useRef(null);
  const myId = currentUser?.id;

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/posts?viewerId=${myId || ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "failed");
      const videos = (data.posts || []).filter((p) => isVideoUrl(p.image_url));
      setPosts(videos);
    } catch (e) {
      setError(
        e.message === "feed_not_configured"
          ? "The feed isn't set up yet."
          : "Couldn't load videos right now."
      );
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed, refreshSignal]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || posts.length === 0) return;

    const wraps = root.querySelectorAll(".vf-slide-wrap");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number(entry.target.dataset.index);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        });
      },
      { root, threshold: [0.6] }
    );

    wraps.forEach((w) => observer.observe(w));
    return () => observer.disconnect();
  }, [posts]);

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
    setDislikes((d) => {
      const next = { ...d };
      delete next[postId];
      return next;
    });
    try {
      await fetch(`${BACKEND_URL}/api/posts/${postId}/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // optimistic
    }
  }

  function toggleDislike(postId) {
    setDislikes((d) => {
      const next = { ...d };
      if (next[postId]) delete next[postId];
      else next[postId] = true;
      return next;
    });
    const post = posts.find((p) => p.id === postId);
    if (post && (post.likes || []).includes(myId)) {
      toggleLike(postId);
    }
  }

  if (loading && posts.length === 0) {
    return (
      <div className="vf-screen">
        <p className="chat-hint">Loading videos…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vf-screen">
        <p className="error-text">{error}</p>
        <button className="btn-secondary" onClick={loadFeed}>
          Retry
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="vf-screen vf-empty">
        <p className="chat-hint">No videos yet.</p>
        <p className="lede small">Share a short video from the Post tab.</p>
      </div>
    );
  }

  return (
    <div className="vf-screen">
      <div className="vf-scroller" ref={containerRef}>
        {posts.map((post, i) => (
          <div key={post.id} className="vf-slide-wrap" data-index={i}>
            <VideoSlide
              post={post}
              isActive={i === activeIndex}
              myId={myId}
              accessToken={accessToken}
              currentUser={currentUser}
              onLike={toggleLike}
              onDislike={toggleDislike}
              onViewProfile={onViewProfile}
              disliked={!!dislikes[post.id]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
