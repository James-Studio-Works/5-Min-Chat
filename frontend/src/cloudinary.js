const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * Upload an image or video to Cloudinary.
 * Returns { url, resourceType } where resourceType is "image" or "video".
 */
export async function uploadMedia(file) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error("image_upload_not_configured");
  }

  const isVideo = file.type.startsWith("video/");
  const resourceType = isVideo ? "video" : "image";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    { method: "POST", body: formData }
  );
  const data = await res.json();
  if (!res.ok || !data.secure_url) throw new Error("upload_failed");
  return { url: data.secure_url, resourceType: data.resource_type || resourceType };
}

/** @deprecated use uploadMedia */
export async function uploadImage(file) {
  const { url } = await uploadMedia(file);
  return url;
}

/** True if a media URL points to a video (Cloudinary or common extensions). */
export function isVideoUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (url.includes("/video/upload/")) return true;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}
