export type StockImportItem = {
  id: number;
  productId: number;
  quantity: number;
  importPrice: number;
  product?: { id: number; name: string; sku: string; imageUrl: string };
};

export type StockImport = {
  id: number;
  supplierId: number;
  createdBy: number;
  note?: string | null;
  totalCost: number;
  createdAt: string;
  supplier?: { id: number; name: string; contactPhone?: string | null };
  creator?: { id: number; firstName: string; lastName: string; email: string };
  items?: StockImportItem[];
};

export type StockImportInput = {
  supplierId: number;
  note: string;
  items: { productId: number; quantity: number; importPrice: number }[];
};
