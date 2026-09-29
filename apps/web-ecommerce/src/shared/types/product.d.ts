export type ProductGender = 'male' | 'female' | 'unisex';

export type SalesChannel = 'web' | 'outlet';

export type InventoryStatus = 'available' | 'quarantine' | 'donation_pending' | 'recycle';

// Effective price: `price` is the list price, `salePrice` what the customer pays (after a running discount).
export type ProductPricing = {
  salePrice: number;
  discountPercent: number;
  discountEndsAt: string | null;
};

export type Category = {
  id: number;
  name: string;
  slug: string;
  productCount?: number;
};

// Product card data returned by the storefront listing.
export type ProductSummary = ProductPricing & {
  id: number;
  name: string;
  brandName: string;
  gender: ProductGender;
  price: number;
  stock: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  salesChannel: SalesChannel;
  category?: Pick<Category, 'id' | 'name' | 'slug'>;
};

export type RatingDistribution = Record<'1' | '2' | '3' | '4' | '5', number>;

export type ProductDetail = ProductSummary & {
  sku: string;
  description?: string | null;
  availableSizes: string[];
  sold: number;
  productionDate?: string | null;
  weight?: string | null;
  dimensions?: string | null;
  categoryId: number;
  images: string[];
  ratingDistribution: RatingDistribution;
};

export type AdminProductListItem = ProductSummary & {
  sku: string;
  sold: number;
  importPrice: number;
  isArchived: boolean;
  inventoryStatus: InventoryStatus;
  createdAt: string;
};

export type AdminProduct = Omit<ProductDetail, 'ratingDistribution' | keyof ProductPricing> & {
  importPrice: number;
  isArchived: boolean;
  inventoryStatus: InventoryStatus;
  supplierId?: number | null;
  supplier?: Pick<Supplier, 'id' | 'name' | 'contactPhone'> | null;
};

export type Review = {
  id: number;
  rating: number;
  title: string;
  content?: string | null;
  location?: string | null;
  createdAt: string;
  author: string;
  authorAvatar?: string | null;
};

export type ProductFilterOptions = {
  brands: string[];
  priceRange: { min: number; max: number };
};

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'name' | 'best_selling' | 'rating';

export type ProductQuery = {
  q?: string;
  category?: string;
  gender?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  featured?: boolean;
  channel?: SalesChannel | '';
  sort?: ProductSort | '';
  page?: number;
  per_page?: number;
};

export type Supplier = {
  id: number;
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  logo?: string | null;
  isActive: boolean;
  createdAt?: string;
};

// Payload of the admin create/update product endpoints.
export type ProductPayload = {
  name: string;
  brandName: string;
  sku: string;
  description: string;
  gender: ProductGender;
  categoryId: number;
  supplierId: number | null;
  availableSizes: string[];
  price: number;
  importPrice: number;
  stock: number;
  weight: string;
  dimensions: string;
  productionDate: string | null;
  imageUrl: string;
  images: string[];
  isFeatured: boolean;
  isArchived: boolean;
  inventoryStatus: InventoryStatus;
};
