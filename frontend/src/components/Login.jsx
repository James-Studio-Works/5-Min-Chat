import { useState } from "react";
import { supabase, isAuthConfigured } from "../supabaseClient.js";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | sent
  const [error, setError] = useState(null);

  if (!isAuthConfigured) {
    return (
      <div className="login-screen">
        <div className="login-inner">
          <p className="eyebrow">💬 5minchat</p>
          <h2>Login isn't set up yet</h2>
          <p className="lede small">
            The person running this app needs to configure Supabase Auth
            (Google + email login) — see the README for setup steps.
          </p>
        </div>
      </div>
    );
  }

  async function handleGoogleLogin() {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setError(null);
    setStatus("loading");

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setStatus("idle");
        return;
      }
      // onAuthStateChange in App.jsx picks up the new session automatically
      setStatus("idle");
    }
  }

  return (
    <div className="login-screen">
      <div className="login-inner">
        <p className="eyebrow">💬 5minchat</p>
        <h2>{mode === "signup" ? "Create an account" : "Log in"}</h2>
        <p className="lede small">
          Needed for the Feed, posting, and your profile. The 5-Minute Chat
          doesn't require this — it stays fully anonymous.
        </p>

        <button className="btn-primary google-btn" onClick={handleGoogleLogin}>
          Continue with Google
        </button>

        <div className="login-divider">
          <span>or</span>
        </div>

        {status === "sent" ? (
          <p className="lede small">
            Check your email for a confirmation link, then come back and log in.
          </p>
        ) : (
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
            {error && <p className="error-text small">{error}</p>}
            <button type="submit" className="btn-primary" disabled={status === "loading"}>
              {status === "loading"
                ? "Please wait…"
                : mode === "signup"
                ? "Sign Up"
                : "Log In"}
            </button>
          </form>
        )}

        <button
          className="friends-link"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
        >
          {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}
