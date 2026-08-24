import { useEffect, useRef, useState } from "react";
import {
  clearGoogleUser,
  getGoogleClientId,
  getGoogleUser,
  handleGoogleCredential,
} from "../auth.js";

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

export default function GoogleLogin() {
  const buttonRef = useRef(null);
  const [user, setUser] = useState(getGoogleUser);
  const [error, setError] = useState("");

  useEffect(() => {
    const onLogin = (event) => setUser(event.detail);
    window.addEventListener("5minchat-google-login", onLogin);
    return () => window.removeEventListener("5minchat-google-login", onLogin);
  }, []);

  useEffect(() => {
    if (user) return;

    const clientId = getGoogleClientId();
    if (!clientId) {
      setError("Add VITE_GOOGLE_CLIENT_ID to enable Google login.");
      return;
    }

    const renderButton = () => {
      if (!window.google?.accounts?.id || !buttonRef.current) return;
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          try {
            setError("");
            setUser(handleGoogleCredential(response));
          } catch (err) {
            setError(err?.message || "Google sign-in failed.");
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
      });
    };

    if (window.google?.accounts?.id) {
      renderButton();
      return;
    }

    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", renderButton);
      return () => existing.removeEventListener("load", renderButton);
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = renderButton;
    script.onerror = () => setError("Could not load Google login.");
    document.head.appendChild(script);
  }, [user]);

  if (user) {
    return (
      <div className="google-login-wrap">
        <div className="google-user">
          {user.picture ? (
            <img src={user.picture} alt="" />
          ) : (
            <span className="google-user-fallback">G</span>
          )}
          <span className="google-user-name">{user.name}</span>
          <button
            className="google-logout"
            onClick={() => {
              clearGoogleUser();
              setUser(null);
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="google-login-wrap">
      <div ref={buttonRef} />
      {error && <span className="google-login-error">{error}</span>}
    </div>
  );
}
