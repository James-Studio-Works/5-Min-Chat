import { useEffect, useState } from "react";
import { socket } from "../socket";
import { ArrowLeftIcon } from "../icons/Icons.jsx";

export default function Friends({ onBack, onStartFriendChat }) {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function refresh() {
    setLoading(true);
    socket.emit("get_friends", {}, (res) => {
      setLoading(false);
      if (res?.ok) {
        setFriends(res.friends);
      }
    });
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  function handleConnect(friend) {
    setError(null);
    onStartFriendChat(friend.persistentId, (errCode) => {
      const messages = {
        friend_offline: `${friend.username} isn't online right now.`,
        friend_busy: `${friend.username} is already in a chat.`,
        already_in_session: "You're already in a session.",
        blocked: "You can't connect with this person.",
        not_friends: "Something went wrong - try refreshing.",
      };
      setError(messages[errCode] || "Couldn't start the chat - try again.");
    });
  }

  return (
    <div className="screen friends-screen">
      <div className="friends-inner">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={22} />
        </button>
        <h2>Your Friends</h2>
        <p className="lede small">
          People you've mutually added after a chat. A friend chat is still a
          normal, timed five-minute session.
        </p>

        {error && <p className="error-text">{error}</p>}

        {loading && friends.length === 0 && <p className="chat-hint">Loading…</p>}

        {!loading && friends.length === 0 && (
          <p className="chat-hint">
            No friends yet. You can add someone during a chat if you both agree.
          </p>
        )}

        <div className="friends-list">
          {friends.map((f) => (
            <div key={f.persistentId} className="friend-row">
              <div className="friend-info">
                <span className={`status-dot ${f.online ? "online" : "offline"}`} />
                <span className="friend-name">{f.username}</span>
              </div>
              <button
                className="btn-secondary small"
                disabled={!f.online}
                onClick={() => handleConnect(f)}
              >
                {f.online ? "Chat" : "Offline"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
