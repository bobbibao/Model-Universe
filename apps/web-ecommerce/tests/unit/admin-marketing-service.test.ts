import DatabaseProvider from '../../src/core/server/database/Database.Provider';
import AdminMarketingModel from '../../src/core/server/database/client/models/AdminMarketing.Model';
import MarketingCampaignModel from '../../src/core/server/database/client/models/MarketingCampaign.Model';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductImageModel from '../../src/core/server/database/client/models/ProductImage.Model';
import MarketingAssetModel from '../../src/core/server/database/client/models/MarketingAsset.Model';
import AdminMarketingService from '../../src/core/server/services/AdminMarketingService';
import AgentGatewayService from '../../src/core/server/services/AgentGatewayService';
import AgentPolicyService from '../../src/core/server/services/agent/AgentPolicyService';
import * as writes from '../../src/core/server/services/agent/MarketingActions';
import { parseDraft } from '../../src/core/server/services/marketing/AdminMarketingValidation';
import { makeUser } from './support/gatewayApp';

const REF = 'adm-12345678-1234-1234-1234-123456789abc';
describe('admin marketing service', () => {
  const service = new AdminMarketingService();
  beforeEach(() => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    jest.spyOn(DatabaseProvider, 'getInstance').mockReturnValue({
      transaction: async (callback: (t: unknown) => Promise<unknown>) => callback(transaction),
    } as never);
    jest.spyOn(AgentPolicyService.prototype, 'serialize').mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  it('retains all products and their facts without a selection or 6,000-character truncation', async () => {
    jest.spyOn(ProductModel, 'findOne').mockImplementation(
      async (query) =>
        ({
          id: 1,
          name: 'Long model name '.repeat(16),
          sku: (query?.where as { sku: string }).sku,
          description: 'Detailed model facts '.repeat(200),
          price: 123456,
          stock: 3,
        }) as never,
    );
    const forward = jest.spyOn(AgentGatewayService.prototype, 'forward');
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { thread_id: 'twenty-products' } });
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { copy: { message: 'Collection' } } });
    await service.suggest(makeUser(), {
      name: 'Collection',
      channel: 'facebook',
      brief: 'Introduce all',
      skus: Array.from({ length: 75 }, (_, i) => `SKU-${i}`),
    });
    const facts = (forward.mock.calls[1][3] as { body: { input: { request: { facts: string } } } }).body.input.request
      .facts;
    expect(facts.length).toBeGreaterThan(6000);
    expect(JSON.parse(facts).products).toHaveLength(75);
    expect(JSON.parse(facts).products[0].sku).toBe('SKU-0');
    expect(JSON.parse(facts).products.every((product: { price: string }) => product.price === '123456 VND')).toBe(true);
  });
  it('publishes the ordered gallery and uploaded images as one post, retaining all selected products', async () => {
    const draft = {
      status: 'draft',
      ref: REF,
      input: parseDraft({
        name: 'Collection',
        channel: 'facebook',
        message: 'Two models',
        skus: ['RG-1', 'MG-2'],
        mediaKeys: ['asset:8', 'image:7', 'product:MG-2'],
      }),
      update: jest.fn(),
    };
    jest.spyOn(AdminMarketingModel, 'findByPk').mockResolvedValue(draft as never);
    jest.spyOn(ProductModel, 'findOne').mockImplementation(
      async (query) =>
        ({
          id: (query?.where as { sku: string }).sku === 'RG-1' ? 1 : 2,
          sku: (query?.where as { sku: string }).sku,
          imageUrl: 'https://shop.example/cover.jpg',
        }) as never,
    );
    jest
      .spyOn(ProductImageModel, 'findByPk')
      .mockResolvedValue({ productId: 1, url: 'https://shop.example/detail.jpg' } as never);
    jest
      .spyOn(MarketingAssetModel, 'findByPk')
      .mockResolvedValue({ kind: 'image', url: 'https://shop.example/upload.jpg' } as never);
    jest.spyOn(MarketingCampaignModel, 'create').mockResolvedValue({} as never);
    const publish = jest
      .spyOn(writes, 'createPost')
      .mockResolvedValue({ detail: 'posted', undo: { kind: 'post', ref: `${REF}-post` } });
    await service.publish(makeUser(), 1);
    expect(publish.mock.calls[0][1]).toEqual([
      'https://shop.example/upload.jpg',
      'https://shop.example/detail.jpg',
      'https://shop.example/cover.jpg',
    ]);
    expect(draft.input.skus).toEqual(['RG-1', 'MG-2']);
  });
  it('refuses gallery images from unselected products before creating or publishing a campaign', async () => {
    jest.spyOn(AdminMarketingModel, 'findByPk').mockResolvedValue({
      status: 'draft',
      ref: REF,
      input: parseDraft({
        name: 'Collection',
        channel: 'facebook',
        message: 'Hi',
        skus: ['RG-1'],
        mediaKeys: ['image:99'],
      }),
    } as never);
    jest.spyOn(ProductModel, 'findOne').mockResolvedValue({ id: 1, sku: 'RG-1' } as never);
    jest.spyOn(ProductImageModel, 'findByPk').mockResolvedValue({ productId: 999, url: '/not-selected.jpg' } as never);
    const campaign = jest.spyOn(MarketingCampaignModel, 'create');
    const publish = jest.spyOn(writes, 'createPost');
    await expect(service.publish(makeUser(), 1)).rejects.toMatchObject({ statusCode: 400 });
    expect(campaign).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it('includes verified facts for every selected product in the suggestion request', async () => {
    jest
      .spyOn(ProductModel, 'findOne')
      .mockImplementation(
        async (query) => ({ name: 'Kit', sku: (query?.where as { sku: string }).sku, price: 100000 }) as never,
      );
    const forward = jest.spyOn(AgentGatewayService.prototype, 'forward');
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { thread_id: 'multi-copy' } });
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { copy: { message: 'Collection' } } });
    await service.suggest(makeUser(), {
      name: 'Collection',
      channel: 'facebook',
      brief: 'Introduce both',
      skus: ['RG-1', 'MG-2'],
    });
    const request = (forward.mock.calls[1][3] as { body: { input: { request: { facts: string } } } }).body.input
      .request;
    expect(JSON.parse(request.facts).products.map((product: { sku: string }) => product.sku)).toEqual(['RG-1', 'MG-2']);
  });
  it('blocks non-admin callers before creating content or drafts', async () => {
    await expect(service.save(makeUser('USER'), {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.publish(makeUser('USER'), 1)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.suggest(makeUser('USER'), {})).rejects.toMatchObject({ statusCode: 403 });
  });
  it('publishes the edited draft with no Agent action and treats a retry as already submitted', async () => {
    const draft = {
      status: 'draft',
      ref: REF,
      input: parseDraft({ name: 'Admin post', channel: 'facebook', message: 'Nội dung admin đã chỉnh sửa' }),
      update: jest.fn(),
    };
    draft.update.mockImplementation(async (values: object) => {
      Object.assign(draft, values);
      return draft;
    });
    jest.spyOn(AdminMarketingModel, 'findByPk').mockResolvedValue(draft as never);
    jest.spyOn(MarketingCampaignModel, 'create').mockResolvedValue({} as never);
    const publish = jest
      .spyOn(writes, 'createPost')
      .mockResolvedValue({ detail: 'posted', undo: { kind: 'post', ref: `${REF}-post` } });
    await service.publish(makeUser(), 1);
    await service.publish(makeUser(), 1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({
      actionId: null,
      body: { message: 'Nội dung admin đã chỉnh sửa', campaign_ref: REF },
    });
  });
  it('keeps the draft editable when the platform refuses to publish', async () => {
    const update = jest.fn();
    jest.spyOn(AdminMarketingModel, 'findByPk').mockResolvedValue({
      status: 'draft',
      ref: REF,
      input: parseDraft({ name: 'Post', channel: 'facebook', message: 'Hi' }),
      update,
    } as never);
    jest.spyOn(MarketingCampaignModel, 'create').mockResolvedValue({} as never);
    jest.spyOn(writes, 'createPost').mockRejectedValue(new Error('Platform unavailable'));
    await expect(service.publish(makeUser(), 1)).rejects.toThrow('Platform unavailable');
    expect(update).not.toHaveBeenCalled();
  });
  it('does not allow editing a submitted campaign', async () => {
    jest.spyOn(AdminMarketingModel, 'findByPk').mockResolvedValue({ status: 'submitted' } as never);
    await expect(service.save(makeUser(), { name: 'Edit', channel: 'facebook' }, 1)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
  it('requests read-only copy through the authenticated gateway', async () => {
    const forward = jest.spyOn(AgentGatewayService.prototype, 'forward');
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { thread_id: '1234-abc' } });
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { copy: { message: 'Gợi ý từ Agent' } } });
    expect(
      await service.suggest(makeUser(), { name: 'Post', channel: 'facebook', brief: 'Giới thiệu bộ sưu tập' }),
    ).toMatchObject({ message: 'Gợi ý từ Agent' });
    expect(forward.mock.calls[1]).toMatchObject([
      expect.anything(),
      'POST',
      '/threads/1234-abc/runs/wait',
      { body: { assistant_id: 'marketing_copy' } },
    ]);
  });
  it('states the product price with its unit so the copy lint accepts quoting it', async () => {
    jest.spyOn(ProductModel, 'findOne').mockResolvedValue({
      name: 'RG Zaku II',
      sku: 'MU-RG-ZAKU-II',
      price: 690000,
      brandName: 'Bandai',
      stock: 3,
    } as never);
    const forward = jest.spyOn(AgentGatewayService.prototype, 'forward');
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { thread_id: 'price-copy' } });
    forward.mockResolvedValueOnce({
      status: 200,
      stream: false,
      data: { copy: { message: 'RG Zaku II 690.000 VND' } },
    });
    await service.suggest(makeUser(), { name: 'Zaku', channel: 'facebook', brief: 'Giới thiệu', sku: 'MU-RG-ZAKU-II' });
    const facts = (forward.mock.calls[1][3] as { body: { input: { request: { facts: string } } } }).body.input.request
      .facts;
    expect(JSON.parse(facts)).toMatchObject({ sku: 'MU-RG-ZAKU-II', price: '690000 VND' });
  });
  it('passes the selected English locale without publishing a campaign', async () => {
    const forward = jest.spyOn(AgentGatewayService.prototype, 'forward');
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { thread_id: 'english-copy' } });
    forward.mockResolvedValueOnce({
      status: 200,
      stream: false,
      data: { copy: { message: 'Explore Model Universe' } },
    });
    const publish = jest.spyOn(writes, 'createPost');
    await service.suggest(makeUser(), { name: 'Gunpla', channel: 'facebook', brief: 'Introduce model kits' }, 'en');
    expect(forward.mock.calls[1][3]).toMatchObject({ body: { input: { request: { locale: 'en' } } } });
    expect(publish).not.toHaveBeenCalled();
  });
});
