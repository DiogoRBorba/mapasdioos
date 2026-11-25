export const MAX_PIN_IMAGES = 6;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const pinImageUrl = id => `/api/pin-images?id=${encodeURIComponent(id)}`;
