/**
 * Image helpers for playlist custom artwork compression & validation
 */

export function isValidPlaylistCoverUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 100000) return false;
  return /^(https:\/\/|data:image\/)/i.test(trimmed);
}

/**
 * Center-crops and compresses an image File into a crisp square JPEG data URL (<= 80KB)
 * so custom playlist covers work offline in IndexedDB and sync safely to Firestore.
 */
export async function compressPlaylistCoverFile(
  file: File,
  targetSize: number = 320
): Promise<string> {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, or WebP).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image.'));
      el.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable.');

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const side = Math.min(srcW, srcH);
    const sx = Math.max(0, Math.floor((srcW - side) / 2));
    const sy = Math.max(0, Math.floor((srcH - side) / 2));

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

    let quality = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 82000 && quality > 0.35) {
      quality = Number((quality - 0.12).toFixed(2));
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    if (dataUrl.length > 96000) {
      // Fallback downscale pass for extremely detailed textures
      const small = document.createElement('canvas');
      small.width = 240;
      small.height = 240;
      const sctx = small.getContext('2d');
      if (sctx) {
        sctx.drawImage(canvas, 0, 0, 240, 240);
        dataUrl = small.toDataURL('image/jpeg', 0.65);
      }
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
