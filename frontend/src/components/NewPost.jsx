import { useState } from "react";
import { uploadMedia } from "../cloudinary.js";
import { CameraIcon } from "../icons/Icons.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export default function NewPost({ onPosted, currentUser, accessToken }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const video = selected.type.startsWith("video/");
    const image = selected.type.startsWith("image/");

    if (!video && !image) {
      setError("Please choose a photo or video.");
      return;
    }
    if (image && selected.size > MAX_IMAGE_BYTES) {
      setError("Image is too large — please choose something under 8MB.");
      return;
    }
    if (video && selected.size > MAX_VIDEO_BYTES) {
      setError("Video is too large — please choose something under 50MB.");
      return;
    }

    setError(null);
    setFile(selected);
    setIsVideo(video);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  function clearMedia() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setIsVideo(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return setError("Choose a photo or video first.");

    setError(null);
    setStatus("uploading");
    try {
      const { url: imageUrl } = await uploadMedia(file);

      setStatus("posting");
      const res = await fetch(`${BACKEND_URL}/api/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          username:
            currentUser?.user_metadata?.full_name ||
            currentUser?.email?.split("@")[0] ||
            "Anonymous",
          imageUrl,
          caption: caption.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === "moderated") {
          throw new Error("Your caption didn't meet the content guidelines — try rewording it.");
        }
        if (data?.error === "not_authenticated" || data?.error === "invalid_session") {
          throw new Error("Your session expired — try logging in again.");
        }
        throw new Error(data?.error || "post_failed");
      }

      clearMedia();
      setCaption("");
      setStatus("idle");
      onPosted?.();
    } catch (e) {
      setStatus("error");
      setError(
        e.message === "image_upload_not_configured"
          ? "Uploads aren't set up yet — see README for Cloudinary setup."
          : e.message
      );
    }
  }

  const busy = status === "uploading" || status === "posting";
  const remaining = 280 - caption.length;

  return (
    <div className="newpost-screen">
      <header className="newpost-header">
        <h2>New Post</h2>
        <p className="newpost-sub">Share a photo or short video with the feed</p>
      </header>

      <form className="newpost-form" onSubmit={handleSubmit}>
        <label className={`image-picker ${previewUrl ? "has-preview" : ""}`}>
          {previewUrl ? (
            <>
              {isVideo ? (
                <video
                  src={previewUrl}
                  className="image-preview"
                  controls
                  playsInline
                  muted
                />
              ) : (
                <img src={previewUrl} alt="Preview" className="image-preview" />
              )}
              <button
                type="button"
                className="image-picker-clear"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearMedia();
                }}
                aria-label="Remove media"
              >
                ×
              </button>
              <span className="image-picker-badge">{isVideo ? "Video" : "Photo"}</span>
            </>
          ) : (
            <div className="image-picker-empty">
              <div className="image-picker-icon">
                <CameraIcon size={32} strokeWidth={1.6} />
              </div>
              <span className="image-picker-title">Tap to add media</span>
              <span className="image-picker-hint">Photo or video · max 8MB / 50MB</span>
            </div>
          )}
          <input
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            hidden
          />
        </label>

        <div className="newpost-caption-wrap">
          <textarea
            className="newpost-caption"
            placeholder="Write a caption…"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={280}
            rows={3}
          />
          <span className={`newpost-char-count ${remaining < 30 ? "warn" : ""}`}>
            {remaining}
          </span>
        </div>

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn-primary newpost-submit" disabled={busy || !file}>
          {status === "uploading"
            ? isVideo
              ? "Uploading video…"
              : "Uploading image…"
            : status === "posting"
            ? "Posting…"
            : "Share Post"}
        </button>
      </form>
    </div>
  );
}
