require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { moderateMessage, moderateUsername } = require("./moderation");

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 4000;

// Accepts a comma separated list, e.g.
// FRONTEND_URL=https://5minchat.online,https://www.5minchat.online,https://5minchat.vercel.app
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes, server-authoritative
const MAX_MESSAGE_LENGTH = 500;
const MESSAGE_RATE_WINDOW_MS = 10_000; // 10s
const MESSAGE_RATE_MAX = 8; // max messages per window
const REMATCH_COOLDOWN_MS = 2 * 60 * 1000; // don't re-pair the same 2 people for 2 min
const MAX_QUEUE_WAIT_LOG_MS = 60_000;
const FRIEND_REQUEST_COOLDOWN_MS = 60 * 1000; // 1 per minute per requester, anti-spam
const MAX_FRIENDS = 200; // sanity ceiling per person

// ---------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------
const app = express();

const corsOptions = {
  origin: ALLOWED_ORIGINS.includes("*") ? true : ALLOWED_ORIGINS,
  methods: ["GET", "POST"],
};
app.use(cors(corsOptions));
app.use(express.json());

// ---------------------------------------------------------------------
// Feed feature (posts + likes). Backed by Supabase (Postgres) since
// Render's free-tier disk is wiped on every restart/redeploy - anything
// written to local disk (like a SQLite file) would not survive. If these
// env vars aren't set, the feed endpoints return 503 rather than crashing
// the whole server - the chat feature keeps working either way.
// ---------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

if (!supabase) {
  console.warn(
    "[feed] SUPABASE_URL / SUPABASE_SERVICE_KEY not set - /api/posts routes will return 503 until configured. See README."
  );
}

function requireSupabase(_req, res, next) {
  if (!supabase) return res.status(503).json({ error: "feed_not_configured" });
  next();
}

app.get("/api/posts", requireSupabase, async (_req, res) => {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ posts: data });
});

app.post("/api/posts", requireSupabase, async (req, res) => {
  const { persistentId, username, imageUrl, caption } = req.body || {};

  if (typeof persistentId !== "string" || persistentId.length < 8) {
    return res.status(400).json({ error: "invalid_persistent_id" });
  }
  if (typeof imageUrl !== "string" || !imageUrl.startsWith("https://")) {
    return res.status(400).json({ error: "invalid_image_url" });
  }

  const safeUsername =
    typeof username === "string" && username.trim() ? username.trim().slice(0, 20) : "Anonymous";

  if (typeof caption === "string" && caption.trim()) {
    const modResult = await moderateMessage(caption.trim());
    if (!modResult.allowed) {
      return res.status(400).json({ error: "moderated", reason: modResult.reason });
    }
  }

  // Keep a lightweight profile row in sync so a profile page exists even
  // for someone who's never explicitly "set up" one - the first post
  // creates it. Best-effort: a failure here doesn't block the post itself.
  await supabase
    .from("profiles")
    .upsert({ persistent_id: persistentId, username: safeUsername }, { onConflict: "persistent_id" });

  const { data, error } = await supabase
    .from("posts")
    .insert({
      persistent_id: persistentId,
      username: safeUsername,
      image_url: imageUrl,
      caption: typeof caption === "string" ? caption.trim().slice(0, 280) : null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ post: data });
});

app.post("/api/posts/:id/like", requireSupabase, async (req, res) => {
  const { id } = req.params;
  const { persistentId } = req.body || {};

  if (typeof persistentId !== "string" || persistentId.length < 8) {
    return res.status(400).json({ error: "invalid_persistent_id" });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("posts")
    .select("likes")
    .eq("id", id)
    .single();

  if (fetchError || !existing) return res.status(404).json({ error: "not_found" });

  const currentLikes = existing.likes || [];
  const alreadyLiked = currentLikes.includes(persistentId);
  const nextLikes = alreadyLiked
    ? currentLikes.filter((pid) => pid !== persistentId)
    : [...currentLikes, persistentId];

  const { data, error } = await supabase
    .from("posts")
    .update({ likes: nextLikes })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ post: data, liked: !alreadyLiked });
});

// ---------------------------------------------------------------------
// Profiles + Follow
// ---------------------------------------------------------------------
app.get("/api/profiles/:persistentId", requireSupabase, async (req, res) => {
  const { persistentId } = req.params;
  const viewerPersistentId = typeof req.query.viewerId === "string" ? req.query.viewerId : null;

  const [{ data: profile }, { data: posts }, followerCountRes, followingCountRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("persistent_id", persistentId).maybeSingle(),
    supabase
      .from("posts")
      .select("*")
      .eq("persistent_id", persistentId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", persistentId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", persistentId),
  ]);

  let isFollowing = false;
  if (viewerPersistentId && viewerPersistentId !== persistentId) {
    const { data: followRow } = await supabase
      .from("follows")
      .select("*")
      .eq("follower_id", viewerPersistentId)
      .eq("following_id", persistentId)
      .maybeSingle();
    isFollowing = !!followRow;
  }

  res.json({
    profile: {
      persistentId,
      username: profile?.username || posts?.[0]?.username || "Anonymous",
      bio: profile?.bio || "",
      avatarUrl: profile?.avatar_url || null,
    },
    posts: posts || [],
    followerCount: followerCountRes.count || 0,
    followingCount: followingCountRes.count || 0,
    isFollowing,
  });
});

app.post("/api/profiles/me", requireSupabase, async (req, res) => {
  const { persistentId, username, bio, avatarUrl } = req.body || {};

  if (typeof persistentId !== "string" || persistentId.length < 8) {
    return res.status(400).json({ error: "invalid_persistent_id" });
  }

  if (typeof bio === "string" && bio.trim()) {
    const modResult = await moderateMessage(bio.trim());
    if (!modResult.allowed) {
      return res.status(400).json({ error: "moderated", reason: modResult.reason });
    }
  }

  const safeUsername =
    typeof username === "string" && username.trim() ? username.trim().slice(0, 20) : "Anonymous";

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        persistent_id: persistentId,
        username: safeUsername,
        bio: typeof bio === "string" ? bio.trim().slice(0, 160) : null,
        avatar_url: typeof avatarUrl === "string" ? avatarUrl : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "persistent_id" }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile: data });
});

app.post("/api/follow", requireSupabase, async (req, res) => {
  const { persistentId, targetPersistentId } = req.body || {};

  if (typeof persistentId !== "string" || persistentId.length < 8) {
    return res.status(400).json({ error: "invalid_persistent_id" });
  }
  if (typeof targetPersistentId !== "string" || targetPersistentId.length < 8) {
    return res.status(400).json({ error: "invalid_target" });
  }
  if (persistentId === targetPersistentId) {
    return res.status(400).json({ error: "cannot_follow_self" });
  }

  const { data: existing } = await supabase
    .from("follows")
    .select("*")
    .eq("follower_id", persistentId)
    .eq("following_id", targetPersistentId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", persistentId)
      .eq("following_id", targetPersistentId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ following: false });
  }

  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: persistentId, following_id: targetPersistentId });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ following: true });
});

// ---------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------
app.get("/api/posts/:id/comments", requireSupabase, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ comments: data });
});

app.post("/api/posts/:id/comments", requireSupabase, async (req, res) => {
  const { id } = req.params;
  const { persistentId, username, text } = req.body || {};

  if (typeof persistentId !== "string" || persistentId.length < 8) {
    return res.status(400).json({ error: "invalid_persistent_id" });
  }
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "empty_comment" });
  }
  if (text.trim().length > 280) {
    return res.status(400).json({ error: "too_long" });
  }

  const modResult = await moderateMessage(text.trim());
  if (!modResult.allowed) {
    return res.status(400).json({ error: "moderated", reason: modResult.reason });
  }

  const safeUsername =
    typeof username === "string" && username.trim() ? username.trim().slice(0, 20) : "Anonymous";

  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: id,
      persistent_id: persistentId,
      username: safeUsername,
      text: text.trim(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ comment: data });
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "5minchat-backend" });
});

// Simple health/status endpoint - handy for confirming Render deploy is live
// and for an uptime pinger (see README re: free-tier cold starts).
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    waitingUsers: waitingQueue.length,
    activeRooms: rooms.size,
    uptimeSeconds: process.uptime(),
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

// ---------------------------------------------------------------------
// In-memory state (fine for a single free-tier instance / MVP scope).
// Nothing here is written to a database or log file - it lives only in
// process memory and disappears when a room closes or the process
// restarts, matching the "no permanent chat history" product rule.
// ---------------------------------------------------------------------
let waitingQueue = []; // [{ socketId, joinedAt }]
const rooms = new Map(); // roomId -> room object
const socketToRoom = new Map(); // socketId -> roomId
const anonNames = new Map(); // socketId -> display name
const messageTimestamps = new Map(); // socketId -> [timestamps]
const recentPairs = new Map(); // "idA|idB" -> timestamp of last match
const blockedBy = new Map(); // socketId -> Set of socketIds they've blocked

// ---------------------------------------------------------------------
// Friends feature state.
// A "persistentId" is a random UUID the client generates and stores in
// its own localStorage - NOT an account, no password, no email. It just
// lets the *same browser* be recognized across visits so a friendship
// (which by definition needs to survive beyond one 5-minute session) has
// something to attach to. Losing localStorage (clearing site data, new
// device/browser) means losing your friend list - that's an intentional
// trade-off to avoid building a full account system.
//
// NOTE: like the rest of this MVP, this is in-memory only - it resets if
// the server restarts. Fine for launch; move to a real database (with a
// migration plan) before relying on friend lists sticking around.
// ---------------------------------------------------------------------
const friendsOf = new Map(); // persistentId -> Set of persistentIds
const usernameOf = new Map(); // persistentId -> last-known display name
const persistentToSocket = new Map(); // persistentId -> socketId (only while online)
const socketToPersistent = new Map(); // socketId -> persistentId
const lastFriendRequestAt = new Map(); // persistentId -> timestamp (anti-spam)
const pendingFriendRequestKey = new Map(); // roomId -> requester persistentId (one request per room)

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const ADJECTIVES = [
  "Blue", "Crimson", "Silent", "Wandering", "Curious", "Gentle", "Bright",
  "Hidden", "Lucky", "Quiet", "Bold", "Amber", "Cosmic", "Lone", "Swift",
];
const ANIMALS = [
  "Fox", "Owl", "Wolf", "Falcon", "Panda", "Otter", "Raven", "Lynx",
  "Sparrow", "Tiger", "Heron", "Comet", "Badger", "Dolphin",
];

function generateAnonName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${a}${b}${n}`;
}

function pairKey(idA, idB) {
  return [idA, idB].sort().join("|");
}

function wasRecentlyPaired(idA, idB) {
  const key = pairKey(idA, idB);
  const last = recentPairs.get(key);
  if (!last) return false;
  return Date.now() - last < REMATCH_COOLDOWN_MS;
}

function isBlockedPair(idA, idB) {
  return (
    blockedBy.get(idA)?.has(idB) || blockedBy.get(idB)?.has(idA)
  );
}

function removeFromQueue(socketId) {
  waitingQueue = waitingQueue.filter((entry) => entry.socketId !== socketId);
}

function checkRateLimit(socketId) {
  const now = Date.now();
  const stamps = (messageTimestamps.get(socketId) || []).filter(
    (t) => now - t < MESSAGE_RATE_WINDOW_MS
  );
  stamps.push(now);
  messageTimestamps.set(socketId, stamps);
  return stamps.length <= MESSAGE_RATE_MAX;
}

/**
 * Attempts to pair up waiting users. Called whenever someone joins the
 * queue or the queue changes. Skips pairs that were recently matched or
 * have blocked each other.
 */
function tryMatch() {
  // Simple O(n^2) scan - the queue is expected to stay small; fine for MVP.
  for (let i = 0; i < waitingQueue.length; i++) {
    for (let j = i + 1; j < waitingQueue.length; j++) {
      const a = waitingQueue[i];
      const b = waitingQueue[j];

      const socketA = io.sockets.sockets.get(a.socketId);
      const socketB = io.sockets.sockets.get(b.socketId);

      // Drop stale entries for sockets that disconnected without cleanup.
      if (!socketA) { waitingQueue.splice(i, 1); i--; continue; }
      if (!socketB) { waitingQueue.splice(j, 1); j--; continue; }

      if (isBlockedPair(a.socketId, b.socketId)) continue;
      if (wasRecentlyPaired(a.socketId, b.socketId)) continue;

      // Match found - remove both from queue and create a room.
      waitingQueue = waitingQueue.filter(
        (e) => e.socketId !== a.socketId && e.socketId !== b.socketId
      );
      createRoom(a.socketId, b.socketId);
      return tryMatch(); // keep matching remaining queue
    }
  }
}

function createRoom(idA, idB) {
  const roomId = randomUUID();
  const startTime = Date.now();
  const endTime = startTime + SESSION_DURATION_MS;

  const room = {
    id: roomId,
    users: [idA, idB],
    startTime,
    endTime,
    status: "active",
    timer: null,
  };

  rooms.set(roomId, room);
  socketToRoom.set(idA, roomId);
  socketToRoom.set(idB, roomId);
  recentPairs.set(pairKey(idA, idB), Date.now());

  [idA, idB].forEach((id) => {
    const sock = io.sockets.sockets.get(id);
    if (sock) sock.join(roomId);
  });

  const payload = {
    roomId,
    startTime,
    endTime,
    durationMs: SESSION_DURATION_MS,
  };

  io.to(idA).emit("match_found", {
    ...payload,
    yourName: anonNames.get(idA),
    partnerName: anonNames.get(idB),
    // Ephemeral, random-per-connection id - used client-side only as a
    // handle for block/report. Not a persistent identity, IP, or account id.
    partnerSocketId: idB,
  });
  io.to(idB).emit("match_found", {
    ...payload,
    yourName: anonNames.get(idB),
    partnerName: anonNames.get(idA),
    partnerSocketId: idA,
  });

  // Reset the one-friend-request-per-conversation guard for this room.
  pendingFriendRequestKey.delete(roomId);

  // Server-authoritative expiry - the browser's countdown is cosmetic only.
  room.timer = setTimeout(() => expireRoom(roomId, "timeout"), SESSION_DURATION_MS);
}

function expireRoom(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room || room.status !== "active") return;

  room.status = "closed";
  if (room.timer) clearTimeout(room.timer);

  io.to(roomId).emit("session_expired", { roomId, reason });

  room.users.forEach((id) => socketToRoom.delete(id));
  rooms.delete(roomId); // ephemeral - transcript never touched a database
}

function leaveRoomEarly(socketId, reason) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room || room.status !== "active") return;

  const partnerId = room.users.find((id) => id !== socketId);
  room.status = "closed";
  if (room.timer) clearTimeout(room.timer);

  io.to(roomId).emit("session_expired", { roomId, reason });

  room.users.forEach((id) => socketToRoom.delete(id));
  rooms.delete(roomId);

  return partnerId;
}

// ---------------------------------------------------------------------
// Socket.IO events
// ---------------------------------------------------------------------
io.on("connection", (socket) => {
  const anonName = generateAnonName();
  anonNames.set(socket.id, anonName);
  socket.emit("connected", { anonName, socketId: socket.id });

  // ---------------- Identity (persistentId) + custom username ----------
  // The client sends this right after connecting. persistentId is a
  // client-generated UUID stored in localStorage - it's how "friends"
  // persist across sessions without a real account system.
  socket.on("identify", ({ persistentId, username } = {}, ack) => {
    if (typeof persistentId !== "string" || persistentId.length < 8 || persistentId.length > 100) {
      return ack?.({ ok: false, error: "invalid_persistent_id" });
    }

    socketToPersistent.set(socket.id, persistentId);
    persistentToSocket.set(persistentId, socket.id);

    let finalName = anonNames.get(socket.id);
    let usernameRejectedReason = null;

    if (typeof username === "string" && username.trim().length > 0) {
      const result = moderateUsername(username);
      if (result.allowed) {
        finalName = username.trim();
        anonNames.set(socket.id, finalName);
      } else {
        usernameRejectedReason = result.reason;
      }
    }

    usernameOf.set(persistentId, finalName);
    ack?.({ ok: true, appliedName: finalName, usernameRejectedReason });
  });

  socket.on("find_match", () => {
    // Guard against duplicate queue entries / already in a room.
    if (socketToRoom.has(socket.id)) return;
    if (waitingQueue.some((e) => e.socketId === socket.id)) return;

    waitingQueue.push({ socketId: socket.id, joinedAt: Date.now() });
    socket.emit("queue_joined");
    tryMatch();
  });

  socket.on("cancel_match", () => {
    removeFromQueue(socket.id);
    socket.emit("queue_left");
  });

  socket.on("send_message", async (data, ack) => {
    const roomId = socketToRoom.get(socket.id);
    const room = roomId && rooms.get(roomId);

    if (!room || room.status !== "active") {
      return ack?.({ ok: false, error: "no_active_session" });
    }
    if (Date.now() > room.endTime) {
      return ack?.({ ok: false, error: "session_expired" });
    }
    if (!room.users.includes(socket.id)) {
      return ack?.({ ok: false, error: "not_a_member" }); // authorization check
    }

    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (!text) return ack?.({ ok: false, error: "empty" });
    if (text.length > MAX_MESSAGE_LENGTH) {
      return ack?.({ ok: false, error: "too_long" });
    }
    if (!checkRateLimit(socket.id)) {
      return ack?.({ ok: false, error: "rate_limited" });
    }

    const result = await moderateMessage(text);
    if (!result.allowed) {
      socket.emit("moderation_blocked", { reason: result.reason });
      return ack?.({ ok: false, error: "moderated", reason: result.reason });
    }

    const messageId = randomUUID();
    io.to(roomId).emit("message_received", {
      id: messageId,
      senderId: socket.id,
      senderName: anonNames.get(socket.id),
      text,
      sentAt: Date.now(),
    });
    ack?.({ ok: true, id: messageId });
    // Note: message content is relayed only - never written to a log,
    // database, or file, matching the "no message content in logs" rule.
  });

  socket.on("typing", (isTyping) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit("partner_typing", { isTyping: !!isTyping });
  });

  socket.on("leave_chat", () => {
    const partnerId = leaveRoomEarly(socket.id, "left");
    if (partnerId) {
      io.to(partnerId).emit("partner_left");
    }
  });

  socket.on("block", ({ targetSocketId } = {}) => {
    if (!targetSocketId) return;
    if (!blockedBy.has(socket.id)) blockedBy.set(socket.id, new Set());
    blockedBy.get(socket.id).add(targetSocketId);

    const partnerId = leaveRoomEarly(socket.id, "blocked");
    if (partnerId) io.to(partnerId).emit("partner_left");
  });

  socket.on("report", ({ targetSocketId, category, reason } = {}) => {
    // MVP: log to server console only (operator visibility), never to a
    // transcript store. Wire this to a real Report table (see plan
    // section 9 "Report") once you add a database.
    console.log(
      `[report] from=${socket.id} target=${targetSocketId || "unknown"} category=${category || "other"} reasonProvided=${!!reason}`
    );
    socket.emit("report_received");
  });

  // ---------------- Friends: mutual opt-in only ----------------------
  // Either person can send a request; the other person must explicitly
  // accept before anything is saved. One request per conversation to
  // discourage spamming requests at strangers who've said no.
  socket.on("send_friend_request", (_data, ack) => {
    const roomId = socketToRoom.get(socket.id);
    const room = roomId && rooms.get(roomId);
    if (!room || room.status !== "active") {
      return ack?.({ ok: false, error: "no_active_session" });
    }

    const myPersistentId = socketToPersistent.get(socket.id);
    if (!myPersistentId) return ack?.({ ok: false, error: "not_identified" });

    if (pendingFriendRequestKey.has(roomId)) {
      return ack?.({ ok: false, error: "already_requested_this_conversation" });
    }

    const lastSent = lastFriendRequestAt.get(myPersistentId) || 0;
    if (Date.now() - lastSent < FRIEND_REQUEST_COOLDOWN_MS) {
      return ack?.({ ok: false, error: "rate_limited" });
    }

    const partnerId = room.users.find((id) => id !== socket.id);
    if (!partnerId) return ack?.({ ok: false, error: "no_partner" });

    pendingFriendRequestKey.set(roomId, myPersistentId);
    lastFriendRequestAt.set(myPersistentId, Date.now());

    io.to(partnerId).emit("friend_request_received", {
      fromName: anonNames.get(socket.id),
    });
    ack?.({ ok: true });
  });

  socket.on("respond_friend_request", ({ accept } = {}, ack) => {
    const roomId = socketToRoom.get(socket.id);
    const room = roomId && rooms.get(roomId);
    if (!room) return ack?.({ ok: false, error: "no_active_session" });

    const requesterPersistentId = pendingFriendRequestKey.get(roomId);
    if (!requesterPersistentId) return ack?.({ ok: false, error: "no_pending_request" });

    const myPersistentId = socketToPersistent.get(socket.id);
    const requesterSocketId = persistentToSocket.get(requesterPersistentId);

    if (accept && myPersistentId && requesterSocketId) {
      if (!friendsOf.has(myPersistentId)) friendsOf.set(myPersistentId, new Set());
      if (!friendsOf.has(requesterPersistentId)) friendsOf.set(requesterPersistentId, new Set());

      if (friendsOf.get(myPersistentId).size < MAX_FRIENDS) {
        friendsOf.get(myPersistentId).add(requesterPersistentId);
      }
      if (friendsOf.get(requesterPersistentId).size < MAX_FRIENDS) {
        friendsOf.get(requesterPersistentId).add(myPersistentId);
      }

      usernameOf.set(myPersistentId, anonNames.get(socket.id));
      io.to(requesterSocketId).emit("friend_request_result", { accepted: true });
    } else if (requesterSocketId) {
      io.to(requesterSocketId).emit("friend_request_result", { accepted: false });
    }

    pendingFriendRequestKey.delete(roomId);
    ack?.({ ok: true });
  });

  socket.on("get_friends", (_data, ack) => {
    const myPersistentId = socketToPersistent.get(socket.id);
    if (!myPersistentId) return ack?.({ ok: false, error: "not_identified", friends: [] });

    const friendIds = Array.from(friendsOf.get(myPersistentId) || []);
    const friends = friendIds.map((fid) => ({
      persistentId: fid,
      username: usernameOf.get(fid) || "Unknown",
      online: persistentToSocket.has(fid),
    }));
    ack?.({ ok: true, friends });
  });

  // Direct-connect with a specific friend (skips the random queue). Still
  // goes through the normal 5-minute room/timer/moderation pipeline - this
  // is not a persistent unmoderated DM channel, just a way to re-match a
  // specific person for another timed session.
  socket.on("start_friend_chat", ({ friendPersistentId } = {}, ack) => {
    const myPersistentId = socketToPersistent.get(socket.id);
    if (!myPersistentId) return ack?.({ ok: false, error: "not_identified" });
    if (!friendsOf.get(myPersistentId)?.has(friendPersistentId)) {
      return ack?.({ ok: false, error: "not_friends" });
    }
    if (socketToRoom.has(socket.id)) return ack?.({ ok: false, error: "already_in_session" });

    const friendSocketId = persistentToSocket.get(friendPersistentId);
    if (!friendSocketId || !io.sockets.sockets.get(friendSocketId)) {
      return ack?.({ ok: false, error: "friend_offline" });
    }
    if (socketToRoom.has(friendSocketId)) {
      return ack?.({ ok: false, error: "friend_busy" });
    }
    if (isBlockedPair(socket.id, friendSocketId)) {
      return ack?.({ ok: false, error: "blocked" });
    }

    removeFromQueue(socket.id);
    removeFromQueue(friendSocketId);
    createRoom(socket.id, friendSocketId);
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    const partnerId = leaveRoomEarly(socket.id, "disconnected");
    if (partnerId) io.to(partnerId).emit("partner_left");

    anonNames.delete(socket.id);
    messageTimestamps.delete(socket.id);
    blockedBy.delete(socket.id);

    const myPersistentId = socketToPersistent.get(socket.id);
    if (myPersistentId) persistentToSocket.delete(myPersistentId);
    socketToPersistent.delete(socket.id);
  });
});

// Periodic safety-net sweep: closes any room whose endTime has passed but
// whose setTimeout somehow didn't fire (e.g. process was briefly under
// heavy load). Cheap insurance on top of the per-room timer.
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.status === "active" && now > room.endTime) {
      expireRoom(roomId, "timeout");
    }
  }
  // Drop queue entries with dead sockets.
  waitingQueue = waitingQueue.filter((e) => io.sockets.sockets.has(e.socketId));
}, 15_000);

server.listen(PORT, () => {
  console.log(`5minchat backend listening on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
