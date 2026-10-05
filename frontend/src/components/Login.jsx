import { useState } from "react";
import { supabase, isAuthConfigured } from "../supabaseClient.js";
import { ChatIcon, GoogleIcon } from "../icons/Icons.jsx";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--dusk, #fff)",
  border: "1.5px solid var(--border, #e6e8ee)",
  borderRadius: 10,
  padding: "13px 15px",
  color: "var(--paper, #16181d)",
  fontSize: 15,
  fontFamily: "inherit",
  outline: "none",
};

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!isAuthConfigured) {
    return (
      <div style={screenStyle}>
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 800 }}>Login isn't set up yet</h2>
          <p style={{ color: "var(--ash, #7d8299)", fontSize: 14, lineHeight: 1.5 }}>
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
    <div style={screenStyle}>
      <div style={cardStyle}>
        <p
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 15,
            color: "var(--signal, #4f6ef7)",
            fontWeight: 800,
            margin: "0 0 16px",
          }}
        >
          <ChatIcon size={20} /> 5minchat
        </p>

        <h2
          style={{
            fontFamily: "var(--font-display, inherit)",
            fontSize: 26,
            fontWeight: 800,
            margin: "0 0 10px",
            lineHeight: 1.2,
            color: "var(--paper, #16181d)",
          }}
        >
          Log in to continue
        </h2>

        <p
          style={{
            color: "var(--ash, #7d8299)",
            fontSize: 14,
            lineHeight: 1.5,
            margin: "0 0 24px",
          }}
        >
          Feed, posting, and profiles need an account. The 5-min chat tab
          stays fully anonymous either way.
        </p>

        <button
          className="btn-secondary"
          onClick={handleGoogle}
          style={{
            width: "100%",
            justifyContent: "center",
            padding: "12px 20px",
            fontSize: 15,
            marginBottom: 4,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <GoogleIcon size={18} /> Continue with Google
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "var(--ash, #7d8299)",
            fontSize: 13,
            fontWeight: 600,
            margin: "18px 0",
          }}
        >
          <span style={{ flex: 1, height: 1, background: "var(--border, #e6e8ee)" }} />
          or
          <span style={{ flex: 1, height: 1, background: "var(--border, #e6e8ee)" }} />
        </div>

        <form
          onSubmit={handleEmailSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "100%",
            textAlign: "left",
          }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            style={inputStyle}
          />
          {error && (
            <p style={{ color: "var(--danger, #f0455c)", fontSize: 13, fontWeight: 600, margin: 0 }}>
              {error}
            </p>
          )}
          {info && (
            <p style={{ color: "var(--ash, #7d8299)", fontSize: 13, margin: 0 }}>{info}</p>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={busy}
            style={{ width: "100%", marginTop: 4, padding: "13px 20px" }}
          >
            {busy ? "Please wait…" : mode === "signup" ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
            setInfo(null);
          }}
          style={{
            marginTop: 20,
            background: "none",
            border: "none",
            color: "var(--ash, #7d8299)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}

const screenStyle = {
  minHeight: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px 40px",
  boxSizing: "border-box",
};

const cardStyle = {
  width: "100%",
  maxWidth: 400,
  textAlign: "center",
  margin: "0 auto",
};
