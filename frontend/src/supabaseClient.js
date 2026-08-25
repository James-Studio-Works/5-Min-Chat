import { createClient } from "@supabase/supabase-js";

// Public anon key - safe to expose in frontend code. This client is used
// ONLY for authentication (login/signup/session management), never for
// direct database access - all actual data reads/writes go through the
// backend API, which verifies the user's identity server-side before
// touching the database. See backend/server.js's requireAuth middleware.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const isAuthConfigured = !!supabase;
