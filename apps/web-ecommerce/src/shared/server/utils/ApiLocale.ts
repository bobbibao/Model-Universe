import type { Request } from 'express';
import english from '../../../messages/en.json';
import vietnamese from '../../../messages/vi.json';

export const apiMessage = (request: Request, key: keyof typeof english.checkout) => {
  const messages = request.header('Accept-Language')?.toLowerCase().startsWith('en') ? english : vietnamese;
  const value = messages.checkout[key];
  if (typeof value !== 'string') throw new Error('API message must be a plain localized string.');
  return value;
};

export const apiReturnMessage = (request: Request, key: keyof typeof english.returns) => {
  const messages = request.header('Accept-Language')?.toLowerCase().startsWith('en') ? english : vietnamese;
  const value = messages.returns[key];
  if (typeof value !== 'string') throw new Error('API message must be a plain localized string.');
  return value;
};
