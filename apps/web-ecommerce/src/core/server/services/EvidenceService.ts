import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import type { Request, Response } from 'express';
import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import EvidenceModel from '../database/client/models/Evidence.Model';
import PawnContractModel from '../database/client/models/PawnContract.Model';
import FileStorageService from './FileStorageService';
import HttpError from '../../../shared/server/utils/HttpError';

const PURPOSES = ['reservation_payment','buyback','pawn','pawn_settlement','partner_verification','partner_bank','loyalty_claim','return'] as const;
const PUBLIC_FIELDS = ['id','ownerUserId','purpose','entityId','originalName','mimeType','sizeBytes','sha256','createdAt'];
const TYPES: Record<string,string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Business evidence is outside both public/ and the Express /uploads mount.
export default class EvidenceService {
  private root() {
    const root = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), '.private-uploads'));
    for (const publicRoot of [FileStorageService.getUploadRoot(), path.resolve('public')]) {
      const relative = path.relative(publicRoot, root);
      if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) throw new Error('Private evidence storage must be outside public upload roots.');
    }
    return root;
  }
  async upload(req: Request, res: Response, ownerUserId: number) {
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (_request, file, callback) => {
      if (TYPES[file.mimetype]) callback(null, true);
      else callback(HttpError.badRequest('Choose a JPG, PNG or WebP evidence photograph.'));
    } }).single('file');
    await new Promise<void>((resolve, reject) => upload(req, res, error => error ? reject(HttpError.badRequest('Upload one evidence photograph, at most 10 MB.')) : resolve()));
    const file = req.file, purpose = req.body.purpose;
    if (!file || !PURPOSES.includes(purpose)) throw HttpError.badRequest('A photograph and a supported evidence purpose are required.');
    const bytes = file.buffer;
    const valid = file.mimetype === 'image/jpeg' ? bytes.subarray(0,3).equals(Buffer.from([255,216,255]))
      : file.mimetype === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
    if (!valid) throw HttpError.badRequest('The file contents do not match the photograph type.');
    const root = this.root(), diskKey = `${crypto.randomUUID()}${TYPES[file.mimetype]}`;
    await fs.mkdir(root, { recursive: true });
    const filePath = path.join(root, diskKey);
    await fs.writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 });
    try {
      const originalName = Array.from(path.basename(file.originalname)).filter(character => character.charCodeAt(0) >= 32).join('').slice(0,180) || 'evidence';
      const row = await EvidenceModel.create({ ownerUserId, purpose, diskKey, originalName, mimeType: file.mimetype, sizeBytes: file.size, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
      return EvidenceModel.findByPk(row.id, { attributes: PUBLIC_FIELDS });
    } catch (error) { await fs.unlink(filePath); throw error; }
  }
  async bind(ids: unknown, ownerUserId: number, purpose: string, entityId: number, transaction: Transaction) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 12 || ids.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) throw HttpError.badRequest('Select 1–12 owned evidence photographs.');
    const rows = await EvidenceModel.findAll({ where: { id: { [Op.in]: ids }, ownerUserId, purpose }, transaction, lock: transaction.LOCK.UPDATE });
    if (rows.length !== ids.length || rows.some(row => row.entityId && row.entityId !== entityId)) throw HttpError.notFound('Evidence not found or already assigned.');
    for (const row of rows) if (!row.entityId) await row.update({ entityId }, { transaction });
    return rows.map(row => ({ id: row.id, sha256: row.sha256 }));
  }
  async list(ownerUserId: number, purpose: string, entityId: number) {
    return EvidenceModel.findAll({ where: { ownerUserId, purpose, entityId }, attributes: PUBLIC_FIELDS, order: [['id','ASC']] });
  }
  async read(id: number, user: { id: number; role: string }, res: Response) {
    if (!Number.isSafeInteger(id) || id < 1) throw HttpError.notFound('Evidence not found.');
    const row = await EvidenceModel.findByPk(id);
    if (!row) throw HttpError.notFound('Evidence not found.');
    if (user.role !== 'ADMIN' && row.ownerUserId !== user.id) {
      // Staff expense documents are shared only with the owner of their bound pawn contract.
      const contract = row.purpose === 'pawn_settlement' && row.entityId
        ? await PawnContractModel.findOne({ where: { id: row.entityId, userId: user.id } }) : null;
      if (!contract) throw HttpError.notFound('Evidence not found.');
    }
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(row.diskKey)) throw new Error('Invalid stored evidence key.');
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Type',row.mimeType);
    return new Promise<void>((resolve, reject) => res.sendFile(path.join(this.root(),row.diskKey), error => error ? reject(error) : resolve()));
  }
}
