import { useEffect, useRef, useState, useCallback } from "react";
import { HeartIcon } from "../icons/Icons.jsx";
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

function VideoSlide({ post, isActive, myId, accessToken, onLike, onViewProfile }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const liked = (post.likes || []).includes(myId);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isActive) {
      el.currentTime = 0;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isActive]);

  function toggleMute(e) {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
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
          <button className="vf-action-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            <span className="vf-mute-icon">{muted ? "🔇" : "🔊"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VideoFeed({ refreshSignal, onViewProfile, currentUser, accessToken }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
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

  // Track which slide is in view via IntersectionObserver
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
              onLike={toggleLike}
              onViewProfile={onViewProfile}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
