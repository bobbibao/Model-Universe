import Logger from '../../../../../shared/server/utils/logger';
import SupplierModel from '../models/Supplier.Model';

const SUPPLIERS = [
  {
    name: 'Công ty TNHH Thời trang Phương Nam',
    contactName: 'Nguyễn Văn Minh',
    contactPhone: '0283 845 1122',
    contactEmail: 'lienhe@phuongnamfashion.example.com',
    website: 'https://phuongnamfashion.example.com',
  },
  {
    name: 'Nhà phân phối Giày dép Sài Gòn',
    contactName: 'Trần Thị Hoa',
    contactPhone: '0903 112 233',
    contactEmail: 'sales@saigonfootwear.example.com',
    website: 'https://saigonfootwear.example.com',
  },
  {
    name: 'Global Sportswear Việt Nam',
    contactName: 'Lê Quốc Bảo',
    contactPhone: '0287 300 4455',
    contactEmail: 'vn@globalsportswear.example.com',
    website: 'https://globalsportswear.example.com',
  },
  {
    name: 'Hà Nội Textile',
    contactName: 'Phạm Thu Trang',
    contactPhone: '0243 766 8899',
    contactEmail: 'info@hanoitextile.example.com',
    website: 'https://hanoitextile.example.com',
  },
  {
    name: 'Phụ kiện Đông Á',
    contactName: 'Võ Thành Nam',
    contactPhone: '0912 456 789',
    contactEmail: 'order@dongaaccessories.example.com',
    website: 'https://dongaaccessories.example.com',
    isActive: false,
  },
];

export const seedSupplierData = async (): Promise<void> => {
  try {
    await SupplierModel.bulkCreate(SUPPLIERS);
    Logger.INFO(`${SUPPLIERS.length} suppliers seeded.`);
  } catch (error) {
    Logger.ERROR('Error seeding the supplier table:', error);
  }
};
