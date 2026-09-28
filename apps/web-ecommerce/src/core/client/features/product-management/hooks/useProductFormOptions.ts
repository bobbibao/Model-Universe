'use client';

import { useEffect, useState } from 'react';
import CategoryApi from '@/core/client/api/Category';
import SupplierApi, { SupplierOption } from '@/core/client/api/Supplier';
import type { Category } from '@/shared/types/product';

// Categories and active suppliers for the product form selects.
const useProductFormOptions = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  useEffect(() => {
    CategoryApi.getAdminCategories().then((result) => setCategories(result || []));
    SupplierApi.getSupplierOptions().then(setSuppliers);
  }, []);

  return { categories, suppliers };
};

export default useProductFormOptions;
