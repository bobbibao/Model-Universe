import type { Sequelize } from 'sequelize-typescript';
import { MIGRATIONS } from '../../src/core/server/database/migrations';
import { seedTestDatabase } from './support/testDb';
import ProductModel from '../../src/core/server/database/client/models/Product.Model';
import ProductSourceModel from '../../src/core/server/database/client/models/ProductSource.Model';
import PromotionAuditModel from '../../src/core/server/database/client/models/PromotionAudit.Model';
import {
  estimatedPricing,
  loadCatalogEntries,
  ownerCatalogValues,
} from '../../src/core/server/database/client/seeders/ModelUniverseCatalog';

// The owner's workbook "Danh mục 6 hãng" applied to a catalogue seeded before it existed.
describe("owner catalogue defaults migration", () => {
  let db: Sequelize;
  const entries = loadCatalogEntries();
  const productFor = async (catalogKey: string) =>
    (await ProductModel.findByPk((await ProductSourceModel.findOne({ where: { catalogKey } }))!.productId))!;
  const run = () =>
    MIGRATIONS.find((m) => m.name === '2026-10-23-42-catalog-owner-defaults')!.up({ context: { sequelize: db } } as never);
  beforeAll(async () => {
    db = await seedTestDatabase();
  }, 600_000);
  afterAll(async () => {
    await db.close();
  });

  it('fills empty boxes, replaces only the seeded CD-01 estimate, keeps staff edits and is idempotent', async () => {
    const cd01 = entries.find((entry) => entry.sku === 'CD-01')!;
    const kit = entries.find((entry) => entry.id === 'mn-mnp-xh01-ban-thuong')!;
    const edited = entries.find((entry) => entry.id === 'mn-mnp-xh03-ban-thuong')!;
    const none = entries.find((entry) => !ownerCatalogValues(entry))!;
    // The catalogue as an earlier seed wrote it.
    for (const entry of [cd01, kit, none])
      await (await productFor(entry.id)).update({ ...estimatedPricing(entry), packaging: null });
    const staffBox = { lengthCm: 40, widthCm: 30, heightCm: 12, weightGram: 2500, fragile: true, orientation: 'any' };
    await (await productFor(edited.id)).update({ packaging: staffBox });

    await run();
    await run();
    const owner = ownerCatalogValues(cd01)!;
    expect((await productFor(cd01.id)).get({ plain: true })).toMatchObject({ ...owner.pricing, packaging: owner.packaging });
    expect((await productFor(kit.id)).packaging).toEqual(ownerCatalogValues(kit)!.packaging);
    expect((await productFor(edited.id)).packaging).toEqual(staffBox);
    expect((await productFor(none.id)).packaging).toBeNull();
    const cd01Id = (await productFor(cd01.id)).id;
    expect(await PromotionAuditModel.count({ where: { entityId: cd01Id, action: 'owner_catalog' } })).toBe(1);

    // A price staff changed is never replaced by the workbook.
    await (await productFor(cd01.id)).update({ ...estimatedPricing(cd01), importPrice: 4_000_000 });
    await run();
    expect((await productFor(cd01.id)).importPrice).toBe(4_000_000);
  });
});
