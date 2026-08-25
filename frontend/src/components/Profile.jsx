import { useEffect, useState } from "react";
import { uploadImage } from "../cloudinary.js";
import { supabase } from "../supabaseClient.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function Profile({ persistentId, currentUser, accessToken, onBack, onViewProfile }) {
  const myPersistentId = currentUser?.id;
  const isOwn = persistentId === myPersistentId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  function defaultUsername() {
    return currentUser?.user_metadata?.full_name || currentUser?.email?.split("@")[0] || "Anonymous";
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = `${BACKEND_URL}/api/profiles/${persistentId}?viewerId=${myPersistentId || ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "failed");
      setData(json);
      setBioDraft(json.profile.bio || "");
    } catch (e) {
      setError(
        e.message === "feed_not_configured"
          ? "Profiles aren't set up yet - see README for Supabase setup."
          : "Couldn't load this profile."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistentId]);

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSaveProfile() {
    setSaving(true);
    setError(null);
    try {
      let avatarUrl = data?.profile?.avatarUrl || null;
      if (avatarFile) {
        avatarUrl = await uploadImage(avatarFile);
      }
      const res = await fetch(`${BACKEND_URL}/api/profiles/me`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          username: defaultUsername(),
          bio: bioDraft,
          avatarUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.error === "moderated") throw new Error("That bio didn't meet the content guidelines.");
        if (json?.error === "not_authenticated" || json?.error === "invalid_session") {
          throw new Error("Your session expired - try logging in again.");
        }
        throw new Error(json?.error || "save_failed");
      }
      setEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      await load();
    } catch (e) {
      setError(e.message || "Couldn't save your profile - try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFollowToggle() {
    setFollowBusy(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/follow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ targetPersistentId: persistentId }),
      });
      const json = await res.json();
      if (res.ok) {
        setData((prev) => ({
          ...prev,
          isFollowing: json.following,
          followerCount: prev.followerCount + (json.following ? 1 : -1),
        }));
      }
    } finally {
      setFollowBusy(false);
    }
  }

  function handleSignOut() {
    supabase?.auth.signOut();
  }

  if (loading) {
    return (
      <div className="profile-screen">
        {onBack && (
          <button className="link-btn" onClick={onBack}>
            ← Back
          </button>
        )}
        <p className="chat-hint">Loading profile…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="profile-screen">
        {onBack && (
          <button className="link-btn" onClick={onBack}>
            ← Back
          </button>
        )}
        <p className="error-text">{error}</p>
      </div>
    );
  }

  const { profile, posts, followerCount, followingCount, isFollowing } = data;

  return (
    <div className="profile-screen">
      {onBack && (
        <button className="link-btn" onClick={onBack}>
          ← Back
        </button>
      )}

      <div className="profile-header">
        <div className="profile-avatar">
          {avatarPreview || profile.avatarUrl ? (
            <img src={avatarPreview || profile.avatarUrl} alt="" />
          ) : (
            <span className="profile-avatar-fallback">{profile.username[0]?.toUpperCase()}</span>
          )}
        </div>
        <div className="profile-meta">
          <h2>{profile.username}</h2>
          <div className="profile-stats">
            <span>
              <strong>{posts.length}</strong> posts
            </span>
            <span>
              <strong>{followerCount}</strong> followers
            </span>
            <span>
              <strong>{followingCount}</strong> following
            </span>
          </div>
        </div>
      </div>

      {!editing && profile.bio && <p className="profile-bio">{profile.bio}</p>}

      {isOwn && !editing && (
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-secondary small" onClick={() => setEditing(true)}>
            Edit Profile
          </button>
          <button className="btn-secondary small" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      )}

      {!isOwn && (
        <button
          className={isFollowing ? "btn-secondary small" : "btn-primary small"}
          onClick={handleFollowToggle}
          disabled={followBusy}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>
      )}

      {isOwn && editing && (
        <div className="profile-edit">
          <label className="avatar-picker">
            {avatarPreview || profile.avatarUrl ? (
              <img src={avatarPreview || profile.avatarUrl} alt="" />
            ) : (
              <span>Choose photo</span>
            )}
            <input type="file" accept="image/*" onChange={handleAvatarChange} hidden />
          </label>
          <textarea
            value={bioDraft}
            onChange={(e) => setBioDraft(e.target.value)}
            placeholder="Write a short bio…"
            maxLength={160}
            rows={3}
          />
          {error && <p className="error-text small">{error}</p>}
          <div className="modal-buttons">
            <button className="btn-secondary small" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn-primary small" onClick={handleSaveProfile} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      <div className="profile-grid">
        {posts.length === 0 && <p className="chat-hint">No posts yet.</p>}
        {posts.map((post) => (
          <img key={post.id} className="profile-grid-item" src={post.image_url} alt="" loading="lazy" />
        ))}
      </div>
    </div>
  );
}
