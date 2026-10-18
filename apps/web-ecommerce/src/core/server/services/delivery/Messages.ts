import { formatVND } from '../../../../shared/server/utils/utils';
import { shopPublicUrl } from '../marketing/platforms';

// Texts for people are Vietnamese (the specification's templates); placeholders are filled from the committed order,
// shipment or request, never from client input.

const vnd = (amount: number) => formatVND(amount, 'vi');
const lines = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join('\n');

export const orderUrl = () => `${shopPublicUrl()}/vi/order-history`;
export const adminOrderUrl = (orderId: number) => `${shopPublicUrl()}/vi/admin/orders/${orderId}`;
export const buybackUrl = () => `${shopPublicUrl()}/vi/services/sell`;
export const formatMeetingTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })
    : '';

export interface OrderFacts {
  orderCode: string;
  customerName: string;
  customerPhone: string;
  productSummary: string;
  productTotalVnd: number;
  confirmedPaidVnd: number;
  remainingVnd: number;
}

export const adminMeetingDeposited = (
  order: OrderFacts,
  meetingAddress: string,
  requestedTime: string,
  orderId: number,
) => ({
  title: 'MODEL universe – ĐƠN GDTT MỚI',
  content: lines(
    `Mã đơn: ${order.orderCode}`,
    `Khách hàng: ${order.customerName}`,
    `Số điện thoại: ${order.customerPhone}`,
    `Sản phẩm: ${order.productSummary}`,
    `Giá trị đơn: ${vnd(order.productTotalVnd)}`,
    `Đã cọc: ${vnd(order.confirmedPaidVnd)}`,
    `Còn lại: ${vnd(order.remainingVnd)}`,
    `Địa điểm GDTT đề xuất: ${meetingAddress}`,
    `Thời gian mong muốn: ${requestedTime}`,
    'Trạng thái: Chờ xác nhận lịch giao dịch.',
    `Xem đơn: ${adminOrderUrl(orderId)}`,
  ),
});

export const adminCodDeposited = (order: OrderFacts, recipientAddress: string, orderId: number) => ({
  title: 'MODEL universe – ĐƠN SHIP COD MỚI',
  content: lines(
    `Mã đơn: ${order.orderCode}`,
    `Khách hàng: ${order.customerName}`,
    `Sản phẩm: ${order.productSummary}`,
    `Giá trị đơn: ${vnd(order.productTotalVnd)}`,
    `Đã thanh toán: ${vnd(order.confirmedPaidVnd)}`,
    `COD sản phẩm dự kiến: ${vnd(order.remainingVnd)}`,
    `Địa chỉ nhận: ${recipientAddress}`,
    'Trạng thái: Chờ tạo vận đơn.',
    `Xem đơn: ${adminOrderUrl(orderId)}`,
  ),
});

export const adminShipmentCreated = (
  order: Pick<OrderFacts, 'orderCode' | 'customerName'>,
  shipment: {
    carrierName: string;
    trackingNumber: string;
    codAmountVnd: number;
    shippingFeeVnd: number;
    status: string;
    trackingUrl: string;
  },
  orderId: number,
) => ({
  title: 'MODEL universe – TẠO VẬN ĐƠN THÀNH CÔNG',
  content: lines(
    `Mã đơn: ${order.orderCode}`,
    `Đơn vị vận chuyển: ${shipment.carrierName}`,
    `Mã vận đơn: ${shipment.trackingNumber}`,
    `Khách hàng: ${order.customerName}`,
    `COD: ${vnd(shipment.codAmountVnd)}`,
    `Phí vận chuyển: ${vnd(shipment.shippingFeeVnd)}`,
    `Trạng thái: ${shipment.status}`,
    `Theo dõi: ${shipment.trackingUrl}`,
    `Xem đơn: ${adminOrderUrl(orderId)}`,
  ),
});

export const adminShipmentFailed = (orderCode: string, error: string, orderId: number) => ({
  title: 'MODEL universe – CẢNH BÁO TẠO VẬN ĐƠN',
  content: lines(
    `Mã đơn: ${orderCode}`,
    `Lỗi: ${error}`,
    'Trạng thái: Cần nhân viên kiểm tra.',
    `Xem đơn: ${adminOrderUrl(orderId)}`,
  ),
});

export const adminDeliveryFailed = (orderCode: string, trackingNumber: string, reason: string, orderId: number) => ({
  title: 'MODEL universe – GIAO HÀNG THẤT BẠI',
  content: lines(
    `Mã đơn: ${orderCode}`,
    `Mã vận đơn: ${trackingNumber}`,
    `Lý do: ${reason}`,
    'Trạng thái: Chờ xử lý.',
    `Xem đơn: ${adminOrderUrl(orderId)}`,
  ),
});

export const adminMeetingChange = (orderCode: string, address: string, time: string, orderId: number) => ({
  title: 'MODEL universe – KHÁCH ĐỀ NGHỊ ĐỔI LỊCH GDTT',
  content: lines(
    `Mã đơn: ${orderCode}`,
    `Địa điểm đề xuất: ${address}`,
    `Thời gian đề xuất: ${time}`,
    `Xem đơn: ${adminOrderUrl(orderId)}`,
  ),
});

export const emailMeetingDeposit = (order: OrderFacts, meetingAddress: string, requestedTime: string) => ({
  subject: `Đã xác nhận cọc đơn GDTT ${order.orderCode}`,
  body: lines(
    `Xin chào ${order.customerName},`,
    '',
    `MODEL universe đã xác nhận khoản thanh toán trước cho đơn hàng ${order.orderCode} của bạn.`,
    '',
    'Thông tin đơn hàng',
    `- Sản phẩm: ${order.productSummary}`,
    `- Tổng giá trị sản phẩm: ${vnd(order.productTotalVnd)}`,
    `- Đã thanh toán: ${vnd(order.confirmedPaidVnd)}`,
    `- Số tiền còn lại: ${vnd(order.remainingVnd)}`,
    `- Địa điểm giao dịch đề xuất: ${meetingAddress}`,
    `- Thời gian mong muốn: ${requestedTime}`,
    '',
    'Shop sẽ kiểm tra và xác nhận lịch giao dịch với bạn.',
    'Bạn vui lòng chỉ đến địa điểm giao dịch sau khi lịch hẹn đã được xác nhận.',
    '',
    `Xem đơn hàng: ${orderUrl()}`,
    '',
    'Cảm ơn bạn đã lựa chọn MODEL universe!',
  ),
});

export const emailCodDeposit = (order: OrderFacts) => ({
  subject: `Xác nhận đơn hàng ${order.orderCode}`,
  body: lines(
    `Xin chào ${order.customerName},`,
    '',
    `MODEL universe đã xác nhận khoản thanh toán trước cho đơn hàng ${order.orderCode}.`,
    '',
    'Thông tin thanh toán:',
    `- Tổng giá trị sản phẩm: ${vnd(order.productTotalVnd)}`,
    `- Tổng đã thanh toán: ${vnd(order.confirmedPaidVnd)}`,
    `- Số tiền sản phẩm còn lại: ${vnd(order.remainingVnd)}`,
    '',
    'Đơn hàng đang được chuẩn bị để tạo vận đơn.',
    'Mã vận đơn sẽ được gửi cho bạn ngay khi đơn vị vận chuyển nhận đơn.',
    '',
    `Xem đơn: ${orderUrl()}`,
    '',
    'Cảm ơn bạn đã mua sắm tại MODEL universe!',
  ),
});

export const orderTrackingUrl = (orderId?: number) =>
  `${shopPublicUrl()}/vi/order-history${orderId ? `?order=${orderId}` : ''}`;

const STATUS_TEXT: Record<string, string> = {
  CREATED: 'Đã tạo vận đơn',
  AWAITING_PICKUP: 'Chờ lấy hàng',
  PICKED_UP: 'Đã lấy hàng',
  IN_TRANSIT: 'Đang vận chuyển',
  OUT_FOR_DELIVERY: 'Đang giao hàng',
  DELIVERED: 'Giao hàng thành công',
  DELIVERY_FAILED: 'Giao hàng không thành công',
  RETURNING: 'Đang hoàn hàng về shop',
  RETURNED: 'Đã hoàn hàng về shop',
  CANCELLED: 'Đã hủy vận đơn',
  EXCEPTION: 'Đơn hàng gặp sự cố, shop đang xử lý',
};
export const shipmentStatusText = (status: string) => STATUS_TEXT[status] || status;

export const emailShipmentCreated = (
  orderCode: string,
  customerName: string,
  shipment: {
    carrierName: string;
    trackingNumber: string;
    status: string;
    codAmountVnd: number;
    trackingUrl: string;
    estimatedDelivery?: string | null;
  },
) => ({
  subject: `Đơn ${orderCode} đã có mã vận đơn ${shipment.carrierName} ${shipment.trackingNumber}`,
  body: lines(
    `Xin chào ${customerName},`,
    '',
    `Đơn hàng ${orderCode} của bạn đã được tạo vận đơn với ${shipment.carrierName}.`,
    '',
    'Thông tin vận chuyển',
    `- Mã đơn hàng: ${orderCode}`,
    `- Đơn vị vận chuyển: ${shipment.carrierName}`,
    `- Mã vận đơn: ${shipment.trackingNumber}`,
    `- Trạng thái: ${shipment.status}`,
    `- Số tiền thu khi nhận hàng (COD): ${vnd(shipment.codAmountVnd)}`,
    shipment.estimatedDelivery ? `- Thời gian giao dự kiến: ${shipment.estimatedDelivery}` : null,
    '',
    `Theo dõi đơn hàng: ${shipment.trackingUrl}`,
    `Theo dõi trong tài khoản: ${orderTrackingUrl()}`,
    '',
    'Lưu ý: Đơn đã có mã vận đơn nhưng đơn vị vận chuyển có thể chưa đến lấy hàng. Trạng thái sẽ được cập nhật theo hành trình thực tế.',
    '',
    'Cảm ơn bạn đã tin tưởng MODEL universe!',
  ),
});

export const emailShipmentStatus = (
  orderCode: string,
  customerName: string,
  carrierName: string,
  trackingNumber: string,
  statusText: string,
  trackingUrl: string,
  reason?: string | null,
) => ({
  subject: `Đơn ${orderCode}: ${statusText}`,
  body: lines(
    `Xin chào ${customerName},`,
    '',
    `Cập nhật đơn hàng ${orderCode} (mã vận đơn ${carrierName} ${trackingNumber}):`,
    `- Trạng thái: ${statusText}`,
    reason ? `- Ghi chú từ đơn vị vận chuyển: ${reason}` : null,
    '',
    `Theo dõi đơn hàng: ${trackingUrl}`,
    `Theo dõi trong tài khoản: ${orderTrackingUrl()}`,
    '',
    'Cần hỗ trợ? Hãy trả lời email này hoặc liên hệ MODEL universe.',
  ),
});

export const emailMeetingConfirmed = (
  orderCode: string,
  customerName: string,
  address: string,
  time: string,
  remainingVnd: number,
) => ({
  subject: `Xác nhận lịch giao dịch đơn ${orderCode}`,
  body: lines(
    `Xin chào ${customerName},`,
    '',
    'MODEL universe xác nhận lịch giao dịch trực tiếp của bạn như sau:',
    `- Mã đơn: ${orderCode}`,
    `- Địa điểm: ${address}`,
    `- Thời gian: ${time}`,
    `- Số tiền còn lại: ${vnd(remainingVnd)}`,
    '',
    'Bạn vui lòng mang theo mã đơn hàng và mã nhận hàng hiển thị trong tài khoản để nhân viên kiểm tra khi giao dịch.',
    'Nếu cần thay đổi lịch hẹn, vui lòng gửi yêu cầu qua website trước thời gian giao dịch.',
    '',
    'Cảm ơn bạn!',
  ),
});

export const emailDeliveryFailed = (
  orderCode: string,
  customerName: string,
  trackingNumber: string,
  reason: string,
) => ({
  subject: `Đơn ${orderCode} chưa được giao thành công`,
  body: lines(
    `Xin chào ${customerName},`,
    '',
    'Đơn hàng chưa được giao thành công',
    `Mã đơn: ${orderCode}`,
    `Mã vận đơn: ${trackingNumber}`,
    `Lý do: ${reason}`,
    '',
    'Vui lòng kiểm tra thông tin giao hàng hoặc liên hệ bộ phận hỗ trợ MODEL universe.',
    `Xem đơn hàng: ${orderUrl()}`,
  ),
});

export const emailBuybackReceived = (
  code: string,
  customerName: string,
  productName: string,
  receivedAt: string,
  estimateVnd: number | null,
) => ({
  subject: `Đã nhận sản phẩm thu mua ${code}`,
  body: lines(
    `Xin chào ${customerName},`,
    '',
    `MODEL universe đã nhận được kiện hàng liên quan đến yêu cầu thu mua ${code}.`,
    '',
    'Thông tin:',
    `- Sản phẩm: ${productName}`,
    `- Mã yêu cầu: ${code}`,
    `- Ngày nhận: ${receivedAt}`,
    `- Giá thu dự kiến: ${estimateVnd !== null ? vnd(estimateVnd) : 'Shop định giá thủ công'}`,
    '',
    'Shop sẽ tiến hành quay video mở kiện, kiểm tra tình trạng sản phẩm và đối chiếu toàn bộ phụ kiện với thông tin bạn đã khai báo.',
    'Sau khi hoàn tất kiểm tra, chúng tôi sẽ thông báo kết quả cùng giá thu chính thức để bạn xác nhận.',
    '',
    `Xem tiến trình: ${buybackUrl()}`,
    '',
    'Cảm ơn bạn đã sử dụng dịch vụ thu mô hình của MODEL universe!',
  ),
});

export const emailBuybackQuote = (
  code: string,
  customerName: string,
  facts: {
    estimateVnd: number | null;
    declaredIssueCount: number;
    inspectedIssueCount: number;
    deductionDifferenceVnd: number;
    finalVnd: number;
  },
) => ({
  subject: `Kết quả kiểm hàng và giá thu chính thức – ${code}`,
  body: lines(
    `Xin chào ${customerName},`,
    '',
    `MODEL universe đã hoàn thành việc kiểm tra sản phẩm thuộc yêu cầu thu mua ${code}.`,
    '',
    'Thông tin đối chiếu:',
    `- Giá thu dự kiến: ${facts.estimateVnd !== null ? vnd(facts.estimateVnd) : 'Định giá thủ công'}`,
    `- Số lỗi đã khai báo: ${facts.declaredIssueCount}`,
    `- Số lỗi thực tế được ghi nhận: ${facts.inspectedIssueCount}`,
    `- Chênh lệch khấu trừ: ${vnd(facts.deductionDifferenceVnd)}`,
    `- Giá thu chính thức đề xuất: ${vnd(facts.finalVnd)}`,
    '',
    `Bạn có thể xem kết quả kiểm tra và hình ảnh/video tại: ${buybackUrl()}`,
    '',
    'Nếu đồng ý, vui lòng xác nhận trên website để shop tiến hành thanh toán.',
    'Nếu không đồng ý, bạn có thể yêu cầu kiểm tra lại hoặc xử lý trả hàng theo quy định.',
    '',
    'MODEL universe cảm ơn bạn đã hợp tác!',
  ),
});

export const emailVoucherExpiring = (customerName: string, code: string, description: string, expireAt: string) => ({
  subject: 'Voucher của bạn sắp hết hạn!',
  body: lines(
    `Xin chào ${customerName},`,
    '',
    `Bạn đang có mã ${code}.`,
    `Ưu đãi: ${description}.`,
    `Hết hạn: ${expireAt}.`,
    '',
    'MODEL universe đã tìm được các sản phẩm phù hợp với mã của bạn.',
    `Xem hàng giá tốt: ${shopPublicUrl()}/vi/shop`,
    `Sử dụng voucher: ${shopPublicUrl()}/vi/cart`,
  ),
});
