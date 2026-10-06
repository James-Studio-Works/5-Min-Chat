import { useCallback, useEffect, useState } from "react";
import { socket } from "./socket";
import Landing from "./components/Landing.jsx";
import Waiting from "./components/Waiting.jsx";
import ChatRoom from "./components/ChatRoom.jsx";
import GroupChatRoom from "./components/GroupChatRoom.jsx";
import EndScreen from "./components/EndScreen.jsx";
import Friends from "./components/Friends.jsx";
import { USERNAME_KEY, getOrCreatePersistentId } from "./identity.js";

const MOMENTS_KEY = "5minchat_moments_count";

function getMomentsCount() {
  const raw = localStorage.getItem(MOMENTS_KEY);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function bumpMomentsCount() {
  const next = getMomentsCount() + 1;
  localStorage.setItem(MOMENTS_KEY, String(next));
  return next;
}

export default function ChatApp() {
  const [view, setView] = useState("landing");
  const [yourName, setYourName] = useState(null);
  const [usernameDraft, setUsernameDraft] = useState(localStorage.getItem(USERNAME_KEY) || "");
  const [usernameError, setUsernameError] = useState(null);
  const [session, setSession] = useState(null);
  const [groupSession, setGroupSession] = useState(null);
  const [endReason, setEndReason] = useState(null);
  const [connectionError, setConnectionError] = useState(false);
  const [momentsCount, setMomentsCount] = useState(getMomentsCount());
  const [friendRequestIncoming, setFriendRequestIncoming] = useState(null);
  const [friendRequestOutgoingStatus, setFriendRequestOutgoingStatus] = useState(null);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState(null);

  const persistentId = getOrCreatePersistentId();

  const sendIdentify = useCallback(
    (usernameOverride) => {
      const usernameToSend = usernameOverride ?? localStorage.getItem(USERNAME_KEY) ?? "";
      socket.emit("identify", { persistentId, username: usernameToSend }, (res) => {
        if (res?.ok) {
          setYourName(res.appliedName);
          if (res.usernameRejectedReason) {
            setUsernameError(
              res.usernameRejectedReason === "profanity" ||
                res.usernameRejectedReason === "impersonation"
                ? "That username isn't allowed - try something else."
                : res.usernameRejectedReason === "invalid_characters"
                ? "Usernames can only use letters, numbers, spaces, - and _"
                : "That username couldn't be used - try something else."
            );
          } else {
            setUsernameError(null);
          }
        }
      });
    },
    [persistentId]
  );

  useEffect(() => {
    function handleConnected({ anonName }) {
      setYourName(anonName);
      setConnectionError(false);
      sendIdentify();
    }
    function handleConnectError() {
      setConnectionError(true);
    }
    function handleMatchFound(payload) {
      setSession({
        roomId: payload.roomId,
        endTime: payload.endTime,
        yourName: payload.yourName,
        partnerName: payload.partnerName,
        partnerSocketId: payload.partnerSocketId,
      });
      setFriendRequestOutgoingStatus(null);
      setView("chat");
    }
    function handleFriendRequestReceived({ fromName }) {
      setFriendRequestIncoming({ fromName });
    }
    function handleFriendRequestResult({ accepted }) {
      setFriendRequestOutgoingStatus(accepted ? "accepted" : "declined");
    }

    socket.on("connected", handleConnected);
    socket.on("connect_error", handleConnectError);
    socket.on("match_found", handleMatchFound);
    socket.on("friend_request_received", handleFriendRequestReceived);
    socket.on("friend_request_result", handleFriendRequestResult);

    socket.connect();

    return () => {
      socket.off("connected", handleConnected);
      socket.off("connect_error", handleConnectError);
      socket.off("match_found", handleMatchFound);
      socket.off("friend_request_received", handleFriendRequestReceived);
      socket.off("friend_request_result", handleFriendRequestResult);
    };
  }, [sendIdentify]);

  const handleUsernameChange = useCallback((value) => {
    setUsernameDraft(value);
    localStorage.setItem(USERNAME_KEY, value);
  }, []);

  const handleStart = useCallback(() => {
    if (!socket.connected) socket.connect();
    sendIdentify(usernameDraft);
    setView("waiting");
    socket.emit("find_match");
  }, [sendIdentify, usernameDraft]);

  const handleCancelWaiting = useCallback(() => {
    socket.emit("cancel_match");
    setView("landing");
  }, []);

  const handleCreateGroup = useCallback(() => {
    if (!socket.connected) socket.connect();
    setGroupError(null);
    setGroupBusy(true);
    sendIdentify(usernameDraft);
    socket.emit("create_group", (res) => {
      setGroupBusy(false);
      if (!res?.ok) {
        setGroupError(
          res?.error === "already_in_room"
            ? "You're already in a chat."
            : "Couldn't create a group — try again."
        );
        return;
      }
      setGroupSession({
        roomId: res.roomId,
        endTime: res.endTime,
        yourName: res.yourName,
        code: res.code,
        members: res.members || [],
      });
      setView("group");
    });
  }, [sendIdentify, usernameDraft]);

  const handleJoinGroup = useCallback(
    (code) => {
      if (!socket.connected) socket.connect();
      setGroupError(null);
      setGroupBusy(true);
      sendIdentify(usernameDraft);
      socket.emit("join_group", { code }, (res) => {
        setGroupBusy(false);
        if (!res?.ok) {
          const messages = {
            invalid_code: "That code isn't valid or the room closed.",
            room_full: "That group is full (max 8).",
            session_expired: "That group already timed out.",
            already_in_room: "You're already in a chat.",
          };
          setGroupError(messages[res?.error] || "Couldn't join — try again.");
          return;
        }
        setGroupSession({
          roomId: res.roomId,
          endTime: res.endTime,
          yourName: res.yourName,
          code: res.code,
          members: res.members || [],
        });
        setView("group");
      });
    },
    [sendIdentify, usernameDraft]
  );

  const handleSessionEnd = useCallback(({ reason }) => {
    setEndReason(reason);
    if (reason === "timeout" || reason === "left" || reason === "partner_left") {
      setMomentsCount(bumpMomentsCount());
    }
    setSession(null);
    setGroupSession(null);
    setView("end");
  }, []);

  const handleRestart = useCallback(() => {
    setView("landing");
  }, []);

  const handleOpenFriends = useCallback(() => {
    setView("friends");
  }, []);

  const handleStartFriendChat = useCallback((friendPersistentId, onError) => {
    socket.emit("start_friend_chat", { friendPersistentId }, (res) => {
      if (!res?.ok) onError?.(res?.error || "unknown_error");
    });
  }, []);

  const handleAcceptFriendRequest = useCallback((accept) => {
    socket.emit("respond_friend_request", { accept });
    setFriendRequestIncoming(null);
  }, []);

  return (
    <>
      {view === "landing" && (
        <Landing
          onStart={handleStart}
          onCreateGroup={handleCreateGroup}
          onJoinGroup={handleJoinGroup}
          connectionError={connectionError}
          usernameDraft={usernameDraft}
          onUsernameChange={handleUsernameChange}
          usernameError={usernameError}
          onOpenFriends={handleOpenFriends}
          groupBusy={groupBusy}
          groupError={groupError}
        />
      )}
      {view === "waiting" && <Waiting onCancel={handleCancelWaiting} yourName={yourName} />}
      {view === "chat" && session && (
        <ChatRoom
          session={session}
          onSessionEnd={handleSessionEnd}
          friendRequestIncoming={friendRequestIncoming}
          onRespondFriendRequest={handleAcceptFriendRequest}
          friendRequestOutgoingStatus={friendRequestOutgoingStatus}
        />
      )}
      {view === "group" && groupSession && (
        <GroupChatRoom session={groupSession} onSessionEnd={handleSessionEnd} />
      )}
      {view === "end" && (
        <EndScreen endReason={endReason} onRestart={handleRestart} momentsCount={momentsCount} />
      )}
      {view === "friends" && (
        <Friends onBack={() => setView("landing")} onStartFriendChat={handleStartFriendChat} />
      )}
    </>
  );
}
