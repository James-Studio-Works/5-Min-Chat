import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket";
import CountdownRing from "./CountdownRing.jsx";

const SESSION_DURATION_MS = 5 * 60 * 1000;

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GroupChatRoom({ session, onSessionEnd }) {
  const { roomId, endTime, yourName, code, members: initialMembers } = session;

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [remainingMs, setRemainingMs] = useState(endTime - Date.now());
  const [members, setMembers] = useState(initialMembers || []);
  const [moderationNotice, setModerationNotice] = useState(null);
  const [copied, setCopied] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(Math.max(0, endTime - Date.now()));
    }, 250);
    return () => clearInterval(interval);
  }, [endTime]);

  useEffect(() => {
    function handleMessage(msg) {
      setMessages((prev) => [...prev, msg]);
    }
    function handleMemberJoined({ members: next }) {
      if (next) setMembers(next);
    }
    function handleMemberLeft({ members: next }) {
      if (next) setMembers(next);
    }
    function handleModerationBlocked({ reason }) {
      setModerationNotice(
        reason === "personal_info"
          ? "That looked like contact info — not sent."
          : "Message blocked by content guidelines."
      );
      setTimeout(() => setModerationNotice(null), 4000);
    }
    function handleSessionExpired({ reason }) {
      onSessionEnd({ reason: reason || "timeout" });
    }

    socket.on("message_received", handleMessage);
    socket.on("group_member_joined", handleMemberJoined);
    socket.on("group_member_left", handleMemberLeft);
    socket.on("moderation_blocked", handleModerationBlocked);
    socket.on("session_expired", handleSessionExpired);

    return () => {
      socket.off("message_received", handleMessage);
      socket.off("group_member_joined", handleMemberJoined);
      socket.off("group_member_left", handleMemberLeft);
      socket.off("moderation_blocked", handleModerationBlocked);
      socket.off("session_expired", handleSessionExpired);
    };
  }, [onSessionEnd]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isExpired = remainingMs <= 0;
  const timeLabel = useMemo(() => formatTime(remainingMs), [remainingMs]);
  const isUrgent = remainingMs < 30_000;
  const progress = Math.max(0, Math.min(1, remainingMs / SESSION_DURATION_MS));

  function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isExpired) return;

    socket.emit("send_message", { text }, (res) => {
      if (!res?.ok && res?.error === "rate_limited") {
        setModerationNotice("Slow down a little — too many messages.");
        setTimeout(() => setModerationNotice(null), 4000);
      }
    });
    setDraft("");
    socket.emit("typing", false);
  }

  function handleDraftChange(e) {
    setDraft(e.target.value);
    socket.emit("typing", true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit("typing", false), 1500);
  }

  function handleLeave() {
    socket.emit("leave_chat");
    onSessionEnd({ reason: "left" });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="screen chat-room group-chat-room">
      <div className="chat-header">
        <div className="partner-label">
          <strong>Group</strong>
          <button type="button" className="group-code-pill" onClick={copyCode}>
            {code} {copied ? "✓" : "copy"}
          </button>
        </div>
        <div className={`timer-value ${isUrgent ? "urgent" : ""}`}>
          <CountdownRing progress={progress} size={44} strokeWidth={4} urgent={isUrgent}>
            <span style={{ fontSize: 10 }}>{timeLabel}</span>
          </CountdownRing>
        </div>
      </div>

      <div className="group-members-bar">
        {members.map((m) => (
          <span key={m.socketId} className="group-member-chip">
            {m.name}
          </span>
        ))}
        <span className="group-member-count">{members.length}/8</span>
      </div>

      <div className="chat-actions">
        <button className="link-btn danger" onClick={handleLeave}>
          Leave group
        </button>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <p className="chat-hint">
            Share code <strong>{code}</strong> so others can join. You've got five minutes.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderName === yourName;
          return (
            <div key={m.id} className={`bubble ${mine ? "mine" : "theirs"}`}>
              {!mine && <div className="bubble-sender">{m.senderName}</div>}
              {m.text}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {moderationNotice && <div className="moderation-toast">{moderationNotice}</div>}

      <form className="composer" onSubmit={sendMessage}>
        <input
          type="text"
          value={draft}
          onChange={handleDraftChange}
          placeholder={isExpired ? "Time's up" : "Message the group…"}
          maxLength={500}
          disabled={isExpired}
          autoFocus
        />
        <button type="submit" className="btn-primary small" disabled={isExpired || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
