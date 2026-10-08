# **ĐẶC TẢ HỆ THỐNG TÍCH ĐIỂM – HẠNG THÀNH VIÊN – ĐỔI ƯU ĐÃI**

## **1. Mục tiêu**

Xây dựng hệ thống Loyalty cho MODEL universe nhằm:

- Khuyến khích khách hàng mua hàng thường xuyên.

- Tri ân khách hàng cũ.

- Cho phép quy đổi các giao dịch cũ thành điểm.

- Tạo động lực khách hàng nâng hạng.

- Cho phép sử dụng điểm để đổi voucher, giảm giá hoặc quà tặng.

- Tăng khả năng khách hàng quay lại mua hàng.

- Kiểm soát chi phí ưu đãi để không ảnh hưởng quá lớn đến lợi nhuận.

- Lưu lại toàn bộ lịch sử điểm và giao dịch.

Nguyên tắc:

> Mua càng nhiều → tích càng nhiều → hạng càng cao → quyền lợi càng tốt.

# **2. PHÂN BIỆT 3 KHÁI NIỆM**

Hệ thống bắt buộc phải tách:

### **2.1. Tổng điểm tích lũy**

Là tổng số điểm khách hàng đã từng đạt được để xét hạng.

Ví dụ:

Khách hàng đã mua tổng cộng 20.000.000đ:

20.000.000 / 40.000 = 500 điểm.

Khách đạt HẠNG VÀNG.

Nếu khách sử dụng 200 điểm để đổi voucher thì:

- Tổng điểm xét hạng: 500 điểm.

- Điểm khả dụng: 300 điểm.

- Hạng vẫn là VÀNG.

Không được trừ 200 điểm khỏi điểm xét hạng.

### **2.2. Điểm khả dụng**

Là số điểm khách hàng hiện đang có thể sử dụng.

Ví dụ:

Tổng điểm xét hạng: 500

Đã sử dụng: 200

Điểm khả dụng:

500 - 200 = 300 điểm.

### **2.3. Điểm xét hạng**

Điểm xét hạng là tổng điểm hợp lệ khách hàng đã tích lũy trong lịch sử.

Điểm dùng để đổi voucher **không làm tụt hạng**.

Đây là nguyên tắc quan trọng nhất của hệ thống.

# **3. CƠ CHẾ TÍCH ĐIỂM CƠ BẢN**

## **3.1. Tỷ lệ tích điểm**

Mặc định:

> 40.000 VNĐ = 1 điểm.

Công thức:

earnedPoints = FLOOR(eligibleAmount / 40,000)

Ví dụ:

Đơn hàng 1.000.000đ:

1.000.000 / 40.000 = 25 điểm

Khách nhận:

> 25 điểm.

# **4. KHÔNG NÊN TÍNH ĐIỂM TRÊN MỌI KHOẢN THANH TOÁN**

Để tối ưu chi phí, hệ thống chỉ tính điểm trên:

> Giá trị sản phẩm thực tế khách thanh toán.

Không tính điểm trên:

- Phí vận chuyển.

- Phí COD.

- Lãi cầm.

- Phí dịch vụ.

- Khoản đặt cọc bị mất do khách vi phạm.

- Voucher/discount do shop tài trợ.

- Các khoản hoàn tiền.

- Các khoản thanh toán không hoàn tất.

Ví dụ:

Giá sản phẩm:

2.000.000đ

Voucher:

200.000đ

Khách thực trả:

1.800.000đ

Điểm:

1.800.000 / 40.000 = 45 điểm

Không tính:

2.000.000 / 40.000 = 50 điểm

Việc này giúp shop tránh tình trạng vừa giảm giá vừa tiếp tục trả điểm trên phần giá trị đã giảm.

# **5. THỜI ĐIỂM CỘNG ĐIỂM**

Không cộng điểm ngay khi khách đặt hàng.

Chỉ cộng điểm khi:

Đơn hàng = COMPLETED

Tức là:

- Đã thanh toán.

- Đã giao hàng thành công.

- Không còn trong trạng thái tranh chấp.

- Đơn hàng được xác nhận hoàn tất.

Điều này ngăn khách:

> Đặt hàng → nhận điểm → hủy đơn.

# **6. HỆ THỐNG HẠNG THÀNH VIÊN**

Có thể giữ hệ thống hiện tại:

| **Hạng**  | **Điểm xét hạng** | **Giá trị giao dịch tương đương** | **Discount** |
|-----------|-------------------|-----------------------------------|--------------|
| Đồng      | 150 điểm          | ~6 triệu                          | 2%           |
| Bạc       | 250 điểm          | ~10 triệu                         | 4%           |
| Vàng      | 500 điểm          | ~20 triệu                         | 6%           |
| Bạch Kim  | 1.500 điểm        | ~60 triệu                         | 10%          |
| Lục Bảo   | 3.500 điểm        | ~140 triệu                        | 12%          |
| Kim Cương | 10.000 điểm       | ~400 triệu                        | 15%          |

# **7. KHUYẾN NGHỊ TỐI ƯU CHI PHÍ**

Hệ thống hiện tại có:

> 10% / 12% / 15% giảm trọn đời.

Nếu khách hàng cấp cao tiếp tục được:

> tích điểm + đổi voucher + nhận quà + giảm giá trực tiếp

thì tổng chi phí ưu đãi có thể rất lớn.

Do đó nên áp dụng nguyên tắc:

## **Không cộng dồn quá nhiều ưu đãi trên cùng một đơn.**

Ví dụ khách Vàng:

Giá sản phẩm: 2.000.000

Discount hạng: 6%

= giảm 120.000

Không nên cho khách tiếp tục dùng thêm một voucher giảm 15% trên cùng đơn.

Có thể cho:

> Chọn 1 trong các ưu đãi.

Hoặc:

> Discount thành viên + voucher cố định nhưng giới hạn mức giảm.

# **8. CƠ CHẾ ĐỔI ĐIỂM**

Điểm khả dụng có thể đổi thành:

### **Nhóm 1 – Voucher tiền**

| **Điểm** | **Voucher** |
|----------|-------------|
| 50 điểm  | 50.000đ     |
| 90 điểm  | 100.000đ    |
| 130 điểm | 150.000đ    |
| 170 điểm | 200.000đ    |
| 400 điểm | 500.000đ    |
| 750 điểm | 1.000.000đ  |

Không nên thiết kế tỷ lệ:

> 40 điểm = 40.000đ

vì như vậy khách gần như đang được hoàn tiền trực tiếp.

Nên để tỷ lệ đổi điểm **cao hơn giá trị điểm danh nghĩa**.

Ví dụ:

50 điểm mới đổi được 50.000đ.

Khách phải tích đủ nhiều điểm mới có thể đổi.

# **9. ĐỔI ĐIỂM LẤY DISCOUNT %**

Có thể bổ sung:

| **Điểm cần đổi** | **Ưu đãi** |
|------------------|------------|
| 50 điểm          | Giảm 2%    |
| 100 điểm         | Giảm 3%    |
| 200 điểm         | Giảm 5%    |
| 350 điểm         | Giảm 7%    |
| 500 điểm         | Giảm 10%   |

Nhưng phải có:

### **Mức giảm tối đa**

Ví dụ:

> Voucher giảm 10%, tối đa 300.000đ.

Như vậy khách mua sản phẩm 10 triệu sẽ không được giảm 1 triệu.

Hệ thống chỉ giảm:

> 300.000đ.

Đây là cách rất quan trọng để kiểm soát chi phí.

# **10. ĐỀ XUẤT BẢNG QUY ĐỔI TỐI ƯU HƠN**

Tôi đề xuất dùng bảng này làm mặc định:

### **VOUCHER TIỀN**

| **Điểm** | **Giá trị** | **Điều kiện**      |
|----------|-------------|--------------------|
| 60 điểm  | 50.000đ     | Đơn từ 500.000đ    |
| 110 điểm | 100.000đ    | Đơn từ 1.000.000đ  |
| 160 điểm | 150.000đ    | Đơn từ 1.500.000đ  |
| 210 điểm | 200.000đ    | Đơn từ 2.000.000đ  |
| 500 điểm | 500.000đ    | Đơn từ 5.000.000đ  |
| 900 điểm | 1.000.000đ  | Đơn từ 10.000.000đ |

Như vậy:

> Không phải cứ có điểm là đổi tiền mặt.

Điểm phải được sử dụng để tạo ra một đơn hàng mới.

# **11. VOUCHER GIẢM %**

Đề xuất:

| **Điểm** | **Discount** | **Giảm tối đa** |
|----------|--------------|-----------------|
| 50 điểm  | 2%           | 100.000đ        |
| 100 điểm | 3%           | 150.000đ        |
| 200 điểm | 5%           | 250.000đ        |
| 350 điểm | 7%           | 300.000đ        |
| 500 điểm | 10%          | 500.000đ        |
| 800 điểm | 12%          | 700.000đ        |

Mỗi voucher chỉ sử dụng một lần.

# **12. ĐIỂM CÓ THỂ ĐỔI QUÀ**

Có thể tạo thêm mục:

> ĐỔI ĐIỂM LẤY QUÀ

Ví dụ:

| **Điểm**   | **Quà**                  |
|------------|--------------------------|
| 80 điểm    | Quà trị giá ~50.000đ     |
| 160 điểm   | Quà trị giá ~100.000đ    |
| 250 điểm   | Quà trị giá ~150.000đ    |
| 330 điểm   | Quà trị giá ~200.000đ    |
| 800 điểm   | Quà trị giá ~500.000đ    |
| 1.500 điểm | Quà đặc biệt ~1.000.000đ |

Quà có thể là:

- phụ kiện model;

- dụng cụ;

- decal;

- stand;

- action base;

- phụ kiện trưng bày;

- phụ kiện lắp ráp;

- voucher mua hàng;

- sản phẩm tồn kho cần đẩy;

- quà giới hạn.

Đặc biệt nên ưu tiên những sản phẩm có:

> Giá bán cao nhưng giá vốn thấp.

Đây là cách tối ưu chi phí tốt hơn tặng tiền trực tiếp.

# **13. CƠ CHẾ HẠNG VÀ ĐỔI ĐIỂM PHẢI TÁCH RIÊNG**

Ví dụ:

Khách A:

Tổng điểm xét hạng: 1.500

Điểm khả dụng: 1.500

Khách đổi:

500 điểm → Voucher 500.000đ

Sau khi đổi:

Điểm xét hạng: 1.500

Điểm khả dụng: 1.000

Hạng: BẠCH KIM

Không được:

1.500 - 500 = 1.000

→ tụt hạng

# **14. TÍCH ĐIỂM LỊCH SỬ CHO KHÁCH CŨ**

Đây là tính năng đặc biệt của MODEL universe.

Khách có thể gửi:

- Hóa đơn cũ.

- Tin nhắn chốt đơn.

- Sao kê chuyển khoản.

- Ảnh giao dịch.

- Lịch sử mua hàng.

- Lịch sử trade.

Admin kiểm tra và nhập:

historicalPurchaseAmount

Sau đó hệ thống tự tính:

historicalPoints =

FLOOR(historicalPurchaseAmount / 40,000)

Ví dụ:

Khách chứng minh đã mua:

12.000.000đ

Hệ thống:

12.000.000 / 40.000

= 300 điểm

Khách nhận:

> 300 điểm.

# **15. QUY TẮC CHỐNG GIAN LẬN ĐIỂM CŨ**

Mỗi giao dịch cũ chỉ được quy đổi một lần.

Hệ thống lưu:

proofImage

proofType

verifiedBy

verifiedAt

originalTransactionDate

originalTransactionAmount

convertedPoints

Nếu cùng một hóa đơn được gửi lại:

REJECT_DUPLICATE

Không được cộng điểm lần thứ hai.

# **16. TRADE CŨ**

Đối với các giao dịch TRADE cũ, không nên mặc định lấy toàn bộ giá trị món hàng làm điểm.

Nên dùng:

tradeValue = giá trị shop thực tế ghi nhận trong giao dịch

Ví dụ:

Khách trade một model được shop định giá:

3.000.000đ

→ 3.000.000 / 40.000

→ 75 điểm.

Không lấy:

> Giá khách từng mua model đó trên thị trường.

Điều này giúp kiểm soát hệ thống.

# **17. ĐIỂM THƯỞNG ĐẶC BIỆT**

Ngoài điểm mua hàng, hệ thống có thể hỗ trợ:

### **Điểm bonus**

Admin có thể cộng:

+10 điểm

+20 điểm

+50 điểm

+100 điểm

với lý do:

- Sinh nhật.

- Khách hàng lâu năm.

- Giới thiệu khách mới.

- Tham gia event.

- Mini game.

- Review sản phẩm.

- Hỗ trợ shop.

- Pre-order.

- Giao dịch số lượng lớn.

Mọi điểm bonus phải có:

reason

admin

timestamp

amount

# **18. ĐIỂM GIỚI THIỆU BẠN BÈ**

Có thể mở rộng:

Khách A giới thiệu khách B.

Khi B hoàn tất đơn đầu tiên:

A +50 điểm

B +20 điểm

Nhưng nên giới hạn:

> Tối đa 5 lượt/tháng.

Để tránh spam tài khoản.

# **19. KHÔNG CHO ĐIỂM TÍCH ĐIỂM TRÊN VOUCHER**

Ví dụ:

Giá:

2.000.000đ

Voucher:

200.000đ

Khách thanh toán:

1.800.000đ

Điểm:

1.800.000 / 40.000

= 45 điểm

Không phải:

2.000.000 / 40.000

= 50 điểm

# **20. QUY TẮC HOÀN/HỦY ĐƠN**

Nếu đơn đã được cộng điểm nhưng sau đó bị hoàn/hủy:

Hệ thống phải thu hồi điểm.

Ví dụ:

Đơn:

2.000.000đ

Khách nhận:

50 điểm.

Sau đó đơn bị hoàn:

-50 điểm

Lịch sử vẫn giữ:

+50 PURCHASE

-50 ORDER_REFUND

Không xóa giao dịch cũ.

# **21. KHÔNG ĐỂ ĐIỂM ÂM**

Nếu khách đã sử dụng điểm trước đó rồi phát sinh hoàn hàng:

Ví dụ:

Điểm khả dụng = 20

Nhưng đơn hoàn cần thu hồi:

50 điểm

Không nên cho:

-30 điểm

Thay vào đó:

availablePoints = 0

negativeBalance = 30

30 điểm âm sẽ được tự động trừ vào các điểm khách nhận được tiếp theo.

# **22. DATABASE**

## **customers**

id

name

phone

email

member_level

lifetime_points

available_points

used_points

bonus_points

created_at

updated_at

### **Ý nghĩa**

lifetime_points

= tổng điểm xét hạng.

available_points

= điểm có thể sử dụng.

used_points

= tổng điểm đã sử dụng.

# **23. BẢNG POINT TRANSACTIONS**

id

customer_id

type

points

balance_after

reference_type

reference_id

description

created_by

created_at

### **type**

PURCHASE

TRADE

BONUS

REFERRAL

HISTORICAL

REDEEM

REFUND

ADMIN_ADJUST

# **24. BẢNG REWARD**

id

name

type

points_required

reward_value

discount_percent

max_discount

min_order_value

quantity

status

start_at

end_at

### **type**

VOUCHER_AMOUNT

VOUCHER_PERCENT

GIFT

# **25. BẢNG CUSTOMER REWARDS**

id

customer_id

reward_id

points_used

voucher_code

status

issued_at

used_at

expired_at

order_id

Status:

AVAILABLE

USED

EXPIRED

CANCELLED

# **26. LOGIC ĐỔI ĐIỂM**

Khách chọn:

> Voucher 200.000đ – 210 điểm.

Backend kiểm tra:

availablePoints \>= 210

Nếu đúng:

availablePoints -= 210

Tạo:

PointTransaction

type = REDEEM

points = -210

Tạo voucher:

status = AVAILABLE

Nếu không đủ điểm:

REJECT

Không được phép đổi.

# **27. LOGIC SỬ DỤNG VOUCHER**

Khi khách nhập voucher:

Backend kiểm tra:

voucher.status == AVAILABLE

voucher.customer_id == currentCustomer

voucher.expired_at \>= currentDate

orderValue \>= minOrderValue

Nếu hợp lệ:

APPLY

Sau khi đơn hoàn tất:

voucher.status = USED

# **28. KHÔNG CHO DÙNG CHỒNG VOUCHER**

Mặc định:

1 đơn = 1 voucher điểm

Và:

1 đơn = 1 loại ưu đãi chính

Có thể cấu hình riêng nếu admin muốn cho phép cộng.

# **29. QUYỀN LỢI HẠNG THÀNH VIÊN**

## **ĐỒNG**

150 điểm

Giảm 2%

## **BẠC**

250 điểm

Giảm 4%

## **VÀNG**

500 điểm

Giảm 6%

## **BẠCH KIM**

1.500 điểm

Giảm 10%

## **LỤC BẢO**

3.500 điểm

Giảm 12%

## **KIM CƯƠNG**

10.000 điểm

Giảm 15%

# **30. KHUYẾN NGHỊ VỀ DISCOUNT HẠNG**

Để giảm rủi ro tài chính, discount hạng nên có:

discountPercent

maxDiscountAmount

Ví dụ:

Bạch Kim:

10%

max 1.000.000đ / đơn

Lục Bảo:

12%

max 1.500.000đ / đơn

Kim Cương:

15%

max 2.000.000đ / đơn

Như vậy dù khách mua đơn cực lớn, chi phí ưu đãi vẫn được kiểm soát.

# **31. ƯU ĐÃI KHÔNG NÊN ÁP DỤNG CHO TẤT CẢ SẢN PHẨM**

Admin có thể cấu hình:

eligible_for_member_discount

eligible_for_point

eligible_for_voucher

Một số sản phẩm có thể:

> Không áp dụng discount thành viên.

Ví dụ:

- hàng thanh lý;

- hàng giá đặc biệt;

- hàng pre-order;

- sản phẩm lợi nhuận thấp;

- sản phẩm đang sale sâu;

- combo;

- sản phẩm đối tác.

# **32. CẤU HÌNH TÍCH ĐIỂM**

Admin có thể chỉnh:

pointRate = 40000

Ví dụ sau này muốn:

50.000đ = 1 điểm

chỉ cần thay:

pointRate = 50000

Không sửa code.

# **33. DASHBOARD KHÁCH HÀNG**

Khách hàng nhìn thấy:

HẠNG HIỆN TẠI

VÀNG

500 điểm xét hạng

Điểm khả dụng

320 điểm

Đã sử dụng

180 điểm

Điểm còn thiếu để lên BẠCH KIM

1.000 điểm

Thanh tiến trình:

VÀNG

████████░░░░░░░░

500 / 1.500

# **34. TRANG ĐỔI ĐIỂM**

Hiển thị:

ĐIỂM CỦA BẠN

320 điểm khả dụng

\[50.000đ\] 60 điểm

\[100.000đ\] 110 điểm

\[150.000đ\] 160 điểm

\[200.000đ\] 210 điểm

\[GIẢM 2%\] 50 điểm

\[GIẢM 3%\] 100 điểm

\[GIẢM 5%\] 200 điểm

\[GIẢM 7%\] 350 điểm

Nếu không đủ:

Bạn cần thêm 40 điểm để đổi voucher này.

# **35. TRANG LỊCH SỬ ĐIỂM**

Hiển thị:

| **Thời gian** | **Nội dung**         | **Điểm** |
|---------------|----------------------|----------|
| 07/10         | Hoàn tất đơn \#MU001 | +50      |
| 05/10         | Đổi voucher 100K     | -110     |
| 01/10         | Bonus khách hàng     | +20      |
| 20/09         | Trade model          | +75      |

# **36. ADMIN QUẢN LÝ ĐIỂM**

Admin có thể:

- Xem điểm khách.

- Xem lịch sử.

- Cộng điểm.

- Trừ điểm.

- Xác minh giao dịch cũ.

- Duyệt điểm trade.

- Duyệt điểm bonus.

- Khóa voucher.

- Hủy voucher.

- Điều chỉnh điểm.

Nhưng:

> Không được xóa lịch sử điểm.

Nếu sửa sai:

ADMIN_ADJUST

tạo giao dịch điều chỉnh mới.

# **37. CƠ CHẾ AN TOÀN**

Mọi thay đổi điểm phải có:

customer_id

old_balance

change_amount

new_balance

reason

admin_id

timestamp

reference_id

Không được update điểm trực tiếp mà không tạo transaction.

# **38. TỰ ĐỘNG XÁC ĐỊNH HẠNG**

Sau mỗi giao dịch điểm:

if lifetimePoints \>= 10000

DIAMOND

else if lifetimePoints \>= 3500

LUC_BAO

else if lifetimePoints \>= 1500

PLATINUM

else if lifetimePoints \>= 500

GOLD

else if lifetimePoints \>= 250

SILVER

else if lifetimePoints \>= 150

BRONZE

else

MEMBER

Hạng được xác định dựa trên:

lifetime_points

không dựa trên:

available_points

# **39. QUY TẮC QUAN TRỌNG VỀ HẠNG**

Khi khách đã đạt hạng:

> Hạng không bị giảm khi khách sử dụng điểm.

Ví dụ:

Khách đạt 500 điểm

→ VÀNG

Khách đổi:

500 điểm

thì:

lifetime_points = 500

available_points = 0

member_level = GOLD

# **40. CÁCH TỐI ƯU CHI PHÍ TỐT NHẤT**

Hệ thống nên ưu tiên:

### **1. Tặng voucher thay vì tiền**

Không chuyển tiền thật cho khách.

### **2. Voucher phải có đơn tối thiểu**

Ví dụ:

100K voucher

→ đơn từ 1 triệu

### **3. Có giới hạn giảm tối đa**

Ví dụ:

10%

max 500K

### **4. Không cộng dồn quá nhiều ưu đãi**

### **5. Không tích điểm trên phần được giảm**

### **6. Có sản phẩm không áp dụng**

### **7. Ưu tiên quà có giá vốn thấp**

Ví dụ:

Quà trị giá 200K

nhưng giá vốn chỉ:

80K

thì chi phí thực tế của shop chỉ khoảng 80K.

Đây là hình thức đổi điểm rất có lợi.

# **41. CƠ CHẾ KHUYẾN KHÍCH KHÁCH KHÔNG ĐỔI ĐIỂM QUÁ SỚM**

Có thể tạo các mốc:

100 điểm → Voucher 50K

200 điểm → Voucher 100K

500 điểm → Voucher 300K

1.000 điểm → Voucher 700K

Nhưng reward càng lớn thì tỷ lệ quy đổi càng tốt.

Ví dụ:

100 điểm → 50K

500 điểm → 300K

1.000 điểm → 700K

Điều này tạo động lực:

> "Để dành điểm lên mốc lớn sẽ lời hơn."

Qua đó khách tiếp tục mua hàng thay vì đổi điểm ngay.

# **42. CƠ CHẾ ĐIỂM VÀ HẠNG ĐỀ XUẤT CUỐI CÙNG**

Mô hình nên vận hành như sau:

KHÁCH MUA HÀNG

↓

ĐƠN HOÀN TẤT

↓

40.000đ = 1 ĐIỂM

↓

LIFETIME POINTS

↓

XÁC ĐỊNH HẠNG

↓

BRONZE / SILVER / GOLD /

PLATINUM / EMERALD / DIAMOND

↓

┌─────────────────────┐

│ │

↓ ↓

QUYỀN LỢI HẠNG ĐIỂM KHẢ DỤNG

│ │

↓ ↓

GIẢM GIÁ ĐỔI VOUCHER

ƯU TIÊN ĐỔI QUÀ

QUÀ GIẢM %

ĐẶC QUYỀN

# **43. VÍ DỤ THỰC TẾ**

Khách hàng mua:

Đơn 1: 2.000.000

Đơn 2: 4.000.000

Đơn 3: 6.000.000

Tổng:

12.000.000

Điểm:

12.000.000 / 40.000

= 300 điểm

Khách đạt:

> HẠNG BẠC – 4%.

Điểm khả dụng:

> 300 điểm.

Khách đổi:

> Voucher 100.000đ – 110 điểm.

Sau khi đổi:

Lifetime points = 300

Available points = 190

Used points = 110

Hạng:

> Vẫn BẠC.

# **44. TEST CASE BẮT BUỘC**

### **TEST 01**

Đơn 1.000.000đ hoàn tất.

Expected:

+25 điểm

### **TEST 02**

Đơn 1.000.000đ nhưng voucher 100.000đ.

Expected:

+22 điểm

vì:

900.000 / 40.000

= 22 điểm

### **TEST 03**

Khách có 500 lifetime points.

Đổi voucher 200 điểm.

Expected:

Lifetime = 500

Available = 300

Level = GOLD

### **TEST 04**

Khách đạt 1.500 điểm.

Expected:

PLATINUM

### **TEST 05**

Khách đạt 500 điểm rồi sử dụng toàn bộ 500 điểm.

Expected:

Level = GOLD

Available = 0

### **TEST 06**

Đơn bị hoàn sau khi cộng 50 điểm.

Expected:

Point transaction:

+50 PURCHASE

-50 REFUND

### **TEST 07**

Khách gửi cùng một hóa đơn cũ 2 lần.

Expected:

Lần 1: APPROVED

Lần 2: REJECT_DUPLICATE

### **TEST 08**

Voucher 200K yêu cầu đơn tối thiểu 2 triệu.

Khách mua đơn 1,5 triệu.

Expected:

Voucher INVALID

### **TEST 09**

Voucher giảm 10%, tối đa 500K.

Đơn 10 triệu.

Expected:

Discount = 500K

không phải 1 triệu.

### **TEST 10**

Khách sử dụng điểm.

Expected:

Hạng không giảm.

# **45. NGUYÊN TẮC CUỐI CÙNG**

Hệ thống Loyalty của MODEL universe phải đảm bảo:

MUA HÀNG

↓

TÍCH ĐIỂM

↓

NÂNG HẠNG

↓

NHẬN QUYỀN LỢI

↓

DÙNG ĐIỂM

↓

QUAY LẠI MUA HÀNG

↓

TÍCH TIẾP

Điểm được sử dụng sẽ giảm:

available_points

nhưng KHÔNG giảm:

lifetime_points

và KHÔNG làm giảm:

member_level

Mục tiêu của hệ thống không phải chỉ để "cho khách giảm giá", mà phải tạo thành một vòng lặp:

> **Mua hàng → được thưởng → có động lực quay lại → mua tiếp → lên hạng → được ưu đãi tốt hơn → tiếp tục gắn bó với MODEL universe.**
