const GOOGLE_USER_KEY = "5minchat_google_user";

export function getGoogleUser() {
  try {
    return JSON.parse(localStorage.getItem(GOOGLE_USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function clearGoogleUser() {
  localStorage.removeItem(GOOGLE_USER_KEY);
}

function decodeJwtPayload(token) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Invalid Google credential.");
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(json);
}

export function handleGoogleCredential(response) {
  if (!response?.credential) throw new Error("Google did not return a credential.");
  const payload = decodeJwtPayload(response.credential);
  const user = {
    id: payload.sub,
    name: payload.name || "Google user",
    email: payload.email || "",
    picture: payload.picture || "",
  };
  localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent("5minchat-google-login", { detail: user }));
  return user;
}

export function getGoogleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
}
