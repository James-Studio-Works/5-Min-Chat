import { useEffect, useRef, useState, useCallback } from "react";
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

const MEDIA_BOX = {
  position: "relative",
  width: "100%",
  aspectRatio: "4 / 5",
  background: "var(--dusk-2, #1a1e28)",
  overflow: "hidden",
  cursor: "pointer",
};

const MEDIA_FILL = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

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
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const video = isVideoUrl(url);

  useEffect(() => {
    if (!video || !videoRef.current || !containerRef.current) return;

    const el = videoRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.55, 1] }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [video, url]);

  if (video) {
    return (
      <div
        className="post-media"
        ref={containerRef}
        style={MEDIA_BOX}
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpen?.()}
      >
        <video
          ref={videoRef}
          className="post-image post-video"
          style={MEDIA_FILL}
          src={url}
          playsInline
          muted
          loop
          preload="metadata"
        />
        <span className="post-video-badge">Video</span>
      </div>
    );
  }

  return (
    <div
      className="post-media"
      style={MEDIA_BOX}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen?.()}
    >
      <img className="post-image" style={MEDIA_FILL} src={url} alt="" loading="lazy" />
    </div>
  );
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

function FullPageViewer({
  posts,
  startIndex,
  myId,
  accessToken,
  currentUser,
  onClose,
  onLike,
  onDislike,
  onViewProfile,
  dislikes,
}) {
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [showComments, setShowComments] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || posts.length === 0) return;

    const wraps = root.querySelectorAll(".vf-slide-wrap");
    if (wraps[startIndex]) {
      wraps[startIndex].scrollIntoView({ block: "start" });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number(entry.target.dataset.index);
            if (!Number.isNaN(idx)) {
              setActiveIndex(idx);
              setShowComments(false);
            }
          }
        });
      },
      { root, threshold: [0.6] }
    );

    wraps.forEach((w) => observer.observe(w));
    return () => observer.disconnect();
  }, [posts, startIndex]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleShare(post) {
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
      /* cancelled */
    }
  }

  function handleRemix(post) {
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
    <div className="fp-viewer">
      <button className="fp-close" onClick={onClose} aria-label="Close">
        <XIcon size={22} />
      </button>

      <div className="vf-scroller" ref={containerRef}>
        {posts.map((post, i) => {
          const liked = (post.likes || []).includes(myId);
          const disliked = !!dislikes[post.id];
          const isVideo = isVideoUrl(post.image_url);
          const isActive = i === activeIndex;

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
                    <button
                      className="vf-username"
                      onClick={() => onViewProfile?.(post.persistent_id)}
                    >
                      @{post.username}
                    </button>
                    <span className="vf-time">{timeAgoShort(post.created_at)}</span>
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

                    <button
                      className="vf-action-btn"
                      onClick={() => handleShare(post)}
                      aria-label="Share"
                    >
                      <ShareIcon size={26} />
                    </button>

                    <button
                      className="vf-action-btn"
                      onClick={() => handleRemix(post)}
                      aria-label="Remix"
                    >
                      <RemixIcon size={26} />
                    </button>
                  </div>
                </div>

                {showComments && isActive && (
                  <CommentPanel
                    postId={post.id}
                    currentUser={currentUser}
                    accessToken={accessToken}
                    onClose={() => setShowComments(false)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FullPageVideo({ src, isActive }) {
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const el = ref.current;
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
    const el = ref.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  return (
    <video
      ref={ref}
      className="vf-video"
      src={src}
      playsInline
      muted={muted}
      loop
      preload="metadata"
      onClick={toggleMute}
    />
  );
}

export default function Feed({ refreshSignal, onViewProfile, currentUser, accessToken }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedPostId, setExpandedPostId] = useState(null);
  const [mediaFilter, setMediaFilter] = useState("all");
  const [viewerIndex, setViewerIndex] = useState(null);
  const [dislikes, setDislikes] = useState({});
  const myId = currentUser?.id;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchDebounce = useRef(null);
  const searchBoxRef = useRef(null);

  async function runSearch(q) {
    setSearching(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/profiles/search?q=${encodeURIComponent(q)}&viewerId=${myId || ""}`
      );
      const data = await res.json();
      setSearchResults(res.ok ? data.profiles || [] : []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleSearchChange(value) {
    setSearchQuery(value);
    setShowResults(true);
    clearTimeout(searchDebounce.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    searchDebounce.current = setTimeout(() => runSearch(trimmed), 300);
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const visiblePosts = posts.filter((p) => {
    if (mediaFilter === "all") return true;
    const v = isVideoUrl(p.image_url);
    return mediaFilter === "video" ? v : !v;
  });

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

      <div className="feed-filter-row">
        <button
          className={`feed-filter-chip ${mediaFilter === "all" ? "active" : ""}`}
          onClick={() => setMediaFilter("all")}
        >
          All
        </button>
        <button
          className={`feed-filter-chip ${mediaFilter === "video" ? "active" : ""}`}
          onClick={() => setMediaFilter("video")}
        >
          Videos
        </button>
        <button
          className={`feed-filter-chip ${mediaFilter === "photo" ? "active" : ""}`}
          onClick={() => setMediaFilter("photo")}
        >
          Photos
        </button>
      </div>

      <div className="search-box" ref={searchBoxRef}>
        <div className="search-input-wrap">
          <SearchIcon size={17} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setShowResults(true)}
            placeholder="Search people by name or @username"
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={clearSearch} aria-label="Clear search">
              <XIcon size={15} />
            </button>
          )}
        </div>

        {showResults && searchQuery.trim() && (
          <div className="search-results">
            {searching && <p className="chat-hint small">Searching…</p>}
            {!searching && searchResults.length === 0 && (
              <p className="chat-hint small">No one found.</p>
            )}
            {!searching &&
              searchResults.map((p) => (
                <button
                  key={p.persistentId}
                  className="search-result-row"
                  onClick={() => {
                    onViewProfile?.(p.persistentId);
                    clearSearch();
                  }}
                >
                  <span className="search-result-avatar">
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" />
                    ) : (
                      <span>{p.username[0]?.toUpperCase()}</span>
                    )}
                  </span>
                  <span className="search-result-text">
                    <span className="search-result-username">{p.username}</span>
                    {p.handle && <span className="search-result-handle">@{p.handle}</span>}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {visiblePosts.length === 0 && (
        <p className="chat-hint">
          {mediaFilter === "video"
            ? "No videos yet. Share one from the Post tab."
            : mediaFilter === "photo"
            ? "No photos in the feed yet."
            : "No posts yet. Be the first to share something."}
        </p>
      )}

      <div className="post-list">
        {visiblePosts.map((post, idx) => {
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
              <PostMedia
                url={post.image_url}
                onOpen={() => setViewerIndex(idx)}
              />
              {post.caption && <p className="post-caption">{post.caption}</p>}
              <div className="post-actions">
                <button
                  className={`like-btn ${liked ? "liked" : ""}`}
                  onClick={() => toggleLike(post.id)}
                >
                  <HeartIcon size={19} filled={liked} /> {(post.likes || []).length}
                </button>
                <button
                  className={`like-btn ${dislikes[post.id] ? "disliked" : ""}`}
                  onClick={() => toggleDislike(post.id)}
                >
                  <DislikeIcon size={18} filled={!!dislikes[post.id]} />
                </button>
                <button
                  className="link-btn"
                  onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                >
                  {isExpanded ? "Hide comments" : "Comments"}
                </button>
                <button
                  className="link-btn"
                  onClick={async () => {
                    try {
                      if (navigator.share) {
                        await navigator.share({
                          title: `@${post.username}`,
                          url: post.image_url,
                          text: post.caption || "",
                        });
                      } else if (navigator.clipboard) {
                        await navigator.clipboard.writeText(post.image_url);
                        alert("Link copied!");
                      }
                    } catch {
                      /* cancelled */
                    }
                  }}
                >
                  Share
                </button>
              </div>
              {isExpanded && (
                <CommentSection postId={post.id} currentUser={currentUser} accessToken={accessToken} />
              )}
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
          onViewProfile={(id) => {
            setViewerIndex(null);
            onViewProfile?.(id);
          }}
          dislikes={dislikes}
        />
      )}
    </div>
  );
}
