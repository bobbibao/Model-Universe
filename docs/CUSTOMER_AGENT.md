# Trợ lý Agent dành cho khách hàng

Khách dùng nút **Hỏi Agent** ở trang chủ/góc màn hình, mục **Agent** trong menu hoặc trang `/assistant`.
Trên trang sản phẩm có nút **Hỏi Agent về sản phẩm này**. Chat được giữ khi chuyển trang trong cùng phiên mở web;
nội dung không ghi vào localStorage và được xóa khi đổi tài khoản hoặc bấm **Chat mới**.

## Chức năng

- Tìm/lọc sản phẩm theo nhu cầu, ngân sách, danh mục, thương hiệu, giới tính và kênh bán.
- Chế độ **Nghiên cứu chuyên sâu** đọc nhiều sản phẩm, thông số và đánh giá rồi so sánh, dẫn nguồn trong cửa hàng.
- Thêm/cập nhật/xóa giỏ; lưu/bỏ yêu thích; áp dụng mã giảm giá; điều hướng các trang khách hàng.
- Soạn liên hệ, viết lại đánh giá từ trải nghiệm thật, sửa thông tin tài khoản, kiểm tra/hủy đơn và yêu cầu trả hàng.
- Chuẩn bị thông tin giao hàng và đặt đơn COD trong chat sau khi kiểm tra giỏ, tổng tiền và xác nhận.
- Đăng nhập, đăng ký và đổi mật khẩu dùng các form bảo mật hiện có.

Các thao tác đều hiện thẻ để khách duyệt. Liên hệ/đánh giá cho phép chỉnh nội dung. Số sao do khách chọn;
đánh giá phải xác nhận phản ánh trải nghiệm thật và API vẫn kiểm tra điều kiện mua hàng đã giao.
Checkout dùng giá/tồn kho phía server; nếu dữ liệu đổi sau bước kiểm tra, khách phải xem và xác nhận lại.
Giỏ và bản nháp giao hàng/mã giảm giá được chia sẻ với trang giỏ hàng.

## Chạy dev

Khởi động lại web server để nạp `CustomerAssistant.Controller` và Agent Server để nạp graph `customer_assistant`
từ `aegra.json` hoặc `langgraph.json`. Không cần migration hoặc biến môi trường mới.
Dùng `AGENT_SERVER_URL` và `AGENT_ACTOR_SECRET` hiện có ở web; secret phải khớp Agent Server.
Model sử dụng vai trò `planner` trong cấu hình LLM hiện có. Cần model hỗ trợ structured output.
Với profile `local`, cần cài model `qwen3.5:9b` bằng `ollama pull qwen3.5:9b` trước khi trò chuyện;
model embedding `bge-m3` không dùng để trả lời chat.

`POST /api/assistant/chat` hoạt động cho khách vãng lai. Backend thực hiện vòng đọc dữ liệu/tổng hợp giới hạn
(tối đa 3 vòng đọc thường hoặc 5 vòng nghiên cứu, mỗi vòng tối đa 4 công cụ). Nghiên cứu chỉ lấy dữ liệu cửa hàng,
không duyệt Internet. Khi Agent không kết nối, UI giữ yêu cầu để thử lại và có lối mở shop/liên hệ.

Token `customer` chỉ chạy graph `customer_assistant`, identity `customer:user:<id>` hoặc guest ngẫu nhiên,
không dùng identity `shop`, không đọc threads/Store quản trị. Mỗi lần suy luận dùng stateless run.
Công cụ đọc riêng tư luôn lấy user id từ session, không từ model/browser. Graph không có công cụ ghi;
trình duyệt gọi API khách hàng hiện có sau khi khách xác nhận. URL điều hướng và action được allowlist.
API giới hạn 20 lượt/10 phút/IP, một lượt đang chạy/IP và tối đa 6 lượt đồng thời mỗi tiến trình.

## Kiểm tra

- `npm run type-check` trong `apps/web-ecommerce`.
- Unit: `tests/unit/customer-assistant.test.ts`, `tests/unit/customer-assistant-actions.test.ts`.
- Browser: `e2e/customer-assistant.spec.ts` (API mock, không gửi đơn/liên hệ/đánh giá thật).
- DB: `tests/db/customer-assistant-checkout.test.ts`, chỉ dùng database tạm có tên kết thúc `_test`.
- Python: `tests/graphs/test_customer_assistant.py` và contract actor-token vectors.

Các kiểm tra UI dùng dữ liệu mock. Để kiểm tra model thật, chạy cả hai dịch vụ và thử:
“Tìm giày đi bộ dưới 1 triệu”, “So sánh hai sản phẩm này”, “Giúp tôi chuẩn bị thanh toán”.
