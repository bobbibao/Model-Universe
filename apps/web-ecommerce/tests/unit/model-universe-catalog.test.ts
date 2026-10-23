import {
  assertCatalogValid,
  catalogStock,
  estimatedPricing,
  loadCatalogEntries,
  ownerCatalogDefaults,
  shopSku,
  toProductValues,
  toSourceValues,
} from '../../src/core/server/database/client/seeders/ModelUniverseCatalog';
import { CATEGORIES } from '../../src/core/server/database/client/seeders/Category.Seeder';
import loadedProducts from '../../src/core/server/database/client/seeders/data/products.json';
import ownerRows from '../../src/core/server/database/client/seeders/data/catalog-6-brands-defaults.json';
import { parseProductPackaging } from '../../src/shared/packing/rules';
import { catalogFormula } from '../../src/shared/sale-pricing';

const entries = loadCatalogEntries();
const byId = (id: string) => entries.find((entry) => entry.id === id)!;

describe('Model Universe mecha catalog seed', () => {
  it('passes its own invariants and maps every row to a product', () => {
    expect(entries).toHaveLength(136);
    expect(() => assertCatalogValid(entries)).not.toThrow();
    for (const entry of entries) {
      const product = toProductValues(entry);
      expect(Number.isInteger(product.price)).toBe(true);
      expect(product.importPrice).toBeLessThan(product.price);
      expect(product.stock).toBeGreaterThan(0);
      expect(product.name.length).toBeLessThanOrEqual(255);
    }
  });

  it('gives every row a unique shop SKU that never collides with the demo listings', () => {
    const skus = entries.map(shopSku);
    expect(new Set(skus).size).toBe(skus.length);
    const demoSkus = new Set((loadedProducts as { sku: string }[]).map((item) => item.sku));
    expect(skus.filter((sku) => demoSkus.has(sku))).toEqual([]);
  });

  it('places kits and finished figures in defined categories', () => {
    const slugs = new Set(CATEGORIES.map((category) => category.slug));
    const kit = toProductValues(byId('mn-mnp-xh01-ban-thuong'));
    const figure = toProductValues(byId('cd-cd-01b-black-version'));
    expect(kit.assemblyState).toBe('unassembled');
    expect(figure.assemblyState).toBe('assembled');
    expect(slugs.has('mecha-model-kits') && slugs.has('alloy-figures')).toBe(true);
  });

  it('keeps unknown manufacturer codes and N/A scales empty instead of inventing them', () => {
    const noCode = toProductValues(byId('inera-aurora-metal-frame-version'));
    expect(noCode.modelCode).toBeNull();
    expect(noCode.descriptionEn).toContain('Manufacturer code not yet verified.');
    expect(toProductValues(byId('cd-cd-tgm-01dx-premium-ver-sd')).scale).toBeNull();
  });

  it('names variants and keeps the standard edition implicit', () => {
    expect(toProductValues(byId('mn-mnp-xh01-ban-thuong')).name).toBe('Motor Nuclear MNP-XH01 Bai Qi / Bạch Khởi');
    expect(toProductValues(byId('mn-mnp-xh01w-majestic-color')).name).toBe(
      'Motor Nuclear MNP-XH01W Bai Qi / Bạch Khởi — Majestic Color',
    );
  });

  it('stocks limited editions scarcely and records provenance', () => {
    expect(catalogStock(byId('cd-cd-06g-gold-limited'))).toBeLessThanOrEqual(3);
    const source = toSourceValues(byId('mn-mnp-xh09-ban-thuong'));
    expect(source).toMatchObject({
      catalogKey: 'mn-mnp-xh09-ban-thuong',
      manufacturerSku: 'MNP-XH09',
      imageStatus: 'placeholder',
    });
    expect(source.imageSearchUrl).toMatch(/^https:\/\/www\.google\.com\/search/);
  });

  it("applies the owner's default box per brand and manufacturer code, and keeps estimates elsewhere", () => {
    expect(ownerRows).toHaveLength(89);
    const withOwnerRow = entries.filter((entry) => ownerCatalogDefaults(entry));
    expect(withOwnerRow).toHaveLength(76);
    for (const entry of entries) {
      const product = toProductValues(entry),
        owner = ownerCatalogDefaults(entry);
      if (!owner) {
        expect(product.packaging).toBeNull();
        expect(product).toMatchObject(estimatedPricing(entry));
        continue;
      }
      expect(parseProductPackaging(product.packaging)).toEqual({ value: product.packaging, error: null });
      expect(product.packaging).toMatchObject({
        lengthCm: owner.lengthCm,
        widthCm: owner.widthCm,
        heightCm: owner.heightCm,
        weightGram: owner.weightGram,
        fragile: true,
      });
      // The workbook's scale column is not applied (it disagrees with the researched scale of several codes).
      expect(product.scale).toBe(entry.scale && entry.scale !== 'N/A' ? entry.scale : null);
    }
    expect(toProductValues(byId('mn-mnp-xh01-ban-thuong')).packaging).toMatchObject({
      lengthCm: 30,
      widthCm: 15,
      heightCm: 10,
      weightGram: 3000,
    });
  });

  it("prices CD-01 from the owner's buy-in and member price through the catalogue formula", () => {
    const [cd01] = entries.filter((entry) => entry.sku === 'CD-01');
    const formula = catalogFormula(2_650_000, 0);
    expect(toProductValues(cd01)).toMatchObject({
      price: formula.listPriceVnd,
      importPrice: 2_200_000,
      pricingReferenceMemberVnd: 2_650_000,
      pricingIssueCount: 0,
      buybackPriceVnd: 2_200_000,
      packaging: { lengthCm: 30, widthCm: 20, heightCm: 15, weightGram: 4000 },
    });
    // Only CD-01 has figures in the workbook; every other row keeps the researched estimate.
    expect(entries.filter((entry) => ownerCatalogDefaults(entry)?.buyInVnd).map((entry) => entry.id)).toEqual([cd01.id]);
  });
});
