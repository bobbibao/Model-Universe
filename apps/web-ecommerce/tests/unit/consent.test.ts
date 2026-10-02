import request from 'supertest';
import express from 'express';
import 'reflect-metadata';
import {
  allowedTags,
  consentCookieValue,
  parseConsentCookie,
} from '../../src/shared/server/utils/ConsentUtils';
import { tagLoaderSrc, tagSnippet } from '../../src/components/Tracking/tagSnippets';
import ConsentLogModel from '../../src/core/server/database/client/models/ConsentLog.Model';

const IDS = { metaPixelId: '123456789012345', googleTagId: 'AW-987654321', tiktokPixelId: 'C4ABCDEF123' };

describe('consent-gated tracking tags', () => {
  it('loads no tag without marketing consent', () => {
    expect(allowedTags(null, IDS)).toEqual([]);
    expect(allowedTags({ analytics: true, marketing: false }, IDS)).toEqual([]);
  });

  it('loads the configured tags with their ids after marketing consent', () => {
    const tags = allowedTags({ analytics: false, marketing: true }, IDS);
    expect(tags).toEqual([
      { platform: 'meta', id: IDS.metaPixelId },
      { platform: 'google', id: IDS.googleTagId },
      { platform: 'tiktok', id: IDS.tiktokPixelId },
    ]);
    expect(tagSnippet(tags[0])).toContain(`fbq('init','${IDS.metaPixelId}')`);
    expect(tagSnippet(tags[1])).toContain(`gtag('config','${IDS.googleTagId}')`);
    expect(tagLoaderSrc(tags[1])).toBe(`https://www.googletagmanager.com/gtag/js?id=${IDS.googleTagId}`);
    expect(tagSnippet(tags[2])).toContain(`ttq.load('${IDS.tiktokPixelId}')`);
  });

  it('loads only configured, well-formed ids', () => {
    const tags = allowedTags({ analytics: true, marketing: true }, { metaPixelId: "1');alert(1)//" });
    expect(tags).toEqual([]);
  });

  it('reads back the stored choice and ignores anything else', () => {
    const value = consentCookieValue({ analytics: true, marketing: false });
    expect(parseConsentCookie(value)).toEqual({ analytics: true, marketing: false });
    expect(parseConsentCookie('{"analytics":true,"marketing":true}')).toBeNull(); // no version
    expect(parseConsentCookie('garbage')).toBeNull();
  });
});

describe('POST /api/consent', () => {
  const app = async () => {
    const { router } = await import('../../src/shared/server/decorators/controller.decorator');
    await import('../../src/app/api/Consent.Controller');
    const server = express();
    server.use(express.json());
    server.use('/api', router);
    return server;
  };

  it('logs the choice without any identifier', async () => {
    const create = jest.spyOn(ConsentLogModel, 'create').mockResolvedValue({} as ConsentLogModel);
    const response = await request(await app()).post('/api/consent').send({ analytics: false, marketing: true });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith({ analytics: false, marketing: true });
    create.mockRestore();
  });

  it('refuses a malformed choice', async () => {
    const create = jest.spyOn(ConsentLogModel, 'create');
    const response = await request(await app()).post('/api/consent').send({ marketing: 'yes' });
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });
});
