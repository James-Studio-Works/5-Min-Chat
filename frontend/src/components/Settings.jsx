import { useState } from "react";
import { ArrowLeftIcon, SunIcon, MoonIcon, LogOutIcon } from "../icons/Icons.jsx";
import { supabase } from "../supabaseClient.js";

export default function Settings({ theme, onThemeChange, currentUser, onBack }) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase?.auth.signOut();
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

      <div className="settings-section">
        <div className="settings-section-label">About</div>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-row-label">5minchat</span>
            <span className="settings-row-sub">v1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
