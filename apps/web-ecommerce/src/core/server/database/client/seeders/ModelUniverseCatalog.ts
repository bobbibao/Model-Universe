import type { Transaction } from 'sequelize';
import CategoryModel from '../models/Category.Model';
import ProductModel from '../models/Product.Model';
import ProductImageModel from '../models/ProductImage.Model';
import ProductSourceModel, { IMAGE_STATUSES, ImageStatus } from '../models/ProductSource.Model';
import { CATEGORIES } from './Category.Seeder';
import { hash } from './SeedCatalog';
import type { AssemblyState } from '../../../../../shared/gunpla';
import type { ProductPackaging } from '../../../../../shared/packing/rules';
import { catalogFormula } from '../../../../../shared/sale-pricing';
// Imported (not read from disk) so the compiled server carries it too. Source of truth for the third-party mecha
// catalog; docs/model_universe_seed.md is the human-readable tracking sheet generated alongside it.
import catalog from './data/model-universe-catalog.json';
// The owner's workbook "Danh mục 6 hãng" (docs/business/source/vi/catalog-6-brands-sheet.md), one row per manufacturer
// code: the default retail box and weight, and the real buy-in B and member price S where the owner filled them in.
import ownerDefaults from './data/catalog-6-brands-defaults.json';

// One variant (color or packaging) of one model, as researched in docs/model_universe_seed.md.
export interface CatalogEntry {
  id: string;
  brand: string;
  sku: string | null;
  name: string;
  variant: string | null;
  series: string | null;
  scale: string | null;
  product_type: string;
  price_vnd: number;
  price_source: string;
  image_url: string;
  image_status: ImageStatus;
  image_alt_url: string | null;
  image_search_url: string | null;
  image_source_url: string | null;
  retailer_sku: string | null;
  verification: string | null;
  source_url: string | null;
  notes: string | null;
}

interface ProductTypeInfo {
  category: string;
  assemblyState: AssemblyState;
  en: string;
  vi: string;
}

const KIT: ProductTypeInfo = {
  category: 'mecha-model-kits',
  assemblyState: 'unassembled',
  en: 'Plastic model kit; assembly required',
  vi: 'Kit nhựa lắp ráp; cần tự lắp',
};
const PRODUCT_TYPES: Record<string, ProductTypeInfo> = {
  'Kit lắp ráp': KIT,
  'Figure hợp kim hoàn thiện': {
    category: 'alloy-figures',
    assemblyState: 'assembled',
    en: 'Finished die-cast alloy figure',
    vi: 'Figure hợp kim hoàn thiện',
  },
  'Figure hoàn thiện': {
    category: 'alloy-figures',
    assemblyState: 'assembled',
    en: 'Finished action figure',
    vi: 'Figure hoàn thiện',
  },
  'Figure / SD': {
    category: 'alloy-figures',
    assemblyState: 'assembled',
    en: 'Finished SD figure',
    vi: 'Figure SD hoàn thiện',
  },
};

const STANDARD_VARIANT = 'Bản thường';
const LIMITED_VARIANT = /limited|giới hạn|event|\bWF\b|GMHS|expo|special/i;
const IMPORT_PRICE_RATIO = 0.6;

const roundToThousand = (amount: number) => Math.round(amount / 1000) * 1000;

export const loadCatalogEntries = (): CatalogEntry[] => catalog as CatalogEntry[];

export interface OwnerCatalogDefaults {
  manufacturerSku: string;
  brand: string;
  scale: string | null;
  weightGram: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  buyInVnd: number | null;
  memberPriceVnd: number | null;
}
const OWNER_DEFAULTS = new Map(
  (ownerDefaults as OwnerCatalogDefaults[]).map((row) => [`${row.brand}|${row.manufacturerSku}`, row]),
);

// The owner's row for a catalog entry, matched on brand and manufacturer code (every variant of a code shares the box).
export const ownerCatalogDefaults = (entry: Pick<CatalogEntry, 'brand' | 'sku'>): OwnerCatalogDefaults | null =>
  (entry.sku && OWNER_DEFAULTS.get(`${entry.brand}|${entry.sku}`)) || null;

// The researched estimates a catalog row is seeded with when the owner gave no figure.
export const estimatedPricing = (entry: CatalogEntry) => ({
  price: entry.price_vnd,
  importPrice: roundToThousand(entry.price_vnd * IMPORT_PRICE_RATIO),
});

// What the owner's workbook fixes for a product: the box the package optimizer uses (models ship fragile and flat), and,
// when both B and S are filled in, the actual cost and the list price derived from S by the catalogue formula. The
// workbook's scale column is not applied: it disagrees with the researched scale of several codes (see the sheet notes).
export const ownerCatalogValues = (entry: CatalogEntry) => {
  const owner = ownerCatalogDefaults(entry);
  if (!owner) return null;
  const packaging: ProductPackaging = {
    lengthCm: owner.lengthCm,
    widthCm: owner.widthCm,
    heightCm: owner.heightCm,
    weightGram: owner.weightGram,
    fragile: true,
    orientation: 'flat',
  };
  const formula = owner.buyInVnd && owner.memberPriceVnd ? catalogFormula(owner.memberPriceVnd, 0) : null;
  return {
    packaging,
    pricing: formula
      ? {
          price: formula.listPriceVnd,
          importPrice: owner.buyInVnd as number,
          pricingReferenceMemberVnd: formula.referenceMemberVnd,
          pricingIssueCount: 0,
          buybackPriceVnd: formula.buybackPriceVnd,
        }
      : null,
  };
};

export const productTypeInfo = (entry: CatalogEntry): ProductTypeInfo => {
  const info = PRODUCT_TYPES[entry.product_type];
  if (!info) throw new Error(`Unknown catalog product type "${entry.product_type}" (${entry.id})`);
  return info;
};

// The shop SKU: unique and stable per catalog row (manufacturer codes repeat across variants or are unknown).
export const shopSku = (entry: CatalogEntry): string => `MU-${entry.id.toUpperCase()}`;

// Deterministic shelf stock: limited and event editions are scarce.
export const catalogStock = (entry: CatalogEntry): number => {
  const bucket = hash(entry.id);
  return LIMITED_VARIANT.test(entry.variant || '') ? 1 + (bucket % 3) : 2 + (bucket % 11);
};

const describe = (entry: CatalogEntry, info: ProductTypeInfo) => {
  const scale = entry.scale && entry.scale !== 'N/A' ? entry.scale : null;
  const variantEn = !entry.variant || entry.variant === STANDARD_VARIANT ? 'Standard edition' : entry.variant;
  const variantVi = entry.variant || STANDARD_VARIANT;
  const series = entry.series ? ` from the ${entry.series} line` : '';
  const seriesVi = entry.series ? `, thuộc dòng ${entry.series}` : '';
  return {
    descriptionEn: [
      `${entry.brand} ${entry.name}, ${variantEn}.`,
      `${info.en}, ${scale ? `${scale} scale` : 'non-scale'}${series}.`,
      entry.sku ? `Manufacturer code ${entry.sku}.` : 'Manufacturer code not yet verified.',
      'Price and stock are catalog estimates; confirm the box, contents and price before a real sale.',
    ].join(' '),
    descriptionVi: [
      `${entry.brand} ${entry.name}, ${variantVi}.`,
      `${info.vi}, ${scale ? `tỷ lệ ${scale}` : 'không theo tỷ lệ'}${seriesVi}.`,
      entry.sku ? `Mã hãng ${entry.sku}.` : 'Mã hãng chưa xác minh.',
      'Giá và tồn kho là số liệu ước tính; cần kiểm tra hộp, phụ kiện và giá trước khi bán thật.',
    ].join(' '),
  };
};

// Product columns for a catalog row (without categoryId and the seed-history fields).
export const toProductValues = (entry: CatalogEntry) => {
  const info = productTypeInfo(entry);
  const variant = entry.variant && entry.variant !== STANDARD_VARIANT ? ` — ${entry.variant}` : '';
  const { descriptionEn, descriptionVi } = describe(entry, info);
  const owner = ownerCatalogValues(entry);
  return {
    sku: shopSku(entry),
    name: `${entry.brand} ${entry.sku ? `${entry.sku} ` : ''}${entry.name}${variant}`,
    brandName: entry.brand,
    description: descriptionEn,
    descriptionEn,
    descriptionVi,
    grade: null,
    scale: entry.scale && entry.scale !== 'N/A' ? entry.scale : null,
    series: entry.series,
    modelCode: entry.sku,
    condition: 'new' as const,
    assemblyState: info.assemblyState,
    includedAccessories: [],
    defects: [],
    gender: 'unisex' as const,
    availableSizes: [],
    ...(owner?.pricing ?? estimatedPricing(entry)),
    packaging: owner?.packaging ?? null,
    stock: catalogStock(entry),
    imageUrl: entry.image_url,
    isFeatured: false,
    isArchived: false,
  };
};

export const toSourceValues = (entry: CatalogEntry) => ({
  catalogKey: entry.id,
  manufacturerSku: entry.sku,
  variantName: entry.variant,
  productType: entry.product_type,
  imageStatus: entry.image_status,
  imageSourceUrl: entry.image_source_url,
  imageSearchUrl: entry.image_search_url,
  retailerSku: entry.retailer_sku,
  verification: entry.verification,
  sourceUrl: entry.source_url,
  priceSource: entry.price_source,
  notes: entry.notes,
});

// Fails on the first row that would break the catalog's invariants, before anything is written.
export const assertCatalogValid = (entries: CatalogEntry[]): void => {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(entry.id)) throw new Error(`Duplicate catalog key ${entry.id}`);
    keys.add(entry.id);
    productTypeInfo(entry);
    if (!Number.isInteger(entry.price_vnd) || entry.price_vnd <= 0) throw new Error(`Invalid price for ${entry.id}`);
    if (!IMAGE_STATUSES.includes(entry.image_status)) throw new Error(`Invalid image status for ${entry.id}`);
    if (!/^https:\/\//.test(entry.image_url)) throw new Error(`Invalid image URL for ${entry.id}`);
  }
};

// Seed-history fields a fresh development seed adds (backdated creation, prior sales, a supplier).
export type ProductHistory = (sku: string) => { createdAt?: Date; sold?: number; supplierId?: number | null };

export interface CatalogImportResult {
  created: number;
  skipped: number;
}

// Creates a product (with its gallery and provenance row) for every catalog row not imported yet. Rows already
// imported are left untouched, so staff edits to price, stock or text survive a re-run. All rows or none.
export const importModelUniverseCatalog = async (history?: ProductHistory): Promise<CatalogImportResult> => {
  const entries = loadCatalogEntries();
  assertCatalogValid(entries);
  const sequelize = ProductModel.sequelize;
  if (!sequelize) throw new Error('The database is not initialized.');

  return sequelize.transaction(async (transaction: Transaction) => {
    const categoryIdBySlug = new Map<string, number>();
    for (const slug of new Set(entries.map((entry) => productTypeInfo(entry).category))) {
      const definition = CATEGORIES.find((category) => category.slug === slug);
      if (!definition) throw new Error(`Category ${slug} is not defined in Category.Seeder`);
      const [category] = await CategoryModel.findOrCreate({ where: { slug }, defaults: definition, transaction });
      categoryIdBySlug.set(slug, category.id);
    }

    const imported = new Set(
      (await ProductSourceModel.findAll({ attributes: ['catalogKey'], transaction })).map(
        (source) => source.catalogKey,
      ),
    );
    let created = 0;
    for (const entry of entries.filter((item) => !imported.has(item.id))) {
      const values = toProductValues(entry);
      const extra = history ? history(values.sku) : {};
      const backdated = extra.createdAt ? { updatedAt: extra.createdAt } : {};
      const product = await ProductModel.create(
        { ...values, ...extra, ...backdated, categoryId: categoryIdBySlug.get(productTypeInfo(entry).category) },
        { transaction, silent: Boolean(extra.createdAt) },
      );
      if (entry.image_alt_url) {
        await ProductImageModel.create(
          { productId: product.id, url: entry.image_alt_url, sortOrder: 0 },
          { transaction },
        );
      }
      await ProductSourceModel.create({ productId: product.id, ...toSourceValues(entry) }, { transaction });
      created++;
    }
    return { created, skipped: entries.length - created };
  });
};
