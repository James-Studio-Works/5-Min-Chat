# 5minchat

Anonymous 5-minute stranger chat, plus a full social layer (Feed, Post,
Profile with Google/email login) built on top. Backend on Render, frontend
on Vercel, database on Supabase, images on Cloudinary.

## Project structure

```
5minchat/
  backend/     Node + Express + Socket.IO -> Render
  frontend/    React + Vite -> Vercel
```

## Local development

```bash
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev
```

## Required external services (all free tier)

- **Supabase** - Postgres database + Auth (Google/email login)
- **Cloudinary** - image hosting for posts and avatars

## Database setup

Run this in Supabase → SQL Editor. If you already have some of these
tables from an earlier setup, only run the parts you're missing (Postgres
will error on `create table` if the table already exists).

```sql
create table posts (
  id uuid primary key default gen_random_uuid(),
  persistent_id text not null,
  username text not null,
  image_url text not null,
  caption text,
  likes text[] default '{}',
  created_at timestamptz default now()
);

create table profiles (
  persistent_id text primary key,
  username text not null,
  handle text unique,
  bio text,
  avatar_url text,
  updated_at timestamptz default now()
);

create table follows (
  follower_id text not null,
  following_id text not null,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  persistent_id text not null,
  username text not null,
  text text not null,
  created_at timestamptz default now()
);
```

**If you already have a `profiles` table without the `handle` column**
(i.e. you set this up before the @handle feature existed), just run this
instead of the full block above:

```sql
alter table profiles add column handle text unique;
```

**New for the expanded Settings feature** (private accounts + blocking) -
run this too if your tables predate it:

```sql
alter table profiles add column is_private boolean default false;

create table blocks (
  blocker_id text not null,
  blocked_id text not null,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);
```

## Backend env vars (Render)

| Variable | Value |
|---|---|
| `FRONTEND_URL` | comma-separated list of your frontend URLs, e.g. `https://5minchat.online,https://your-app.vercel.app` |
| `SUPABASE_URL` | Project URL from Supabase → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | **Secret key** (service_role) from the same page - never the publishable key |

## Frontend env vars (Vercel)

| Variable | Value |
|---|---|
| `VITE_BACKEND_URL` | your Render backend URL, no trailing slash |
| `VITE_SUPABASE_URL` | same Project URL as above |
| `VITE_SUPABASE_ANON_KEY` | **Publishable key** from Supabase - never the secret key |
| `VITE_CLOUDINARY_CLOUD_NAME` | from your Cloudinary dashboard |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | an **unsigned** upload preset you create in Cloudinary → Settings → Upload |

Remember: Vite bakes env vars in at build time, so any change to these
requires a redeploy, not just a save.

## Enabling Google login

1. Google Cloud Console → create OAuth credentials (Web application).
2. Authorized redirect URI: copy the exact URL Supabase shows you at
   Authentication → Providers → Google (looks like
   `https://your-project-ref.supabase.co/auth/v1/callback`).
3. Paste the resulting Client ID + Secret into Supabase → Authentication →
   Providers → Google → enable → Save.
4. Supabase → Authentication → URL Configuration → make sure your real
   site URL (e.g. `https://5minchat.online`) is set as the **Site URL**
   and is also listed under **Redirect URLs**. This is the #1 cause of
   "login works but redirects to localhost" bugs.

Email/password login works with zero extra setup once Supabase Auth is
enabled (which it is by default).

## Feature overview

- **Chat tab** - fully anonymous, no login, server-enforced 5-minute
  timer, profanity + personal-info filtering, report/block/leave, mutual
  opt-in friend requests, "My Friends" list to reconnect with someone
  later, client-side-only "Save Chat" download (nothing stored server-side).
- **Feed / Post / Profile tabs** - require login (Google or email).
  Real backend auth verification (`requireAuth` in `server.js`) means
  nobody can post, like, follow, or comment while pretending to be someone
  else - the backend checks the actual Supabase session token, not just
  whatever ID the client claims to be.
- **Profiles** - avatar, bio, and a unique `@handle` (like Instagram's
  `@username`) with live availability checking as you type. Handles are
  lowercase, 3-20 characters, letters/numbers/underscore only, must start
  with a letter, and are enforced unique at the database level (with a
  race-condition-safe fallback check on save).
- **Follow / Comments / Likes** - straightforward, all moderated through
  the same profanity/personal-info filter used in chat.
- **Settings** - reachable via the gear icon on your own profile.
  - Light/dark theme toggle (persisted)
  - **Privacy**: private account toggle (in Edit Profile) hides your posts
    from everyone except approved followers; a Blocked Accounts list lets
    you review and unblock anyone you've blocked
  - **Block/Unblock**: available on anyone else's profile. Blocking
    removes any existing follow relationship both ways and hides each
    other's posts/profile content
  - **Delete Account**: permanently removes your posts, profile, follows,
    blocks, and login - requires typing "DELETE" to confirm since it's
    irreversible. The anonymous chat feature is completely unaffected
    since it was never tied to an account in the first place.

## Known trade-offs worth knowing about

- **Image content is not moderated** - captions and bios are, but the
  actual photos aren't run through any classifier. Fine for a small early
  launch; a real gap to close before wide public traffic.
- **In-memory chat state** - the anonymous chat/friends system lives in
  the Node process's memory, not a database. This is intentional (nothing
  about anonymous chats is meant to persist), but it also means chat
  friend lists reset if the Render service restarts, and can't be
  horizontally scaled past one instance without adding Redis.
- **Default Supabase email sending is rate-limited** - fine for testing
  and early users; add a custom SMTP provider in Supabase's Auth settings
  before expecting real signup volume.
