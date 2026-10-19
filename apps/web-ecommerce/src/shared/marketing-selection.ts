import type { MarketingDraftInput, MarketingOptions } from './types/admin-marketing';

export const selectedSkus = (input: MarketingDraftInput) => input.skus ?? (input.sku ? [input.sku] : []);
export const selectedMediaKeys = (input: MarketingDraftInput) =>
  input.mediaKeys ?? (input.assetId ? [`asset:${input.assetId}`] : input.sku ? [`product:${input.sku}`] : []);

export interface MarketingMediaOption {
  key: string;
  title: string;
  url: string;
  kind: 'image' | 'video';
  sku?: string;
}

export function marketingMediaOptions(options: MarketingOptions | undefined, skus: string[]): MarketingMediaOption[] {
  return [
    ...(options?.products ?? [])
      .filter((product) => skus.includes(product.sku))
      .flatMap((product) => [
        ...(product.imageUrl
          ? [
              {
                key: `product:${product.sku}`,
                title: product.name,
                url: product.imageUrl,
                kind: 'image' as const,
                sku: product.sku,
              },
            ]
          : []),
        ...(product.images ?? [])
          .filter((image) => image.url !== product.imageUrl)
          .map((image) => ({
            key: `image:${image.id}`,
            title: product.name,
            url: image.url,
            kind: 'image' as const,
            sku: product.sku,
          })),
      ]),
    ...(options?.assets ?? []).map((asset) => ({
      key: `asset:${asset.id}`,
      title: asset.title,
      url: asset.url,
      kind: asset.kind,
    })),
  ];
}
