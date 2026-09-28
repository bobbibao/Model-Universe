import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import multer from 'multer';
import HttpError from '../../../shared/server/utils/HttpError';
import Logger from '../../../shared/server/utils/logger';

export const PUBLIC_UPLOAD_PREFIX = '/uploads';
const PRODUCT_FOLDER = 'products';
const MAX_FILES_PER_REQUEST = 10;
const DEFAULT_MAX_FILE_MB = 5;
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// Uploaded files are stored on local disk and served by server.ts under /uploads.
export default class FileStorageService {
  static getUploadRoot(): string {
    return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
  }

  private static getMaxFileBytes(): number {
    const megabytes = Number(process.env.UPLOAD_MAX_MB);
    return (megabytes > 0 ? megabytes : DEFAULT_MAX_FILE_MB) * 1024 * 1024;
  }

  private createImageUploader(folder: string) {
    const destination = path.join(FileStorageService.getUploadRoot(), folder);
    return multer({
      storage: multer.diskStorage({
        destination: (_req, _file, callback) => {
          fs.mkdirSync(destination, { recursive: true });
          callback(null, destination);
        },
        filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
      }),
      limits: { fileSize: FileStorageService.getMaxFileBytes(), files: MAX_FILES_PER_REQUEST },
      fileFilter: (_req, file, callback) => {
        if (IMAGE_TYPES[file.mimetype]) callback(null, true);
        else callback(HttpError.badRequest('Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF.'));
      },
    }).array('files', MAX_FILES_PER_REQUEST);
  }

  // Stores the multipart `files` field and returns the public URLs of the saved images.
  async saveProductImages(req: Request, res: Response): Promise<string[]> {
    const upload = this.createImageUploader(PRODUCT_FOLDER);
    await new Promise<void>((resolve, reject) => {
      upload(req, res, (error: unknown) => {
        if (!error) return resolve();
        if (error instanceof multer.MulterError) {
          const message =
            error.code === 'LIMIT_FILE_SIZE'
              ? `Mỗi ảnh tối đa ${FileStorageService.getMaxFileBytes() / 1024 / 1024}MB.`
              : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
                ? `Chỉ được tải lên tối đa ${MAX_FILES_PER_REQUEST} ảnh mỗi lần.`
                : 'Tải ảnh lên không thành công.';
          return reject(HttpError.badRequest(message));
        }
        reject(error);
      });
    });
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (files.length === 0) throw HttpError.badRequest('Vui lòng chọn ít nhất một ảnh.');
    return files.map((file) => `${PUBLIC_UPLOAD_PREFIX}/${PRODUCT_FOLDER}/${file.filename}`);
  }

  // Deletes locally stored files; external URLs and unknown paths are ignored.
  async removeFiles(urls: string[]): Promise<void> {
    const root = FileStorageService.getUploadRoot();
    for (const url of urls) {
      if (!url.startsWith(`${PUBLIC_UPLOAD_PREFIX}/`)) continue;
      const filePath = path.resolve(root, url.slice(PUBLIC_UPLOAD_PREFIX.length + 1));
      if (!filePath.startsWith(root + path.sep)) continue;
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          Logger.WARN(`Could not delete uploaded file ${filePath}:`, error);
        }
      }
    }
  }
}
