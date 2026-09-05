import { useEffect, useRef, useState } from "react";
import { uploadImage } from "../cloudinary.js";
import { ArrowLeftIcon, SettingsIcon, LockIcon } from "../icons/Icons.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const HANDLE_ERROR_MESSAGES = {
  too_short: "At least 3 characters.",
  too_long: "20 characters max.",
  invalid_characters: "Only lowercase letters, numbers, and _ allowed.",
  must_start_with_letter: "Must start with a letter.",
  profanity: "That username isn't allowed.",
  impersonation: "That username isn't allowed.",
  taken: "That username is already taken.",
  invalid: "Enter a username.",
};

export default function Profile({ persistentId, currentUser, accessToken, onBack, onViewProfile, onOpenSettings }) {
  const myPersistentId = currentUser?.id;
  const isOwn = persistentId === myPersistentId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [handleDraft, setHandleDraft] = useState("");
  const [handleStatus, setHandleStatus] = useState(null);
  const [privateDraft, setPrivateDraft] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const handleCheckTimeout = useRef(null);

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
      setHandleDraft(json.profile.handle || "");
      setPrivateDraft(!!json.profile.isPrivate);
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

  function handleHandleChange(value) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setHandleDraft(cleaned);
    setHandleStatus(null);
    clearTimeout(handleCheckTimeout.current);

    if (!cleaned) return;
    if (cleaned === data?.profile?.handle) return;

    handleCheckTimeout.current = setTimeout(async () => {
      setHandleStatus("checking");
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/handles/check?handle=${encodeURIComponent(cleaned)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const json = await res.json();
        setHandleStatus(json);
      } catch {
        setHandleStatus(null);
      }
    }, 400);
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
          handle: handleDraft || undefined,
          bio: bioDraft,
          avatarUrl,
          isPrivate: privateDraft,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.error === "moderated") throw new Error("That bio didn't meet the content guidelines.");
        if (json?.error === "handle_taken") throw new Error("That username is already taken.");
        if (json?.error === "invalid_handle") {
          throw new Error(HANDLE_ERROR_MESSAGES[json.reason] || "That username isn't valid.");
        }
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
        await load();
      }
    } finally {
      setFollowBusy(false);
    }
  }

  async function handleBlockToggle() {
    const confirmMsg = data.isBlocked
      ? null // unblock never needs confirmation
      : `Block ${data.profile.username}? They won't be able to see your profile or posts, and you won't see theirs.`;
    if (confirmMsg && !window.confirm(confirmMsg)) return;

    setBlockBusy(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ targetPersistentId: persistentId }),
      });
      if (res.ok) await load();
    } finally {
      setBlockBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="profile-screen">
        <div className="profile-topbar">
          {onBack && (
            <button className="icon-btn" onClick={onBack} aria-label="Back">
              <ArrowLeftIcon size={22} />
            </button>
          )}
        </div>
        <p className="chat-hint">Loading profile…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="profile-screen">
        <div className="profile-topbar">
          {onBack && (
            <button className="icon-btn" onClick={onBack} aria-label="Back">
              <ArrowLeftIcon size={22} />
            </button>
          )}
        </div>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  const { profile, posts, postsHidden, isBlocked, followerCount, followingCount, isFollowing } = data;
  const canSave =
    !saving &&
    (!handleDraft || handleDraft === profile.handle || handleStatus?.available === true);

  return (
    <div className="profile-screen">
      <div className="profile-topbar">
        {onBack ? (
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <ArrowLeftIcon size={22} />
          </button>
        ) : (
          <span />
        )}
        {isOwn && (
          <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings">
            <SettingsIcon size={22} />
          </button>
        )}
      </div>

      <div className="profile-header">
        <div className="profile-avatar">
          {avatarPreview || profile.avatarUrl ? (
            <img src={avatarPreview || profile.avatarUrl} alt="" />
          ) : (
            <span className="profile-avatar-fallback">{profile.username[0]?.toUpperCase()}</span>
          )}
        </div>
        <div className="profile-meta">
          <h2>
            {profile.username}
            {profile.isPrivate && <LockIcon size={15} style={{ marginLeft: 6, verticalAlign: -2 }} />}
          </h2>
          {profile.handle && <p className="profile-handle">@{profile.handle}</p>}
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-secondary small" onClick={() => setEditing(true)}>
            Edit Profile
          </button>
          {!profile.handle && (
            <button className="btn-primary small" onClick={() => setEditing(true)}>
              Choose a username
            </button>
          )}
        </div>
      )}

      {!isOwn && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className={isFollowing ? "btn-secondary small" : "btn-primary small"}
            onClick={handleFollowToggle}
            disabled={followBusy || isBlocked}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>
          <button className="btn-secondary small" onClick={handleBlockToggle} disabled={blockBusy}>
            {isBlocked ? "Unblock" : "Block"}
          </button>
        </div>
      )}

      {isBlocked && (
        <p className="chat-hint" style={{ marginTop: 20 }}>
          You've blocked this account, or they've blocked you.
        </p>
      )}

      {postsHidden && !isBlocked && (
        <div className="chat-hint" style={{ marginTop: 30 }}>
          <LockIcon size={22} />
          <p style={{ marginTop: 8 }}>This account is private. Follow to see their posts.</p>
        </div>
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

          <div>
            <input
              type="text"
              value={handleDraft}
              onChange={(e) => handleHandleChange(e.target.value)}
              placeholder="username (e.g. james_b07)"
              maxLength={20}
            />
            {handleStatus === "checking" && <p className="handle-hint">Checking…</p>}
            {handleStatus && handleStatus !== "checking" && handleDraft !== profile.handle && (
              <p className={`handle-hint ${handleStatus.available ? "ok" : "bad"}`}>
                {handleStatus.available
                  ? `@${handleDraft} is available`
                  : HANDLE_ERROR_MESSAGES[handleStatus.reason] || "Not available"}
              </p>
            )}
          </div>

          <textarea
            value={bioDraft}
            onChange={(e) => setBioDraft(e.target.value)}
            placeholder="Write a short bio…"
            maxLength={160}
            rows={3}
          />

          <label className="settings-row" style={{ padding: "10px 0" }}>
            <span className="settings-row-label">
              <LockIcon size={17} /> Private account
            </span>
            <input
              type="checkbox"
              checked={privateDraft}
              onChange={(e) => setPrivateDraft(e.target.checked)}
            />
          </label>

          {error && <p className="error-text small">{error}</p>}
          <div className="modal-buttons">
            <button className="btn-secondary small" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn-primary small" onClick={handleSaveProfile} disabled={!canSave}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {!postsHidden && !isBlocked && (
        <div className="profile-grid">
          {posts.length === 0 && <p className="chat-hint">No posts yet.</p>}
          {posts.map((post) => (
            <img key={post.id} className="profile-grid-item" src={post.image_url} alt="" loading="lazy" />
          ))}
        </div>
      )}
    </div>
  );
}
