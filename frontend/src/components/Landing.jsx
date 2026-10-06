import CountdownRing from "./CountdownRing.jsx";
import { ChatIcon, ChevronRightIcon, UserIcon } from "../icons/Icons.jsx";

export default function Landing({
  onStart,
  onCreateGroup,
  onJoinGroup,
  connectionError,
  usernameDraft,
  onUsernameChange,
  usernameError,
  onOpenFriends,
  groupBusy,
  groupError,
}) {
  return (
    <div className="screen landing">
      <div className="landing-inner">
        <p className="eyebrow">
          <ChatIcon size={20} /> 5minchat
        </p>

        <div className="landing-hero-ring">
          <CountdownRing progress={0.62} size={88} strokeWidth={5}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700 }}>
              5:00
            </span>
          </CountdownRing>
        </div>

        <h1>
          Talk for five minutes.
          <br />
          <span className="accent">Then it's gone.</span>
        </h1>
        <p className="lede">
          Match with a stranger or open a private group room. No history kept on our servers.
        </p>

        <div className="username-field">
          <label htmlFor="username-input">Display name (optional)</label>
          <input
            id="username-input"
            type="text"
            value={usernameDraft}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="Leave blank for a random name"
            maxLength={20}
          />
          {usernameError && <p className="error-text small">{usernameError}</p>}
        </div>

        <div className="landing-modes">
          <button className="mode-card mode-card-primary" onClick={onStart} type="button">
            <span className="mode-card-icon">
              <UserIcon size={22} />
            </span>
            <span className="mode-card-title">Stranger chat</span>
            <span className="mode-card-desc">1-on-1 · matched randomly · 5 min</span>
          </button>

          <button
            className="mode-card"
            onClick={onCreateGroup}
            type="button"
            disabled={groupBusy}
          >
            <span className="mode-card-icon mode-card-icon-group">👥</span>
            <span className="mode-card-title">Create group</span>
            <span className="mode-card-desc">Share a code · up to 8 people</span>
          </button>
        </div>

        <div className="join-group-row">
          <input
            type="text"
            className="join-group-input"
            placeholder="Enter group code"
            maxLength={8}
            id="group-code-input"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = e.currentTarget.value.trim();
                if (v) onJoinGroup?.(v);
              }
            }}
          />
          <button
            type="button"
            className="btn-secondary small"
            disabled={groupBusy}
            onClick={() => {
              const el = document.getElementById("group-code-input");
              const v = el?.value?.trim();
              if (v) onJoinGroup?.(v);
            }}
          >
            Join
          </button>
        </div>

        {groupError && <p className="error-text">{groupError}</p>}

        <button className="friends-link" onClick={onOpenFriends}>
          My Friends <ChevronRightIcon size={14} />
        </button>

        {connectionError && (
          <p className="error-text">
            Can't reach the server right now. Free-tier hosts can take ~30s to wake — try again shortly.
          </p>
        )}

        <div className="principles">
          <div className="principle">
            <span className="dot" />
            Five minutes — the server enforces the timer
          </div>
          <div className="principle">
            <span className="dot" />
            Group rooms use a short code you can share
          </div>
          <div className="principle">
            <span className="dot" />
            Nothing is stored once the chat ends
          </div>
        </div>
      </div>
    </div>
  );
}
