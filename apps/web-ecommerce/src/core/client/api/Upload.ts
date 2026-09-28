'use client';

import Api from './Api';
import { UPLOAD_API } from './endpoint';

export default class UploadApi {
  // Uploads image files and returns their public URLs, in the same order as `files`.
  static async uploadImages(files: File[]): Promise<string[] | undefined> {
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const response = await Api.post(UPLOAD_API.UPLOAD_IMAGES, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data?.urls;
    } catch (error) {
      return undefined;
    }
  }
}
