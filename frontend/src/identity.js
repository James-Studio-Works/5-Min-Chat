export const PERSISTENT_ID_KEY = "5minchat_persistent_id";
export const USERNAME_KEY = "5minchat_username";

export function getOrCreatePersistentId() {
  let id = localStorage.getItem(PERSISTENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PERSISTENT_ID_KEY, id);
  }
  return id;
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY) || "";
}

export function getDisplayName() {
  return getUsername().trim() || "Anonymous";
}
