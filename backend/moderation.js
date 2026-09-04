/**
 * moderation.js
 * -----------------------------------------------------------------------
 * Level 1 (profanity) + Level 2 (obfuscation detection) moderation.
 *
 * IMPORTANT per the project's own design doc: a static word list can NEVER
 * safely cover hate speech, threats, harassment, sexual exploitation, or
 * doxxing attempts. Those require a real semantic/classifier-based
 * moderation service (Level 3).
 * -----------------------------------------------------------------------
 */

const BLOCKED_WORDS = [
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "pussy",
  "cunt", "whore", "slut", "cock", "faggot", "retard", "nigger",
];

const LEET_MAP = {
  "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g",
};

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_REGEX = /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/;
const SOCIAL_HANDLE_REGEX = /(instagram|insta|snap(chat)?|whats?app|telegram|kik|discord)\s*[:@]?\s*[\w.]{2,}/i;

function normalizeText(raw) {
  let text = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  text = text
    .split("")
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join("");

  text = text.replace(/([a-z])[\s._*\-]+(?=[a-z])/g, "$1");
  text = text.replace(/([a-z])\1{2,}/g, "$1");

  return text;
}

function containsBlockedWord(normalized) {
  return BLOCKED_WORDS.some((word) => normalized.includes(word));
}

function containsPersonalInfoRequest(raw) {
  return (
    EMAIL_REGEX.test(raw) ||
    PHONE_REGEX.test(raw) ||
    SOCIAL_HANDLE_REGEX.test(raw)
  );
}

async function moderateWithExternalAPI(_text) {
  if (!process.env.MODERATION_PROVIDER_KEY) return { flagged: false };
  return { flagged: false };
}

async function moderateMessage(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { allowed: false, reason: "empty" };
  }

  const normalized = normalizeText(raw);

  if (containsBlockedWord(normalized)) {
    return { allowed: false, reason: "profanity" };
  }

  if (containsPersonalInfoRequest(raw)) {
    return { allowed: false, reason: "personal_info" };
  }

  const external = await moderateWithExternalAPI(raw);
  if (external.flagged) {
    return { allowed: false, reason: "flagged" };
  }

  return { allowed: true, reason: null };
}

/**
 * Username validation - stricter charset + length limits since usernames
 * are shown persistently.
 */
function moderateUsername(raw) {
  if (typeof raw !== "string") return { allowed: false, reason: "invalid" };
  const trimmed = raw.trim();

  if (trimmed.length < 2) return { allowed: false, reason: "too_short" };
  if (trimmed.length > 20) return { allowed: false, reason: "too_long" };

  if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
    return { allowed: false, reason: "invalid_characters" };
  }

  const normalized = normalizeText(trimmed);
  if (containsBlockedWord(normalized)) {
    return { allowed: false, reason: "profanity" };
  }

  const impersonationTerms = ["admin", "moderator", "support", "5minchat", "official"];
  if (impersonationTerms.some((term) => normalized.includes(term))) {
    return { allowed: false, reason: "impersonation" };
  }

  return { allowed: true, reason: null };
}

/**
 * @handle validation - like Instagram/X/@usernames. Stricter than a
 * display name: lowercase-only, no spaces, safe for use in a URL, and
 * must be globally unique (uniqueness is enforced by the database, not
 * here - this function only checks format and content).
 */
function moderateHandle(raw) {
  if (typeof raw !== "string") return { allowed: false, reason: "invalid" };
  const trimmed = raw.trim().toLowerCase();

  if (trimmed.length < 3) return { allowed: false, reason: "too_short" };
  if (trimmed.length > 20) return { allowed: false, reason: "too_long" };

  // Letters, numbers, underscores only - no spaces, dots, or symbols, so
  // it's safe to show as "@handle" and safe to put in a URL later.
  if (!/^[a-z0-9_]+$/.test(trimmed)) {
    return { allowed: false, reason: "invalid_characters" };
  }
  // Must start with a letter so it can't be confused with a number/ID.
  if (!/^[a-z]/.test(trimmed)) {
    return { allowed: false, reason: "must_start_with_letter" };
  }

  const normalized = normalizeText(trimmed);
  if (containsBlockedWord(normalized)) {
    return { allowed: false, reason: "profanity" };
  }

  const impersonationTerms = ["admin", "moderator", "support", "5minchat", "official", "help", "root"];
  if (impersonationTerms.some((term) => normalized.includes(term))) {
    return { allowed: false, reason: "impersonation" };
  }

  return { allowed: true, reason: null, handle: trimmed };
}

module.exports = { moderateMessage, moderateUsername, moderateHandle, normalizeText };
