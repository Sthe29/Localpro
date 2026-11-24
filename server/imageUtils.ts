import fs from 'node:fs';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function getUploadsRoot(): string {
  const configured = process.env.LOCALPRO_UPLOAD_DIR?.trim();
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), 'uploads');
}

export const UPLOADS_ROOT = getUploadsRoot();
export const AVATAR_UPLOAD_DIR = path.resolve(UPLOADS_ROOT, 'avatars');
export const POST_UPLOAD_DIR = path.resolve(UPLOADS_ROOT, 'posts');
export const AVATAR_URL_PREFIX = '/uploads/avatars/';
export const POST_URL_PREFIX = '/uploads/posts/';

fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(POST_UPLOAD_DIR, { recursive: true });


export function detectImageExtension(buffer: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buffer.length < 12) return null;

  // JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // WebP magic bytes: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

export function safelyDeleteUploadFile(
  fileUrl: string | null | undefined,
  urlPrefix: string,
  baseDir: string
): void {
  if (!fileUrl || !fileUrl.startsWith(urlPrefix)) {
    return;
  }
  const filename = path.basename(fileUrl);
  if (!filename) return;
  const resolved = path.resolve(baseDir, filename);
  if (!resolved.startsWith(baseDir + path.sep)) {
    return;
  }
  try {
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  } catch (err) {
    console.error('Failed to delete uploaded image file:', err);
  }
}

export function verifyStoredUploadPath(
  fileUrl: unknown,
  urlPrefix: string,
  baseDir: string
): string | null {
  if (typeof fileUrl !== 'string' || !fileUrl.startsWith(urlPrefix)) {
    return null;
  }
  const filename = path.basename(fileUrl);
  if (!filename || filename !== fileUrl.slice(urlPrefix.length)) {
    return null;
  }
  const resolved = path.resolve(baseDir, filename);
  if (!resolved.startsWith(baseDir + path.sep) || !fs.existsSync(resolved)) {
    return null;
  }
  return `${urlPrefix}${filename}`;
}
