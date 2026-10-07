import axios from 'axios';
import { randomUUID } from 'crypto';
import ProductService from './ProductService';
import CategoryService from './CategoryService';
import CartService, { normalizeCartItems } from './CartService';
import OrderService from './OrderService';
import WishlistService from './WishlistService';
import ReturnService, { RETURN_WINDOW_DAYS } from './ReturnService';
import ReviewService from './ReviewService';
import { signAgentActorToken } from '../../../shared/server/utils/JwtUtils';
import HttpError from '../../../shared/server/utils/HttpError';
import { customerPath, parseCustomerAction } from '../../../shared/customer-assistant-policy';
import type { AuthUser } from '../../../shared/server/types/express';
import type { AssistantReply, AssistantSource, CustomerAction } from '../../../shared/types/customer-assistant';
import type { ProductDetail, ProductSummary } from '../../../shared/types/product';
import type { OrderItem } from '../../../shared/types/order';

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw HttpError.badRequest('Mã dữ liệu không hợp lệ.');
  return value;
};
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const userRequired = (user?: AuthUser): number => {
  if (!user) throw new HttpError(401, 'Cần đăng nhập để đọc thông tin tài khoản của bạn.');
  return user.id;
};
const compact = (value: unknown): unknown => {
  if (typeof value === 'string') return value.slice(0, 1500);
  if (Array.isArray(value)) return value.slice(0, 8).map(compact);
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compact(item)]));
  return value;
};

export default class CustomerAssistantService {
  private products = new ProductService();

  // A fixed stateless endpoint, signed as a customer even when the shopper is an admin.
  // No browser-supplied thread id, graph name, actor role or URL is forwarded.
  async decide(subject: string, request: Json): Promise<Json> {
    try {
      const token = await signAgentActorToken(subject, 'customer');
      const url = (process.env.AGENT_SERVER_URL || 'http://localhost:2024').replace(/\/$/, '');
      const response = await axios.post(
        `${url}/runs/wait`,
        {
          assistant_id: 'customer_assistant',
          input: { request },
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 90000, maxContentLength: 200000 },
      );
      if (!object(response.data?.decision)) throw new Error('Invalid customer decision');
      return response.data.decision;
    } catch {
      throw new HttpError(
        503,
        'Agent đang bận hoặc chưa kết nối. Bạn có thể thử lại hoặc tiếp tục mua sắm bằng các nút bên dưới.',
      );
    }
  }

  async chat(user: AuthUser | undefined, raw: unknown): Promise<AssistantReply> {
    if (!object(raw) || typeof raw.message !== 'string' || !raw.message.trim() || raw.message.length > 3000)
      throw HttpError.badRequest('Nhập yêu cầu tối đa 3.000 ký tự.');
    const message = raw.message.trim();
    const history = Array.isArray(raw.history)
      ? raw.history
          .slice(-8)
          .flatMap((h) =>
            object(h) && ['user', 'assistant'].includes(String(h.role))
              ? [{ role: h.role, text: text(h.text, 1000) }]
              : [],
          )
      : [];
    const path = customerPath(raw.path) || '/';
    const cart = normalizeCartItems(raw.cart);
    const research = raw.research === true;
    const subject = user ? `user:${user.id}` : `guest:${randomUUID()}`;
    const observations: unknown[] = [];
    const known = new Map<number, ProductSummary>();
    const sources = new Map<string, AssistantSource>();
    const source = (label: string, route: string) => sources.set(route, { label, path: route });
    const remember = (p: ProductSummary) => {
      known.set(p.id, p);
      source(p.name, `/shop/product/${p.id}`);
    };
    const currentProduct = path.match(/^\/shop\/product\/(\d+)$/);
    if (currentProduct) {
      try {
        const product = await this.products.getPublicById(Number(currentProduct[1]));
        remember(product);
        observations.push({ kind: 'current_product', data: compact(product) });
      } catch {
        /* unavailable */
      }
    }
    let decision: Json = {};
    const seen = new Set<string>();
    const rounds = research ? 5 : 3;
    const deadline = Date.now() + 180000;
    for (let round = 0; round <= rounds; round++) {
      const readsAllowed = round < rounds && Date.now() < deadline;
      decision = await this.decide(subject, {
        message,
        history,
        research,
        path,
        cart,
        loggedIn: !!user,
        readsAllowed,
        observations,
        catalog: Array.from(known.values())
          .slice(-8)
          .map((p) => {
            const detail = p as Partial<ProductDetail>;
            return {
              id: p.id,
              name: p.name,
              brand: p.brandName,
              salePrice: p.salePrice,
              stock: p.stock,
              rating: p.rating,
              reviewCount: p.reviewCount,
              sizes: detail.availableSizes,
              description: detail.description?.slice(0, 400),
              weight: detail.weight,
              dimensions: detail.dimensions,
            };
          }),
        customer: user ? { firstName: user.firstName, lastName: user.lastName } : null,
      });
      const reads = Array.isArray(decision.reads) ? decision.reads.slice(0, 4).filter(object) : [];
      if (!readsAllowed || !reads.length) break;
      let executed = false;
      for (const read of reads) {
        const signature = JSON.stringify(read);
        if (seen.has(signature)) continue;
        seen.add(signature);
        executed = true;
        try {
          const data = await this.read(user, read, cart);
          // All returned product cards and source URLs come from public service reads, never from the LLM.
          if (read.kind === 'search_products' && object(data) && Array.isArray(data.products))
            data.products.forEach(remember);
          if (read.kind === 'product_details') remember(data as ProductDetail);
          if (read.kind === 'product_reviews')
            source(`Đánh giá sản phẩm #${read.productId}`, `/shop/product/${read.productId}`);
          if (read.kind === 'store_policies') source('Hỗ trợ và chính sách cửa hàng', '/contact');
          if (['my_orders', 'my_order', 'return_options'].includes(String(read.kind)))
            source('Đơn hàng của bạn', '/order-history');
          if (read.kind === 'my_wishlist') source('Danh sách yêu thích', '/wishlist');
          observations.push({ tool: read, data: compact(JSON.parse(JSON.stringify(data))) });
        } catch (error) {
          // Do not expose SQL/model/server errors in model context.
          observations.push({
            tool: read,
            error: error instanceof HttpError ? error.message : 'Không đọc được dữ liệu này.',
          });
        }
      }
      while (JSON.stringify(observations).length > 18000 && observations.length > 1) observations.shift();
      if (!executed) {
        decision = await this.decide(subject, {
          message,
          history,
          research,
          path,
          cart,
          loggedIn: !!user,
          readsAllowed: false,
          observations,
        });
        break;
      }
    }
    const actions: CustomerAction[] = [];
    for (const rawAction of Array.isArray(decision.actions) ? decision.actions.slice(0, 4) : []) {
      const action = parseCustomerAction(rawAction);
      if (!action) continue;
      try {
        if (['cart_add', 'cart_update', 'wishlist_add', 'review'].includes(action.kind)) {
          const product = await this.products.getPublicById(action.productId!);
          action.product = product;
          remember(product);
        }
        // Verify customer ownership before even presenting identifiers in a write proposal.
        if (action.kind === 'cancel_order' || action.kind === 'return_request') {
          const order = await new OrderService().getForUser(userRequired(user), action.orderId!);
          action.orderTotal = order.total;
          if (action.kind === 'cancel_order' && order.status !== 'PROCESSING') continue;
          if (action.kind === 'return_request') {
            const info = await new ReturnService().getForOrder(userRequired(user), action.orderId!);
            if (!info.canRequest) continue;
            const ordered = order.get('items') as OrderItem[];
            action.returnLines = info.lines.flatMap((line) => {
              const item = ordered.find((i) => i.id === line.orderItemId);
              return item && line.returnable > 0
                ? [{ orderItemId: item.id, name: item.productName, size: item.size, maxQuantity: line.returnable }]
                : [];
            });
            if (
              !action.returnItems?.every((i) =>
                action.returnLines!.some(
                  (line) => line.orderItemId === i.orderItemId && i.quantity <= line.maxQuantity,
                ),
              )
            )
              continue;
          }
        }
        if (action.kind === 'wishlist_remove') {
          const wishlist = await new WishlistService().list(userRequired(user));
          if (!wishlist.some((item) => item.id === action.wishlistItemId)) continue;
        }
        actions.push(action);
      } catch {
        /* Invalid or inaccessible proposals never reach the browser. */
      }
    }
    const ids = Array.isArray(decision.productIds) ? decision.productIds : [];
    const cards = ids.length
      ? ids.map((i) => known.get(Number(i))).filter((p): p is ProductSummary => !!p)
      : Array.from(known.values()).slice(0, 4);
    return {
      answer:
        text(decision.answer, 12000) ||
        'Mình có thể giúp bạn tìm sản phẩm, so sánh lựa chọn và chuẩn bị các thao tác. Bạn muốn bắt đầu từ đâu?',
      products: Array.from(new Map(cards.map((p) => [p.id, p])).values()).slice(0, 8),
      sources: Array.from(sources.values()).slice(0, 16),
      actions,
      research,
    };
  }

  async read(user: AuthUser | undefined, read: Json, cart: ReturnType<typeof normalizeCartItems>): Promise<unknown> {
    const page =
      typeof read.page === 'number' && Number.isInteger(read.page) ? Math.max(1, Math.min(100, read.page)) : 1;
    switch (read.kind) {
      case 'search_products': {
        const sorts = ['newest', 'price_asc', 'price_desc', 'name', 'best_selling', 'rating'];
        const result = await this.products.listPublic({
          q: text(read.q, 160),
          brand: text(read.brand, 100),
          category: text(read.category, 100),
          gender: ['male', 'female', 'unisex'].includes(String(read.gender)) ? String(read.gender) : undefined,
          inStock: read.inStock === true,
          channel: ['web', 'outlet'].includes(String(read.channel)) ? String(read.channel) : undefined,
          minPrice: typeof read.minPrice === 'number' && read.minPrice >= 0 ? read.minPrice : undefined,
          maxPrice: typeof read.maxPrice === 'number' && read.maxPrice >= 0 ? read.maxPrice : undefined,
          sort: sorts.includes(String(read.sort)) ? String(read.sort) : 'best_selling',
          limit: 8,
          offset: (page - 1) * 8,
        });
        return { products: result.rows, count: result.count, page };
      }
      case 'product_details':
        return this.products.getPublicById(id(read.productId));
      case 'product_reviews':
        return this.products.getReviews(id(read.productId), 8, (page - 1) * 8);
      case 'catalog_filters':
        return { ...(await this.products.getFilterOptions()), categories: await new CategoryService().listPublic() };
      case 'cart_quote':
        return new CartService().quote(cart);
      case 'store_policies':
        return {
          payment: 'Thanh toán khi nhận hàng (COD).',
          shippingFeeVnd: 0,
          cancellation: 'Chỉ có thể hủy đơn đang xử lý, trước khi giao.',
          returns: `Yêu cầu trả hàng trong ${RETURN_WINDOW_DAYS} ngày kể từ ngày giao; kiểm tra điều kiện từng đơn bằng return_options.`,
          reviews: 'Chỉ người mua có đơn đã giao mới được đánh giá, mỗi sản phẩm một đánh giá.',
          supportPath: '/contact',
          unknown: 'Không có dữ liệu xác thực về thời gian giao hàng hoặc bảo hành; hãy hỏi cửa hàng.',
        };
      case 'my_orders': {
        const result = await new OrderService().listForUser(userRequired(user), 5, (page - 1) * 5);
        // Research does not need addresses, phone numbers or marketing attribution.
        return {
          count: result.count,
          orders: result.rows.map((o) => ({
            id: o.id,
            status: o.status,
            total: o.total,
            createdAt: o.createdAt,
            items: o.get('items'),
          })),
        };
      }
      case 'my_order': {
        const o = await new OrderService().getForUser(userRequired(user), id(read.orderId));
        return { id: o.id, status: o.status, total: o.total, createdAt: o.createdAt, items: o.get('items') };
      }
      case 'my_wishlist':
        return new WishlistService().list(userRequired(user));
      case 'return_options':
        return new ReturnService().getForOrder(userRequired(user), id(read.orderId));
      case 'review_eligibility':
        return new ReviewService().getEligibility(userRequired(user), id(read.productId));
      default:
        throw HttpError.badRequest('Agent yêu cầu công cụ không được hỗ trợ.');
    }
  }
}
