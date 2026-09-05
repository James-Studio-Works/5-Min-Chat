require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { moderateMessage, moderateUsername, moderateHandle } = require("./moderation");

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SESSION_DURATION_MS = 5 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 500;
const MESSAGE_RATE_WINDOW_MS = 10_000;
const MESSAGE_RATE_MAX = 8;
const REMATCH_COOLDOWN_MS = 2 * 60 * 1000;
const FRIEND_REQUEST_COOLDOWN_MS = 60 * 1000;
const MAX_FRIENDS = 200;

// ---------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------
const app = express();

const corsOptions = {
  origin: ALLOWED_ORIGINS.includes("*") ? true : ALLOWED_ORIGINS,
  methods: ["GET", "POST", "DELETE"],
};
app.use(cors(corsOptions));
app.use(express.json());

// ---------------------------------------------------------------------
// Feed feature (posts + likes + profiles + follow + comments). Backed by
// Supabase (Postgres) since Render's free-tier disk is wiped on every
// restart/redeploy. If these env vars aren't set, the feed endpoints
// return 503 rather than crashing the server - chat keeps working either way.
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

// Verifies the Supabase session JWT sent by the frontend and attaches the
// real, cryptographically-verified user id to the request. Write routes
// use req.authUser.id instead of trusting any client-supplied id, so
// nobody can post/like/follow/comment while pretending to be someone else.
async function requireAuth(req, res, next) {
  if (!supabase) return res.status(503).json({ error: "feed_not_configured" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "not_authenticated" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: "invalid_session" });

  req.authUser = { id: data.user.id, email: data.user.email };
  next();
}

app.get("/api/posts", requireSupabase, async (req, res) => {
  const viewerId = typeof req.query.viewerId === "string" ? req.query.viewerId : null;

  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  // Hide posts from private accounts unless the viewer follows that
  // account or it's their own post. Two extra lookups, only run when
  // there's actually private-account content in the result set.
  const authorIds = [...new Set((posts || []).map((p) => p.persistent_id))];
  if (authorIds.length === 0) return res.json({ posts: [] });

  const { data: privateProfiles } = await supabase
    .from("profiles")
    .select("persistent_id")
    .in("persistent_id", authorIds)
    .eq("is_private", true);

  const privateIds = new Set((privateProfiles || []).map((p) => p.persistent_id));
  if (privateIds.size === 0) return res.json({ posts });

  let followingIds = new Set();
  if (viewerId) {
    const { data: followRows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId);
    followingIds = new Set((followRows || []).map((f) => f.following_id));
  }

  const visible = posts.filter(
    (p) => !privateIds.has(p.persistent_id) || p.persistent_id === viewerId || followingIds.has(p.persistent_id)
  );
  res.json({ posts: visible });
});

app.post("/api/posts", requireSupabase, requireAuth, async (req, res) => {
  const { username, imageUrl, caption } = req.body || {};
  const persistentId = req.authUser.id;

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

app.post("/api/posts/:id/like", requireSupabase, requireAuth, async (req, res) => {
  const { id } = req.params;
  const persistentId = req.authUser.id;

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
  const isSelf = viewerPersistentId === persistentId;

  const [{ data: profile }, followerCountRes, followingCountRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("persistent_id", persistentId).maybeSingle(),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", persistentId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", persistentId),
  ]);

  let isFollowing = false;
  let isBlocked = false; // true if either side has blocked the other
  if (viewerPersistentId && !isSelf) {
    const [{ data: followRow }, { data: blockRow }] = await Promise.all([
      supabase
        .from("follows")
        .select("*")
        .eq("follower_id", viewerPersistentId)
        .eq("following_id", persistentId)
        .maybeSingle(),
      supabase
        .from("blocks")
        .select("*")
        .or(
          `and(blocker_id.eq.${viewerPersistentId},blocked_id.eq.${persistentId}),and(blocker_id.eq.${persistentId},blocked_id.eq.${viewerPersistentId})`
        )
        .maybeSingle(),
    ]);
    isFollowing = !!followRow;
    isBlocked = !!blockRow;
  }

  const isPrivate = !!profile?.is_private;
  const canSeePosts = isSelf || !isPrivate || isFollowing;

  let posts = [];
  if (canSeePosts && !isBlocked) {
    const { data } = await supabase
      .from("posts")
      .select("*")
      .eq("persistent_id", persistentId)
      .order("created_at", { ascending: false })
      .limit(50);
    posts = data || [];
  }

  res.json({
    profile: {
      persistentId,
      username: profile?.username || "Anonymous",
      handle: profile?.handle || null,
      bio: profile?.bio || "",
      avatarUrl: profile?.avatar_url || null,
      isPrivate,
    },
    posts,
    postsHidden: !canSeePosts,
    isBlocked,
    followerCount: followerCountRes.count || 0,
    followingCount: followingCountRes.count || 0,
    isFollowing,
  });
});

// ---------------------------------------------------------------------
// Block / Unblock
// ---------------------------------------------------------------------
app.post("/api/block", requireSupabase, requireAuth, async (req, res) => {
  const { targetPersistentId } = req.body || {};
  const persistentId = req.authUser.id;

  if (typeof targetPersistentId !== "string" || targetPersistentId.length < 8) {
    return res.status(400).json({ error: "invalid_target" });
  }
  if (persistentId === targetPersistentId) {
    return res.status(400).json({ error: "cannot_block_self" });
  }

  const { data: existing } = await supabase
    .from("blocks")
    .select("*")
    .eq("blocker_id", persistentId)
    .eq("blocked_id", targetPersistentId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", persistentId)
      .eq("blocked_id", targetPersistentId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ blocked: false });
  }

  const { error: insertError } = await supabase
    .from("blocks")
    .insert({ blocker_id: persistentId, blocked_id: targetPersistentId });
  if (insertError) return res.status(500).json({ error: insertError.message });

  // Blocking severs any existing follow relationship in both directions -
  // matches how most social apps behave.
  await supabase
    .from("follows")
    .delete()
    .or(
      `and(follower_id.eq.${persistentId},following_id.eq.${targetPersistentId}),and(follower_id.eq.${targetPersistentId},following_id.eq.${persistentId})`
    );

  res.json({ blocked: true });
});

app.get("/api/blocks", requireSupabase, requireAuth, async (req, res) => {
  const { data: blockRows, error } = await supabase
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", req.authUser.id);

  if (error) return res.status(500).json({ error: error.message });

  const blockedIds = (blockRows || []).map((b) => b.blocked_id);
  if (blockedIds.length === 0) return res.json({ blocked: [] });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("persistent_id, username, handle, avatar_url")
    .in("persistent_id", blockedIds);

  res.json({ blocked: profiles || [] });
});

// Live availability check while someone is typing a handle. Excludes
// their own current handle so re-saving your own unchanged handle doesn't
// falsely show as "taken."
app.get("/api/handles/check", requireSupabase, requireAuth, async (req, res) => {
  const raw = typeof req.query.handle === "string" ? req.query.handle : "";
  const result = moderateHandle(raw);

  if (!result.allowed) {
    return res.json({ available: false, reason: result.reason });
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("persistent_id")
    .eq("handle", result.handle)
    .maybeSingle();

  const takenBySomeoneElse = existing && existing.persistent_id !== req.authUser.id;
  res.json({ available: !takenBySomeoneElse, reason: takenBySomeoneElse ? "taken" : null });
});

app.post("/api/profiles/me", requireSupabase, requireAuth, async (req, res) => {
  const { username, handle, bio, avatarUrl, isPrivate } = req.body || {};
  const persistentId = req.authUser.id;

  if (typeof bio === "string" && bio.trim()) {
    const modResult = await moderateMessage(bio.trim());
    if (!modResult.allowed) {
      return res.status(400).json({ error: "moderated", reason: modResult.reason });
    }
  }

  let safeHandle;
  if (typeof handle === "string" && handle.trim()) {
    const handleResult = moderateHandle(handle);
    if (!handleResult.allowed) {
      return res.status(400).json({ error: "invalid_handle", reason: handleResult.reason });
    }
    const { data: existing } = await supabase
      .from("profiles")
      .select("persistent_id")
      .eq("handle", handleResult.handle)
      .maybeSingle();
    if (existing && existing.persistent_id !== persistentId) {
      return res.status(409).json({ error: "handle_taken" });
    }
    safeHandle = handleResult.handle;
  }

  const safeUsername =
    typeof username === "string" && username.trim() ? username.trim().slice(0, 20) : "Anonymous";

  const upsertRow = {
    persistent_id: persistentId,
    username: safeUsername,
    bio: typeof bio === "string" ? bio.trim().slice(0, 160) : null,
    avatar_url: typeof avatarUrl === "string" ? avatarUrl : null,
    updated_at: new Date().toISOString(),
  };
  if (safeHandle) upsertRow.handle = safeHandle;
  if (typeof isPrivate === "boolean") upsertRow.is_private = isPrivate;

  const { data, error } = await supabase
    .from("profiles")
    .upsert(upsertRow, { onConflict: "persistent_id" })
    .select()
    .single();

  if (error) {
    // Postgres unique-violation code, as a safety net against a race
    // condition between the availability check above and this write.
    if (error.code === "23505") {
      return res.status(409).json({ error: "handle_taken" });
    }
    return res.status(500).json({ error: error.message });
  }
  res.json({ profile: data });
});

app.post("/api/follow", requireSupabase, requireAuth, async (req, res) => {
  const { targetPersistentId } = req.body || {};
  const persistentId = req.authUser.id;

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

app.post("/api/posts/:id/comments", requireSupabase, requireAuth, async (req, res) => {
  const { id } = req.params;
  const { username, text } = req.body || {};
  const persistentId = req.authUser.id;

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

// ---------------------------------------------------------------------
// Account deletion - removes the person's data (posts, profile, follows,
// comments) and then deletes the actual Supabase auth account. Deleting
// the auth account requires the service-role client, which this backend
// already holds (never exposed to the frontend).
// ---------------------------------------------------------------------
app.delete("/api/account", requireSupabase, requireAuth, async (req, res) => {
  const persistentId = req.authUser.id;

  await Promise.all([
    supabase.from("posts").delete().eq("persistent_id", persistentId),
    supabase.from("profiles").delete().eq("persistent_id", persistentId),
    supabase.from("comments").delete().eq("persistent_id", persistentId),
    supabase.from("follows").delete().eq("follower_id", persistentId),
    supabase.from("follows").delete().eq("following_id", persistentId),
    supabase.from("blocks").delete().eq("blocker_id", persistentId),
    supabase.from("blocks").delete().eq("blocked_id", persistentId),
  ]);

  const { error } = await supabase.auth.admin.deleteUser(persistentId);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "5minchat-backend" });
});

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
// In-memory chat state (unaffected by any of the auth/feed work above -
// chat stays fully anonymous, no login required).
// ---------------------------------------------------------------------
let waitingQueue = [];
const rooms = new Map();
const socketToRoom = new Map();
const anonNames = new Map();
const messageTimestamps = new Map();
const recentPairs = new Map();
const blockedBy = new Map();

const friendsOf = new Map();
const usernameOf = new Map();
const persistentToSocket = new Map();
const socketToPersistent = new Map();
const lastFriendRequestAt = new Map();
const pendingFriendRequestKey = new Map();

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
  return blockedBy.get(idA)?.has(idB) || blockedBy.get(idB)?.has(idA);
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

function tryMatch() {
  for (let i = 0; i < waitingQueue.length; i++) {
    for (let j = i + 1; j < waitingQueue.length; j++) {
      const a = waitingQueue[i];
      const b = waitingQueue[j];

      const socketA = io.sockets.sockets.get(a.socketId);
      const socketB = io.sockets.sockets.get(b.socketId);

      if (!socketA) { waitingQueue.splice(i, 1); i--; continue; }
      if (!socketB) { waitingQueue.splice(j, 1); j--; continue; }

      if (isBlockedPair(a.socketId, b.socketId)) continue;
      if (wasRecentlyPaired(a.socketId, b.socketId)) continue;

      waitingQueue = waitingQueue.filter(
        (e) => e.socketId !== a.socketId && e.socketId !== b.socketId
      );
      createRoom(a.socketId, b.socketId);
      return tryMatch();
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

  const payload = { roomId, startTime, endTime, durationMs: SESSION_DURATION_MS };

  io.to(idA).emit("match_found", {
    ...payload,
    yourName: anonNames.get(idA),
    partnerName: anonNames.get(idB),
    partnerSocketId: idB,
  });
  io.to(idB).emit("match_found", {
    ...payload,
    yourName: anonNames.get(idB),
    partnerName: anonNames.get(idA),
    partnerSocketId: idA,
  });

  pendingFriendRequestKey.delete(roomId);

  room.timer = setTimeout(() => expireRoom(roomId, "timeout"), SESSION_DURATION_MS);
}

function expireRoom(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room || room.status !== "active") return;

  room.status = "closed";
  if (room.timer) clearTimeout(room.timer);

  io.to(roomId).emit("session_expired", { roomId, reason });

  room.users.forEach((id) => socketToRoom.delete(id));
  rooms.delete(roomId);
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

io.on("connection", (socket) => {
  const anonName = generateAnonName();
  anonNames.set(socket.id, anonName);
  socket.emit("connected", { anonName, socketId: socket.id });

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
      return ack?.({ ok: false, error: "not_a_member" });
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
  });

  socket.on("typing", (isTyping) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit("partner_typing", { isTyping: !!isTyping });
  });

  socket.on("leave_chat", () => {
    const partnerId = leaveRoomEarly(socket.id, "left");
    if (partnerId) io.to(partnerId).emit("partner_left");
  });

  socket.on("block", ({ targetSocketId } = {}) => {
    if (!targetSocketId) return;
    if (!blockedBy.has(socket.id)) blockedBy.set(socket.id, new Set());
    blockedBy.get(socket.id).add(targetSocketId);

    const partnerId = leaveRoomEarly(socket.id, "blocked");
    if (partnerId) io.to(partnerId).emit("partner_left");
  });

  socket.on("report", ({ targetSocketId, category, reason } = {}) => {
    console.log(
      `[report] from=${socket.id} target=${targetSocketId || "unknown"} category=${category || "other"} reasonProvided=${!!reason}`
    );
    socket.emit("report_received");
  });

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

    io.to(partnerId).emit("friend_request_received", { fromName: anonNames.get(socket.id) });
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

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.status === "active" && now > room.endTime) {
      expireRoom(roomId, "timeout");
    }
  }
  waitingQueue = waitingQueue.filter((e) => io.sockets.sockets.has(e.socketId));
}, 15_000);

server.listen(PORT, () => {
  console.log(`5minchat backend listening on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
