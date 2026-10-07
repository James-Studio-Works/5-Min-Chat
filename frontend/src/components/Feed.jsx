import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  HeartIcon,
  DislikeIcon,
  CommentIcon,
  ShareIcon,
  RemixIcon,
  SearchIcon,
  XIcon,
} from "../icons/Icons.jsx";
import { isVideoUrl } from "../cloudinary.js";

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

function timeAgoShort(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function PostMedia({ url, onOpen }) {
  const video = isVideoUrl(url);
  if (video) {
    return (
      <div className="post-media" onClick={onOpen} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpen?.()}>
        <video className="post-image post-video" src={url} playsInline muted loop preload="metadata" />
        <span className="post-video-badge">Video</span>
      </div>
    );
  }
  return (
    <div className="post-media" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen?.()}>
      <img className="post-image" src={url} alt="" loading="lazy" />
    </div>
  );
}

function FullPageVideo({ src, isActive }) {
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);
  const wasActive = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isActive) {
      if (!wasActive.current) el.currentTime = 0;
      wasActive.current = true;
      el.play().catch(() => {});
    } else {
      wasActive.current = false;
      el.pause();
    }
  }, [isActive]);
  return (
    <video ref={ref} className="vf-video" src={src} playsInline muted={muted} loop preload="metadata"
      onClick={(e) => { e.stopPropagation(); const v = ref.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }} />
  );
}

function FullPageViewer({ posts, startIndex, myId, accessToken, currentUser, onClose, onLike, onDislike, onFollow, onViewProfile, dislikes, following }) {
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const containerRef = useRef(null);
  const didInitialScroll = useRef(false);
  const postIdsKey = useMemo(() => posts.map((p) => p.id).join(","), [posts]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || posts.length === 0 || didInitialScroll.current) return;
    const wraps = root.querySelectorAll(".vf-slide-wrap");
    if (wraps[startIndex]) {
      wraps[startIndex].scrollIntoView({ block: "start" });
      didInitialScroll.current = true;
    }
  }, [posts.length, startIndex]);

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
  }, [postIdsKey]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fp-viewer">
      <button type="button" className="fp-close" onClick={onClose} aria-label="Close">
        <XIcon size={22} />
      </button>
      <div className="vf-scroller" ref={containerRef}>
        {posts.map((post, i) => {
          const liked = (post.likes || []).includes(myId);
          const disliked = !!dislikes[post.id];
          const isVideo = isVideoUrl(post.image_url);
          const isActive = i === activeIndex;
          const isFollowing = !!following?.[post.persistent_id];
          return (
            <div key={post.id} className="vf-slide-wrap" data-index={i}>
              <div className="vf-slide">
                {isVideo ? (
                  <FullPageVideo src={post.image_url} isActive={isActive} />
                ) : (
                  <img className="vf-video fp-image" src={post.image_url} alt="" />
                )}
                <div className="vf-gradient" />
                <div className="vf-overlay">
                  <div className="vf-meta">
                    <div className="vf-author-row">
                      <button type="button" className="vf-username"
                        onClick={(e) => { e.stopPropagation(); onViewProfile?.(post.persistent_id); }}>
                        @{post.username}
                      </button>
                      {post.persistent_id !== myId && (
                        <button type="button"
                          className={`vf-follow-btn ${isFollowing ? "following" : ""}`}
                          onClick={(e) => { e.stopPropagation(); onFollow?.(post.persistent_id); }}>
                          {isFollowing ? "Following" : "Follow"}
                        </button>
                      )}
                    </div>
                    <span className="vf-time">{timeAgoShort(post.created_at)}</span>
                    {post.caption && <p className="vf-caption">{post.caption}</p>}
                  </div>
                  <div className="vf-actions">
                    <button type="button" className={`vf-action-btn ${liked ? "liked" : ""}`}
                      onClick={(e) => { e.stopPropagation(); onLike(post.id); }} aria-label="Like">
                      <HeartIcon size={28} filled={liked} />
                      <span>{(post.likes || []).length}</span>
                    </button>
                    <button type="button" className={`vf-action-btn ${disliked ? "disliked" : ""}`}
                      onClick={(e) => { e.stopPropagation(); onDislike(post.id); }} aria-label="Dislike">
                      <DislikeIcon size={26} filled={disliked} />
                    </button>
                    <button type="button" className="vf-action-btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          if (navigator.share) await navigator.share({ title: `@${post.username}`, url: post.image_url });
                          else if (navigator.clipboard) { await navigator.clipboard.writeText(post.image_url); alert("Link copied!"); }
                        } catch {}
                      }} aria-label="Share">
                      <ShareIcon size={26} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Feed({ refreshSignal, onViewProfile, currentUser, accessToken }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mediaFilter, setMediaFilter] = useState("all");
  const [viewerIndex, setViewerIndex] = useState(null);
  const [dislikes, setDislikes] = useState({});
  const [following, setFollowing] = useState({});
  const [followBusy, setFollowBusy] = useState({});
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
      setError(e.message === "feed_not_configured"
        ? "The feed is not set up yet."
        : "Could not load the feed right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFeed(); }, [refreshSignal]);

  async function toggleLike(postId) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const already = (p.likes || []).includes(myId);
        const likes = already ? p.likes.filter((id) => id !== myId) : [...(p.likes || []), myId];
        return { ...p, likes };
      })
    );
    setDislikes((d) => { const n = { ...d }; delete n[postId]; return n; });
    try {
      await fetch(`${BACKEND_URL}/api/posts/${postId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      });
    } catch {}
  }

  function toggleDislike(postId) {
    setDislikes((d) => {
      const next = { ...d };
      if (next[postId]) delete next[postId];
      else next[postId] = true;
      return next;
    });
    const post = posts.find((p) => p.id === postId);
    if (post && (post.likes || []).includes(myId)) toggleLike(postId);
  }

  async function toggleFollow(targetPersistentId) {
    if (!targetPersistentId || targetPersistentId === myId || followBusy[targetPersistentId]) return;
    setFollowBusy((b) => ({ ...b, [targetPersistentId]: true }));
    const was = !!following[targetPersistentId];
    setFollowing((f) => ({ ...f, [targetPersistentId]: !was }));
    try {
      const res = await fetch(`${BACKEND_URL}/api/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ targetPersistentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setFollowing((f) => ({ ...f, [targetPersistentId]: !!data.following }));
      } else {
        setFollowing((f) => ({ ...f, [targetPersistentId]: was }));
      }
    } catch {
      setFollowing((f) => ({ ...f, [targetPersistentId]: was }));
    } finally {
      setFollowBusy((b) => { const n = { ...b }; delete n[targetPersistentId]; return n; });
    }
  }

  const visiblePosts = posts.filter((p) => {
    if (mediaFilter === "all") return true;
    const v = isVideoUrl(p.image_url);
    return mediaFilter === "video" ? v : !v;
  });

  if (loading && posts.length === 0) {
    return <div className="feed-screen"><p className="chat-hint">Loading feed…</p></div>;
  }
  if (error) {
    return (
      <div className="feed-screen">
        <p className="error-text">{error}</p>
        <button type="button" className="btn-secondary" onClick={loadFeed}>Retry</button>
      </div>
    );
  }

  return (
    <div className="feed-screen">
      <div className="feed-header">
        <h2>Home</h2>
        <button type="button" className="link-btn" onClick={loadFeed}>Refresh</button>
      </div>
      <div className="feed-filter-row">
        {["all", "video", "photo"].map((f) => (
          <button key={f} type="button"
            className={`feed-filter-chip ${mediaFilter === f ? "active" : ""}`}
            onClick={() => setMediaFilter(f)}>
            {f === "all" ? "All" : f === "video" ? "Videos" : "Photos"}
          </button>
        ))}
      </div>
      {visiblePosts.length === 0 && <p className="chat-hint">No posts yet.</p>}
      <div className="post-list">
        {visiblePosts.map((post, idx) => {
          const liked = (post.likes || []).includes(myId);
          return (
            <div key={post.id} className="post-card">
              <div className="post-header">
                <div className="post-header-left">
                  <button type="button" className="post-username-btn"
                    onClick={() => onViewProfile?.(post.persistent_id)}>
                    {post.username}
                  </button>
                  {post.persistent_id !== myId && (
                    <button type="button"
                      className={`post-follow-btn ${following[post.persistent_id] ? "following" : ""}`}
                      onClick={() => toggleFollow(post.persistent_id)}
                      disabled={!!followBusy[post.persistent_id]}>
                      {following[post.persistent_id] ? "Following" : "Follow"}
                    </button>
                  )}
                </div>
                <span className="post-time">{timeAgo(post.created_at)}</span>
              </div>
              <PostMedia url={post.image_url} onOpen={() => setViewerIndex(idx)} />
              {post.caption && <p className="post-caption">{post.caption}</p>}
              <div className="post-actions">
                <button type="button" className={`like-btn ${liked ? "liked" : ""}`}
                  onClick={() => toggleLike(post.id)}>
                  <HeartIcon size={19} filled={liked} /> {(post.likes || []).length}
                </button>
                <button type="button"
                  className={`like-btn ${dislikes[post.id] ? "disliked" : ""}`}
                  onClick={() => toggleDislike(post.id)}>
                  <DislikeIcon size={18} filled={!!dislikes[post.id]} />
                </button>
                <button type="button" className="link-btn"
                  onClick={async () => {
                    try {
                      if (navigator.share) await navigator.share({ title: `@${post.username}`, url: post.image_url });
                      else if (navigator.clipboard) { await navigator.clipboard.writeText(post.image_url); alert("Link copied!"); }
                    } catch {}
                  }}>
                  Share
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {viewerIndex !== null && (
        <FullPageViewer
          posts={visiblePosts}
          startIndex={viewerIndex}
          myId={myId}
          accessToken={accessToken}
          currentUser={currentUser}
          onClose={() => setViewerIndex(null)}
          onLike={toggleLike}
          onDislike={toggleDislike}
          onFollow={toggleFollow}
          onViewProfile={(id) => { setViewerIndex(null); onViewProfile?.(id); }}
          dislikes={dislikes}
          following={following}
        />
      )}
    </div>
  );
}
