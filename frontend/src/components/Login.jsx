import { useState } from "react";
import { supabase, isAuthConfigured } from "../supabaseClient.js";
import { ChatIcon, GoogleIcon } from "../icons/Icons.jsx";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!isAuthConfigured) {
    return (
      <div className="login-screen">
        <div className="login-inner">
          <h2>Login isn't set up yet</h2>
          <p className="lede">
            The person running this app needs to add Supabase Auth credentials.
            See the README for setup steps.
          </p>
        </div>
      </div>
    );
  }

  async function handleGoogle() {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Account created! Check your email to confirm, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setError(e.message || "Something went wrong - try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-inner">
        <p className="eyebrow">
          <ChatIcon size={20} /> 5minchat
        </p>
        <h2>Log in to continue</h2>
        <p className="lede">
          Feed, posting, and profiles need an account. The 5-min chat tab
          stays fully anonymous either way.
        </p>

        <button className="btn-secondary google-btn" onClick={handleGoogle}>
          <GoogleIcon size={18} /> Continue with Google
        </button>

        <div className="login-divider">or</div>

        <form className="login-form" onSubmit={handleEmailSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          {error && <p className="error-text">{error}</p>}
          {info && <p className="lede small">{info}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <button
          className="friends-link"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}
