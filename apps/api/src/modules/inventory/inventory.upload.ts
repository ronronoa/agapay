import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { env } from '../../lib/env.js';
import { businessRuleViolation, internal, isAppError, validationError } from '../../lib/errors.js';

export const INVENTORY_IMAGE_FIELD = 'image';

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// Resolved per call (not at import) so tests can point UPLOAD_DIR at a temp
// directory at runtime; env.ts still validates the value at boot.
export function uploadRoot(): string {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? env.UPLOAD_DIR);
}

export function inventoryUploadDir(): string {
  return path.join(uploadRoot(), 'inventory');
}

export function ensureInventoryUploadDir(): void {
  fs.mkdirSync(inventoryUploadDir(), { recursive: true });
}

export function imageUrlFor(filename: string): string {
  return `/uploads/inventory/${filename}`;
}

// Map a served URL back to a file, but only inside our own upload directory:
// anything else (absolute paths, traversal, other folders) is refused.
export function uploadPathForUrl(imageUrl: string): string | null {
  const prefix = '/uploads/inventory/';
  if (!imageUrl.startsWith(prefix)) return null;
  const filename = imageUrl.slice(prefix.length);
  if (filename === '' || filename.includes('/') || filename.includes('\\')) return null;
  const dir = path.resolve(inventoryUploadDir());
  const resolved = path.resolve(dir, filename);
  if (resolved !== path.join(dir, filename)) return null;
  return resolved;
}

function imageFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const ext = path.extname(file.originalname).toLowerCase();
  if (IMAGE_MIME_TO_EXT[file.mimetype] === undefined || !IMAGE_EXTENSIONS.has(ext)) {
    cb(businessRuleViolation('Only PNG, JPG, or WEBP photos are allowed.'));
    return;
  }
  cb(null, true);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureInventoryUploadDir();
      cb(null, inventoryUploadDir());
    } catch (err) {
      cb(err instanceof Error ? err : new Error('Could not prepare the upload directory.'), '');
    }
  },
  // The extension comes from the validated MIME type, never the client name.
  filename: (_req, file, cb) => {
    const ext = IMAGE_MIME_TO_EXT[file.mimetype];
    if (ext === undefined) {
      cb(businessRuleViolation('Only PNG, JPG, or WEBP photos are allowed.'), '');
      return;
    }
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const singleImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: env.UPLOAD_MAX_IMAGE_MB * 1024 * 1024, files: 1, fields: 0 },
}).single(INVENTORY_IMAGE_FIELD);

// Runs the multer middleware and translates its errors into plain AppErrors;
// Multer errors carry codes, never user content (TS-12, API-04).
export async function runImageUpload(req: Request, res: Response): Promise<Express.Multer.File> {
  await new Promise<void>((resolve, reject) => {
    singleImage(req, res, (err: unknown) => {
      if (err === null || err === undefined) resolve();
      else if (err instanceof Error) reject(err);
      else reject(new Error('Photo upload failed.'));
    });
  });

  const file = req.file;
  if (file === undefined) throw validationError('Attach the photo as the "image" field.');

  return file;
}

export function uploadErrorMessage(err: unknown): Error {
  if (isAppError(err)) return err;
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return businessRuleViolation(`Photos must be ${env.UPLOAD_MAX_IMAGE_MB}MB or smaller.`);
    }
    return businessRuleViolation('Attach one photo as the "image" field.');
  }
  return internal('Photo upload failed.');
}
