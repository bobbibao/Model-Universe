import DatabaseProvider from '../../src/core/server/database/Database.Provider';
import AdminMarketingModel from '../../src/core/server/database/client/models/AdminMarketing.Model';
import MarketingCampaignModel from '../../src/core/server/database/client/models/MarketingCampaign.Model';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
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
    jest
      .spyOn(DatabaseProvider, 'getInstance')
      .mockReturnValue({
        transaction: async (callback: (t: unknown) => Promise<unknown>) => callback(transaction),
      } as never);
    jest.spyOn(AgentPolicyService.prototype, 'serialize').mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());
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
    const publish = jest.spyOn(writes, 'createPost').mockResolvedValue({ detail: 'posted', undo: { kind: 'post', ref: `${REF}-post` } });
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
    jest
      .spyOn(AdminMarketingModel, 'findByPk')
      .mockResolvedValue({
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
    jest
      .spyOn(ProductModel, 'findOne')
      .mockResolvedValue({ name: 'RG Zaku II', sku: 'MU-RG-ZAKU-II', price: 690000, brandName: 'Bandai', stock: 3 } as never);
    const forward = jest.spyOn(AgentGatewayService.prototype, 'forward');
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { thread_id: 'price-copy' } });
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { copy: { message: 'RG Zaku II 690.000 VND' } } });
    await service.suggest(makeUser(), { name: 'Zaku', channel: 'facebook', brief: 'Giới thiệu', sku: 'MU-RG-ZAKU-II' });
    const facts = (forward.mock.calls[1][3] as { body: { input: { request: { facts: string } } } }).body.input.request.facts;
    expect(JSON.parse(facts)).toMatchObject({ sku: 'MU-RG-ZAKU-II', price: '690000 VND' });
  });
  it('passes the selected English locale without publishing a campaign', async () => {
    const forward = jest.spyOn(AgentGatewayService.prototype, 'forward');
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { thread_id: 'english-copy' } });
    forward.mockResolvedValueOnce({ status: 200, stream: false, data: { copy: { message: 'Explore Model Universe' } } });
    const publish = jest.spyOn(writes, 'createPost');
    await service.suggest(makeUser(), { name: 'Gunpla', channel: 'facebook', brief: 'Introduce model kits' }, 'en');
    expect(forward.mock.calls[1][3]).toMatchObject({ body: { input: { request: { locale: 'en' } } } });
    expect(publish).not.toHaveBeenCalled();
  });
});
