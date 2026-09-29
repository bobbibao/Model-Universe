import ConfigService from '../../core/server/services/ConfigService';
import AuthService from '../../core/server/services/AuthService';
import UserService from '../../core/server/services/UserService';
import CategoryService from '../../core/server/services/CategoryService';
import SupplierService from '../../core/server/services/SupplierService';
import ProductService from '../../core/server/services/ProductService';
import FileStorageService from '../../core/server/services/FileStorageService';
import ReviewService from '../../core/server/services/ReviewService';
import CartService from '../../core/server/services/CartService';
import WishlistService from '../../core/server/services/WishlistService';
import CouponService from '../../core/server/services/CouponService';
import OrderService from '../../core/server/services/OrderService';
import StockImportService from '../../core/server/services/StockImportService';
import DashboardService from '../../core/server/services/DashboardService';
import ContactMessageService from '../../core/server/services/ContactMessageService';
import ProductDiscountService from '../../core/server/services/ProductDiscountService';
import AgentActionService from '../../core/server/services/AgentActionService';
import AgentTaskService from '../../core/server/services/AgentTaskService';
import CiEventService from '../../core/server/services/CiEventService';
import CiConsoleService from '../../core/server/services/CiConsoleService';

export type ServiceTypeMap = {
  ConfigService: ConfigService;
  AuthService: AuthService;
  UserService: UserService;
  CategoryService: CategoryService;
  SupplierService: SupplierService;
  ProductService: ProductService;
  FileStorageService: FileStorageService;
  ReviewService: ReviewService;
  CartService: CartService;
  WishlistService: WishlistService;
  CouponService: CouponService;
  OrderService: OrderService;
  StockImportService: StockImportService;
  DashboardService: DashboardService;
  ContactMessageService: ContactMessageService;
  ProductDiscountService: ProductDiscountService;
  AgentActionService: AgentActionService;
  AgentTaskService: AgentTaskService;
  CiEventService: CiEventService;
  CiConsoleService: CiConsoleService;
};

export interface CommonServiceMethods {
  findByPk: (id: string | number) => Promise<any>;
  findAll: () => Promise<any[]>;
  deleteById: (id: string | number) => Promise<boolean>;
  insert: (data: any) => Promise<any>;
  bulkInsert: (data: any[]) => Promise<any[]>;
}
