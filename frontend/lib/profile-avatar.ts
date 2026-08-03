/** Browser-local profile avatar (data URL). Server avatar upload is not wired yet. */

export const PROFILE_AVATAR_UPDATED_EVENT = "mlair-profile-avatar-updated";

const storageKey = (userId: string) => `ml-air:profile-avatar:${userId}`;

export function loadProfileAvatar(userId: string | null | undefined): string | null {
  if (typeof window === "undefined" || !userId?.trim()) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw?.startsWith("data:image/") ? raw : null;
  } catch {
    return null;
  }
}

export function saveProfileAvatar(userId: string, dataUrl: string): void {
  localStorage.setItem(storageKey(userId), dataUrl);
  window.dispatchEvent(
    new CustomEvent(PROFILE_AVATAR_UPDATED_EVENT, { detail: { userId } }),
  );
}

export function clearProfileAvatar(userId: string): void {
  localStorage.removeItem(storageKey(userId));
  window.dispatchEvent(
    new CustomEvent(PROFILE_AVATAR_UPDATED_EVENT, { detail: { userId } }),
  );
}

export function readImageFileAsDataUrl(file: File, maxBytes = 100 * 1024 * 1024): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Please choose an image file"));
  }
  if (file.size > maxBytes) {
    return Promise.reject(new Error("Image must be under 100MB"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      if (!result.startsWith("data:image/")) {
        reject(new Error("Invalid image data"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}
