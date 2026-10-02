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
import AgentGatewayService from '../../core/server/services/AgentGatewayService';
import AgentTaskService from '../../core/server/services/AgentTaskService';
import ReturnService from '../../core/server/services/ReturnService';
import AgentSettingService from '../../core/server/services/AgentSettingService';
import ConsentLogService from '../../core/server/services/ConsentLogService';
import MarketService from '../../core/server/services/MarketService';
import MarketingCampaignService from '../../core/server/services/MarketingCampaignService';

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
  AgentGatewayService: AgentGatewayService;
  AgentTaskService: AgentTaskService;
  ReturnService: ReturnService;
  AgentSettingService: AgentSettingService;
  ConsentLogService: ConsentLogService;
  MarketService: MarketService;
  MarketingCampaignService: MarketingCampaignService;
};

export interface CommonServiceMethods {
  findByPk: (id: string | number) => Promise<any>;
  findAll: () => Promise<any[]>;
  deleteById: (id: string | number) => Promise<boolean>;
  insert: (data: any) => Promise<any>;
  bulkInsert: (data: any[]) => Promise<any[]>;
}
