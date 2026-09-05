import { useEffect, useState } from "react";
import { ArrowLeftIcon, SunIcon, MoonIcon, LogOutIcon, LockIcon, TrashIcon } from "../icons/Icons.jsx";
import { supabase } from "../supabaseClient.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function Settings({ theme, onThemeChange, currentUser, accessToken, onBack }) {
  const [signingOut, setSigningOut] = useState(false);
  const [blockedList, setBlockedList] = useState(null);
  const [showBlocked, setShowBlocked] = useState(false);
  const [unblockBusyId, setUnblockBusyId] = useState(null);

  const [deleteStep, setDeleteStep] = useState(0); // 0 = closed, 1 = confirm dialog
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase?.auth.signOut();
  }

  async function loadBlocked() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/blocks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (res.ok) setBlockedList(json.blocked || []);
    } catch {
      setBlockedList([]);
    }
  }

  useEffect(() => {
    if (showBlocked && blockedList === null) loadBlocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBlocked]);

  async function handleUnblock(targetId) {
    setUnblockBusyId(targetId);
    try {
      await fetch(`${BACKEND_URL}/api/block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ targetPersistentId: targetId }),
      });
      setBlockedList((prev) => prev.filter((p) => p.persistent_id !== targetId));
    } finally {
      setUnblockBusyId(null);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText.trim().toLowerCase() !== "delete") return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/account`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "delete_failed");
      await supabase?.auth.signOut();
      window.location.reload();
    } catch (e) {
      setDeleteError("Couldn't delete your account right now - try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="settings-screen">
      <div className="settings-top-bar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={20} />
        </button>
        <h2>Settings</h2>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">Appearance</div>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-row-label">Theme</span>
            <div className="theme-toggle">
              <button
                className={`theme-toggle-btn ${theme === "light" ? "active" : ""}`}
                onClick={() => onThemeChange("light")}
              >
                <SunIcon size={14} /> Light
              </button>
              <button
                className={`theme-toggle-btn ${theme === "dark" ? "active" : ""}`}
                onClick={() => onThemeChange("dark")}
              >
                <MoonIcon size={14} /> Dark
              </button>
            </div>
          </div>
        </div>
      </div>

      {currentUser && (
        <div className="settings-section">
          <div className="settings-section-label">Privacy</div>
          <div className="settings-card">
            <div className="settings-row">
              <button className="settings-row-button" onClick={() => setShowBlocked((v) => !v)}>
                <span className="settings-row-label">
                  <LockIcon size={17} />
                  Blocked accounts
                </span>
              </button>
            </div>
            {showBlocked && (
              <div style={{ padding: "0 16px 14px" }}>
                {blockedList === null && <p className="chat-hint small">Loading…</p>}
                {blockedList?.length === 0 && (
                  <p className="chat-hint small">You haven't blocked anyone.</p>
                )}
                {blockedList?.map((p) => (
                  <div
                    key={p.persistent_id}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {p.username}
                      {p.handle && <span style={{ color: "var(--ash)", fontWeight: 500 }}> @{p.handle}</span>}
                    </span>
                    <button
                      className="btn-secondary small"
                      onClick={() => handleUnblock(p.persistent_id)}
                      disabled={unblockBusyId === p.persistent_id}
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="settings-row-sub" style={{ marginTop: 8, paddingLeft: 4 }}>
            Set your account to private from your Profile's Edit screen.
          </p>
        </div>
      )}

      {currentUser && (
        <div className="settings-section">
          <div className="settings-section-label">Account</div>
          <div className="settings-card">
            <div className="settings-row">
              <div>
                <div className="settings-row-label">{currentUser.email || "Signed in"}</div>
                <div className="settings-row-sub">
                  Signed in with {currentUser.app_metadata?.provider || "email"}
                </div>
              </div>
            </div>
            <div className="settings-row">
              <button className="settings-row-button" onClick={handleSignOut} disabled={signingOut}>
                <span className="settings-row-label" style={{ color: "var(--danger)" }}>
                  <LogOutIcon size={17} />
                  {signingOut ? "Signing out…" : "Sign Out"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {currentUser && (
        <div className="settings-section">
          <div className="settings-section-label">Danger Zone</div>
          <div className="settings-card">
            <div className="settings-row">
              <button className="settings-row-button" onClick={() => setDeleteStep(1)}>
                <span className="settings-row-label" style={{ color: "var(--danger)" }}>
                  <TrashIcon size={17} />
                  Delete Account
                </span>
              </button>
            </div>
          </div>
          <p className="settings-row-sub" style={{ marginTop: 8, paddingLeft: 4 }}>
            Permanently deletes your posts, profile, follows, and account. This cannot be undone.
          </p>
        </div>
      )}

      <div className="settings-section">
        <div className="settings-section-label">About</div>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-row-label">5minchat</span>
            <span className="settings-row-sub">v1.0</span>
          </div>
        </div>
      </div>

      {deleteStep === 1 && (
        <div className="modal-backdrop" onClick={() => !deleting && setDeleteStep(0)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete your account?</h3>
            <p className="modal-sub">
              This permanently deletes your posts, profile, followers/following, and login - for
              everyone, immediately. This can't be undone. The anonymous 5-min chat feature is
              unaffected since it was never tied to your account.
            </p>
            <p className="modal-sub" style={{ fontWeight: 700 }}>Type DELETE to confirm:</p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              style={{
                width: "100%",
                marginBottom: 16,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1.5px solid var(--border)",
                background: "var(--void)",
                color: "var(--paper)",
                fontSize: 14,
              }}
            />
            {deleteError && <p className="error-text small">{deleteError}</p>}
            <div className="modal-buttons">
              <button className="btn-secondary" onClick={() => setDeleteStep(0)} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn-primary small"
                style={{ background: "var(--danger)", boxShadow: "none" }}
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText.trim().toLowerCase() !== "delete"}
              >
                {deleting ? "Deleting…" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
