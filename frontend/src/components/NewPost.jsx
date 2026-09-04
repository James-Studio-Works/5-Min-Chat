import { useState } from "react";
import { uploadImage } from "../cloudinary.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export default function NewPost({ onPosted, currentUser, accessToken }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (selected.size > 8 * 1024 * 1024) {
      setError("Image is too large - please choose something under 8MB.");
      return;
    }
    setError(null);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return setError("Choose an image first.");

    setError(null);
    setStatus("uploading");
    try {
      const imageUrl = await uploadImage(file);

      setStatus("posting");
      const res = await fetch(`${BACKEND_URL}/api/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          username: currentUser?.user_metadata?.full_name || currentUser?.email?.split("@")[0] || "Anonymous",
          imageUrl,
          caption: caption.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === "moderated") {
          throw new Error("Your caption didn't meet the content guidelines - try rewording it.");
        }
        if (data?.error === "not_authenticated" || data?.error === "invalid_session") {
          throw new Error("Your session expired - try logging in again.");
        }
        throw new Error(data?.error || "post_failed");
      }

      setFile(null);
      setPreviewUrl(null);
      setCaption("");
      setStatus("idle");
      onPosted?.();
    } catch (e) {
      setStatus("error");
      setError(
        e.message === "image_upload_not_configured"
          ? "Image uploads aren't set up yet - see README for Cloudinary setup."
          : e.message
      );
    }
  }

  return (
    <div className="newpost-screen">
      <h2>New Post</h2>
      <form className="newpost-form" onSubmit={handleSubmit}>
        <label className="image-picker">
          {previewUrl ? (
            <img src={previewUrl} alt="Preview" className="image-preview" />
          ) : (
            <span className="image-picker-placeholder">Tap to choose a photo</span>
          )}
          <input type="file" accept="image/*" onChange={handleFileChange} hidden />
        </label>

        <textarea
          placeholder="Write a caption…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={280}
          rows={3}
        />

        {error && <p className="error-text">{error}</p>}

        <button
          type="submit"
          className="btn-primary"
          disabled={status === "uploading" || status === "posting"}
        >
          {status === "uploading" ? "Uploading image…" : status === "posting" ? "Posting…" : "Share Post"}
        </button>
      </form>
    </div>
  );
}
