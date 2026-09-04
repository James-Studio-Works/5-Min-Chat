import CountdownRing from "./CountdownRing.jsx";
import { ChatIcon, ChevronRightIcon } from "../icons/Icons.jsx";

export default function Landing({
  onStart,
  connectionError,
  usernameDraft,
  onUsernameChange,
  usernameError,
  onOpenFriends,
}) {
  return (
    <div className="screen landing">
      <div className="landing-inner">
        <p className="eyebrow">
          <ChatIcon size={20} /> 5minchat
        </p>

        <div className="landing-hero-ring">
          <CountdownRing progress={0.62} size={96} strokeWidth={5}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700 }}>
              3:07
            </span>
          </CountdownRing>
        </div>

        <h1>
          Five minutes.
          <br />
          One stranger.
          <br />
          <span className="accent">Zero history.</span>
        </h1>
        <p className="lede">
          No profile. No pressure to keep talking. When the ring runs out,
          the conversation disappears — for good.
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

        <button className="btn-primary" onClick={onStart}>
          Start a Chat
        </button>

        <button className="friends-link" onClick={onOpenFriends}>
          My Friends <ChevronRightIcon size={14} />
        </button>

        {connectionError && (
          <p className="error-text">
            Can't reach the server right now. It may be waking up (free-tier
            hosting can take ~30s to spin up) — try again in a moment.
          </p>
        )}

        <div className="principles">
          <div className="principle">
            <span className="dot" />
            Pick a name, or get a random one
          </div>
          <div className="principle">
            <span className="dot" />
            Five minutes means five minutes — the server enforces it
          </div>
          <div className="principle">
            <span className="dot" />
            Nothing is saved on our end once the chat ends
          </div>
          <div className="principle">
            <span className="dot" />
            Report, block, or leave at any moment
          </div>
        </div>

        <p className="fine-print">
          Some people become memories. Some moments are better forgotten.
        </p>
      </div>
    </div>
  );
}
