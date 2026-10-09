# **ĐẶC TẢ CHỨC NĂNG GIỮ HÀNG VÀ QUẢN LÝ TIỀN CỌC**

## **1. MỤC ĐÍCH**

Xây dựng chức năng cho phép khách hàng đặt cọc để giữ một sản phẩm trong một khoảng thời gian nhất định.

Thời gian giữ hàng được xác định dựa trên tỷ lệ tiền cọc mà khách hàng đã thanh toán.

Hệ thống phải tự động quản lý:

- Giá sản phẩm.

- Số tiền khách hàng đã cọc.

- Tỷ lệ cọc.

- Số tiền còn phải thanh toán.

- Số ngày được giữ hàng.

- Ngày bắt đầu giữ hàng.

- Ngày hết hạn giữ hàng.

- Số ngày còn lại.

- Trạng thái đơn hàng.

- Lịch sử các lần cọc bổ sung.

- Lịch sử gia hạn.

- Lịch sử thanh toán.

- Lịch sử thay đổi trạng thái.

Mục tiêu là để khách hàng và admin đều có thể biết chính xác:

**Đã cọc bao nhiêu → được giữ bao lâu → còn bao nhiêu tiền → còn bao nhiêu ngày → ngày nào hết hạn.**

# **2. QUY TẮC GIỮ HÀNG**

## **2.1. Mức cọc tối thiểu**

Để sử dụng chức năng giữ hàng, khách hàng phải cọc tối thiểu:

**50% giá trị sản phẩm.**

Nếu khách hàng cọc dưới 50%, hệ thống không cho phép xác nhận giữ hàng.

Thông báo:

> Số tiền cọc tối thiểu để giữ hàng là 50% giá trị sản phẩm.

# **3. QUY TẮC THỜI GIAN GIỮ HÀNG**

Mốc cơ bản:

**Cọc 50% → được giữ hàng 15 ngày.**

Sau đó, cứ mỗi khi tổng tiền cọc tăng thêm **5% giá trị sản phẩm**, khách hàng được cộng thêm **10 ngày giữ hàng**.

Bảng quy định:

| **Tỷ lệ cọc** | **Thời gian giữ hàng** |
|---------------|------------------------|
| 50%           | 15 ngày                |
| 55%           | 25 ngày                |
| 60%           | 35 ngày                |
| 65%           | 45 ngày                |
| 70%           | 55 ngày                |
| 75%           | 65 ngày                |
| 80%           | 75 ngày                |
| 85%           | 85 ngày                |
| 90%           | 95 ngày                |
| 95%           | 105 ngày               |
| 100%          | 115 ngày               |

Đây là quy tắc cố định của hệ thống.

AI khi code không được tự ý thay đổi bảng hoặc công thức trên.

# **4. CÔNG THỨC TÍNH THỜI GIAN GIỮ**

Nếu tỷ lệ cọc nhỏ hơn 50%:

Không hợp lệ

Nếu tỷ lệ cọc từ 50% đến 100%:

holdDays = 15 + ((depositPercentage - 50) / 5 × 10)

Trong đó:

- depositPercentage: tổng tỷ lệ tiền cọc hiện tại.

- holdDays: tổng số ngày được giữ hàng.

Ví dụ:

50% → 15 ngày

55% → 25 ngày

60% → 35 ngày

65% → 45 ngày

70% → 55 ngày

75% → 65 ngày

80% → 75 ngày

85% → 85 ngày

90% → 95 ngày

95% → 105 ngày

100% → 115 ngày

# **5. QUY TẮC CỌC THÊM**

Khách hàng đang giữ hàng có thể tiếp tục cọc thêm tiền.

Mỗi lần tổng tiền cọc tăng đủ thêm **5% giá trị sản phẩm**, hệ thống tăng thêm **10 ngày giữ hàng**.

Ví dụ:

Ban đầu:

Cọc 50%

→ 15 ngày

Khách cọc thêm 5%:

Tổng cọc 55%

→ 25 ngày

Khách tiếp tục cọc thêm 5%:

Tổng cọc 60%

→ 35 ngày

Khách tiếp tục cọc thêm 10%:

Tổng cọc 70%

→ 55 ngày

Hệ thống phải tính dựa trên **tổng tỷ lệ cọc hiện tại**, không được cộng thời gian một cách thủ công theo từng giao dịch.

# **6. QUY TẮC KHI CỌC CHƯA ĐỦ 5%**

Nếu khách hàng đang ở một mốc và cọc thêm nhưng chưa đủ 5% để đạt mốc tiếp theo thì không cộng thêm thời gian.

Ví dụ:

Khách đang cọc:

50%

Thời gian:

15 ngày

Khách cọc thêm:

2%

Tổng:

52%

Hệ thống vẫn áp dụng:

15 ngày

Không cộng thêm 10 ngày.

Nếu khách tiếp tục cọc thêm 3%:

Tổng = 55%

Hệ thống cập nhật:

25 ngày

# **7. QUY TẮC CỌC TỐI ĐA**

Tổng tiền cọc không được vượt quá giá trị sản phẩm.

depositPercentage \<= 100%

Nếu khách hàng cố gắng cọc vượt 100%, hệ thống phải từ chối giao dịch.

Thông báo:

> Số tiền cọc không được vượt quá 100% giá trị sản phẩm.

# **8. TÍNH TIỀN CỌC**

Công thức:

depositAmount = productPrice × depositPercentage / 100

Ví dụ:

Giá sản phẩm:

2.000.000đ

Khách cọc:

70%

Tiền cọc:

2.000.000 × 70% = 1.400.000đ

# **9. TÍNH TIỀN CÒN LẠI**

Công thức:

remainingAmount = productPrice - totalDepositAmount

Ví dụ:

Giá sản phẩm:

2.000.000đ

Đã cọc:

1.400.000đ

Còn phải thanh toán:

600.000đ

# **10. NGÀY BẮT ĐẦU GIỮ HÀNG**

Ngày bắt đầu giữ hàng không được tính từ thời điểm khách tạo đơn.

Ngày bắt đầu giữ hàng được xác định khi:

**Khách hàng thanh toán tiền cọc thành công và hệ thống/shop xác nhận giao dịch.**

Ví dụ:

Ngày tạo đơn: 01/10/2026

Ngày thanh toán cọc: 03/10/2026

Ngày shop xác nhận cọc: 03/10/2026

Ngày bắt đầu giữ hàng:

03/10/2026

# **11. TÍNH NGÀY HẾT HẠN**

Công thức:

holdExpireDate = holdStartDate + holdDays

Ví dụ:

Ngày bắt đầu: 01/10/2026

Cọc: 50%

Thời gian giữ: 15 ngày

Ngày hết hạn được hệ thống tự động tính dựa trên ngày bắt đầu và số ngày giữ.

Không cho admin hoặc khách hàng tự nhập ngày hết hạn đối với thời gian giữ được tạo từ tiền cọc.

# **12. CẬP NHẬT NGÀY HẾT HẠN KHI CỌC THÊM**

Khi khách hàng cọc bổ sung đủ để đạt mốc tiếp theo, hệ thống phải cập nhật lại thời gian giữ.

Ví dụ:

Ban đầu:

Ngày bắt đầu: 01/10/2026

Cọc: 50%

Thời gian giữ: 15 ngày

Sau đó khách cọc thêm 5%:

Tổng cọc: 55%

Thời gian giữ mới: 25 ngày

Hệ thống phải tính lại:

Ngày hết hạn mới = Ngày bắt đầu giữ + 25 ngày

Không được lấy ngày hiện tại cộng thêm 10 ngày.

Điều này rất quan trọng.

Ví dụ khách cọc thêm vào ngày thứ 10 thì **không phải** tính:

Ngày hiện tại + 10 ngày

Mà phải tính:

Ngày bắt đầu giữ ban đầu + tổng số ngày được hưởng theo tỷ lệ cọc hiện tại

# **13. THANH TOÁN ĐỦ 100%**

Khi tổng số tiền khách hàng đã thanh toán bằng giá trị sản phẩm:

totalPaid \>= productPrice

Hệ thống phải:

1.  Xác nhận khách đã thanh toán đủ.

2.  Đưa số tiền còn lại về 0.

3.  Chuyển trạng thái đơn hàng thành:

ĐÃ THANH TOÁN

4.  Dừng việc theo dõi thời gian giữ hàng.

5.  Không tiếp tục cảnh báo hết hạn.

6.  Không chuyển đơn sang trạng thái hết hạn.

7.  Cho phép chuyển sang bước giao hàng/nhận hàng.

Nếu khách cọc 100% ngay từ đầu thì đơn được xem là đã thanh toán đủ.

# **14. TRẠNG THÁI ĐƠN HÀNG**

Hệ thống cần có tối thiểu các trạng thái sau:

## **14.1. CHỜ CỌC**

Khách đã tạo yêu cầu nhưng chưa thanh toán tiền cọc.

PENDING_DEPOSIT

## **14.2. ĐÃ CỌC – ĐANG GIỮ HÀNG**

Khách đã thanh toán cọc và shop xác nhận.

HOLDING

Hệ thống bắt đầu tính thời gian giữ.

## **14.3. CỌC BỔ SUNG**

Khách thực hiện giao dịch cọc thêm.

ADDITIONAL_DEPOSIT

Sau khi giao dịch thành công, đơn quay lại:

HOLDING

với thời gian giữ được cập nhật.

## **14.4. ĐÃ THANH TOÁN**

Khách đã thanh toán đủ 100%.

PAID

## **14.5. ĐÃ NHẬN HÀNG**

Khách đã nhận sản phẩm.

COMPLETED

## **14.6. ĐÃ HỦY**

Đơn hàng bị hủy.

CANCELLED

## **14.7. HẾT HẠN GIỮ HÀNG**

Đã đến thời hạn giữ nhưng khách chưa thanh toán đủ và chưa được gia hạn.

EXPIRED

## **14.8. ĐÃ GIA HẠN**

Có thể sử dụng trạng thái hoặc lịch sử gia hạn riêng.

Khuyến nghị không thay thế trạng thái HOLDING bằng EXTENDED, mà lưu:

status = HOLDING

extensionCount \> 0

để hệ thống vẫn hiểu sản phẩm đang được giữ.

# **15. ĐẾM NGƯỢC THỜI GIAN**

Trong giao diện khách hàng phải hiển thị:

Đã cọc: 1.000.000đ

Tỷ lệ cọc: 50%

Thời gian giữ: 15 ngày

Ngày bắt đầu: 01/10/2026

Ngày hết hạn: 16/10/2026

Còn lại: 8 ngày

Còn thanh toán: 1.000.000đ

Hệ thống có thể hiển thị bộ đếm:

Còn 8 ngày

Nếu còn dưới 3 ngày:

⚠️ Sắp hết thời gian giữ hàng.

Vui lòng thanh toán phần còn lại hoặc liên hệ shop để được hỗ trợ.

Nếu đã hết hạn:

Đã hết thời gian giữ hàng.

Vui lòng liên hệ shop để được hỗ trợ.

# **16. CHỨC NĂNG CỌC THÊM**

Trong trang chi tiết đơn hàng đang giữ, hiển thị nút:

CỌC THÊM

Khi khách chọn cọc thêm, hệ thống phải hiển thị:

- Giá sản phẩm.

- Tổng tiền đã cọc.

- Tỷ lệ cọc hiện tại.

- Số tiền có thể cọc thêm.

- Tỷ lệ cọc sau khi cọc thêm.

- Thời gian giữ hiện tại.

- Thời gian giữ mới.

- Ngày hết hạn hiện tại.

- Ngày hết hạn mới.

- Số tiền còn lại sau khi cọc thêm.

Ví dụ:

Giá sản phẩm: 2.000.000đ

Đã cọc: 1.000.000đ

Tỷ lệ: 50%

Giữ hàng: 15 ngày

Cọc thêm: 100.000đ

Tỷ lệ mới: 55%

Thời gian giữ mới: 25 ngày

# **17. LỊCH SỬ CỌC**

Mỗi lần khách thanh toán cọc phải tạo một bản ghi giao dịch riêng.

Ví dụ:

| **Lần** | **Số tiền** | **Tỷ lệ thêm** | **Tổng cọc** | **Tổng tỷ lệ** |
|---------|-------------|----------------|--------------|----------------|
| 1       | 1.000.000đ  | 50%            | 1.000.000đ   | 50%            |
| 2       | 100.000đ    | 5%             | 1.100.000đ   | 55%            |
| 3       | 100.000đ    | 5%             | 1.200.000đ   | 60%            |

Không được gộp mất lịch sử các lần thanh toán.

# **18. KHÁCH HỦY ĐƠN**

Nếu khách chủ động hủy đơn sau khi đã cọc:

- Tiền cọc không được hoàn lại theo quy định của shop.

- Đơn chuyển thành:

CANCELLED

- Sản phẩm được giải phóng khỏi trạng thái giữ.

- Sản phẩm có thể quay trở lại trạng thái còn hàng.

- Toàn bộ lịch sử cọc vẫn phải được lưu.

Không được xóa đơn hàng khỏi database.

# **19. HẾT HẠN GIỮ HÀNG**

Hệ thống phải có cơ chế kiểm tra tự động.

Nếu:

currentDate \> holdExpireDate

và:

totalPaid \< productPrice

và:

status = HOLDING

thì hệ thống chuyển:

status = EXPIRED

Sau khi hết hạn, hệ thống gửi thông báo cho khách hàng.

# **20. XỬ LÝ ĐƠN HẾT HẠN**

Khi đơn đã hết hạn, admin có thể lựa chọn:

1.  Gia hạn.

2.  Tiếp tục giữ hàng.

3.  Hủy đơn.

4.  Giải phóng sản phẩm để bán cho khách khác.

Không được tự động xóa đơn.

Mọi quyết định xử lý phải được ghi vào lịch sử.

# **21. GIA HẠN THỦ CÔNG**

Admin có thể gia hạn thời gian giữ hàng ngoài thời gian được tính từ tiền cọc.

Khi gia hạn phải lưu:

extension_id

order_id

old_expire_date

extension_days

new_expire_date

reason

admin_id

created_at

Ví dụ:

Ngày hết hạn cũ: 15/10/2026

Gia hạn: 7 ngày

Ngày hết hạn mới: 22/10/2026

Admin không được sửa trực tiếp ngày hết hạn mà không tạo lịch sử thay đổi.

# **22. QUY TẮC KHÔNG ĐƯỢC XÓA LỊCH SỬ**

Hệ thống phải lưu lại:

- Lịch sử đặt cọc.

- Lịch sử cọc thêm.

- Lịch sử thanh toán.

- Lịch sử gia hạn.

- Lịch sử hủy.

- Lịch sử thay đổi trạng thái.

- Người thực hiện thay đổi.

- Thời gian thực hiện thay đổi.

Không được xóa các giao dịch cũ chỉ vì đơn hàng đã hoàn tất hoặc bị hủy.

# **23. DỮ LIỆU ĐƠN HÀNG**

Bảng orders tối thiểu cần có:

order_id

customer_id

product_id

product_name

product_price

total_paid

deposit_amount

deposit_percentage

remaining_amount

hold_days

hold_start_date

hold_expire_date

payment_status

order_status

created_at

confirmed_at

paid_at

completed_at

cancelled_at

# **24. DỮ LIỆU GIAO DỊCH CỌC**

Bảng deposit_transactions:

transaction_id

order_id

customer_id

amount

percentage_added

payment_method

transaction_status

confirmed_by

created_at

confirmed_at

Mỗi lần cọc/cọc thêm là một transaction riêng.

# **25. DỮ LIỆU LỊCH SỬ GIA HẠN**

Bảng order_extensions:

extension_id

order_id

old_expire_date

extension_days

new_expire_date

reason

admin_id

created_at

# **26. DỮ LIỆU LỊCH SỬ TRẠNG THÁI**

Bảng order_status_history:

history_id

order_id

old_status

new_status

reason

changed_by

created_at

# **27. HIỂN THỊ CHO ADMIN**

Admin phải có màn hình quản lý đơn giữ hàng.

Các thông tin cần hiển thị:

| **Thông tin** | **Nội dung**            |
|---------------|-------------------------|
| Mã đơn        | ORDER001                |
| Khách hàng    | Tên khách               |
| Sản phẩm      | Tên model               |
| Giá sản phẩm  | Giá bán                 |
| Đã cọc        | Tổng tiền               |
| Tỷ lệ cọc     | %                       |
| Còn lại       | Số tiền                 |
| Thời gian giữ | Số ngày                 |
| Ngày bắt đầu  | Ngày                    |
| Ngày hết hạn  | Ngày                    |
| Còn lại       | Số ngày                 |
| Trạng thái    | HOLDING/PAID/EXPIRED... |

Admin có thể:

- Xác nhận cọc.

- Xác nhận cọc thêm.

- Xác nhận thanh toán.

- Gia hạn.

- Hủy đơn.

- Xử lý đơn hết hạn.

- Xem lịch sử giao dịch.

# **28. KHÓA SẢN PHẨM KHI ĐANG GIỮ**

Khi đơn chuyển sang:

HOLDING

sản phẩm phải được khóa khỏi việc bán cho khách hàng khác.

Trạng thái sản phẩm:

HELD

Trong thời gian giữ hàng:

- Không cho khách khác mua sản phẩm.

- Không cho tạo đơn giữ hàng khác cho cùng sản phẩm.

- Không để sản phẩm xuất hiện như sản phẩm còn hàng bình thường.

Khi đơn:

CANCELLED

hoặc được xử lý giải phóng:

HELD → AVAILABLE

Khi khách thanh toán đủ:

HELD → SOLD

# **29. KIỂM TRA TRÙNG SẢN PHẨM**

Trước khi tạo đơn giữ hàng, hệ thống phải kiểm tra sản phẩm.

Nếu sản phẩm đang:

HELD

thì không cho khách khác đặt giữ.

Thông báo:

> Sản phẩm hiện đang được giữ cho khách hàng khác.

Nếu sản phẩm:

SOLD

thì không thể tạo đơn.

Nếu sản phẩm:

AVAILABLE

thì có thể tạo đơn giữ hàng.

# **30. TÍCH HỢP VỚI HỆ THỐNG ĐIỂM THÀNH VIÊN**

Sau này hệ thống thành viên có thể liên kết với chức năng giữ hàng.

Khi đơn hoàn tất:

COMPLETED

hệ thống có thể cộng điểm cho khách hàng theo chính sách thành viên.

Không cộng điểm chỉ vì khách vừa đặt cọc.

Điểm chỉ được tính khi giao dịch đạt điều kiện hoàn tất theo chính sách thành viên.

Lịch sử điểm phải liên kết với:

order_id

customer_id

# **31. NOTIFICATION**

Hệ thống nên tự động gửi thông báo tại các thời điểm:

### **Khi xác nhận cọc**

> Đã xác nhận tiền cọc. Sản phẩm đã được giữ cho bạn.

### **Khi cọc thêm**

> Khoản cọc của bạn đã được cập nhật. Thời gian giữ hàng đã được điều chỉnh.

### **Còn 3 ngày**

> Sản phẩm của bạn sắp hết thời gian giữ hàng.

### **Còn 1 ngày**

> Sản phẩm của bạn sẽ hết thời gian giữ hàng vào ngày mai.

### **Hết hạn**

> Thời gian giữ hàng của bạn đã hết. Vui lòng liên hệ shop để được hỗ trợ.

### **Thanh toán đủ**

> Bạn đã thanh toán đủ giá trị sản phẩm. Đơn hàng đã được xác nhận thanh toán.

# **32. CÁC QUY TẮC QUAN TRỌNG CHO AI KHI CODE**

AI phải tuân thủ chính xác các quy tắc sau:

1.  Tiền cọc tối thiểu = **50%**.

2.  Tiền cọc tối đa = **100%**.

3.  Cọc 50% = **15 ngày**.

4.  Mỗi cọc thêm **5%** = cộng **10 ngày**.

5.  55% = 25 ngày.

6.  60% = 35 ngày.

7.  65% = 45 ngày.

8.  70% = 55 ngày.

9.  75% = 65 ngày.

10. 80% = 75 ngày.

11. 85% = 85 ngày.

12. 90% = 95 ngày.

13. 95% = 105 ngày.

14. 100% = 115 ngày.

15. Thời gian giữ được tính dựa trên **tổng tỷ lệ cọc hiện tại**.

16. Không cộng 10 ngày nếu phần cọc thêm chưa đạt đủ 5%.

17. Ngày bắt đầu giữ tính từ lúc cọc được xác nhận thành công.

18. Khi cọc thêm đủ mốc, ngày hết hạn phải được tính lại dựa trên **ngày bắt đầu giữ ban đầu**.

19. Không tính thêm 10 ngày từ ngày khách cọc bổ sung.

20. Không cho cọc vượt quá 100%.

21. Khi thanh toán đủ 100%, dừng thời gian giữ.

22. Khi hết hạn mà chưa thanh toán đủ, chuyển trạng thái EXPIRED.

23. Không tự động xóa đơn hết hạn.

24. Cọc bổ sung phải được lưu thành transaction riêng.

25. Gia hạn phải được lưu lịch sử.

26. Mọi thay đổi trạng thái phải được ghi log.

27. Sản phẩm đang giữ phải được khóa khỏi khách hàng khác.

28. Khi đơn hoàn tất, sản phẩm chuyển sang trạng thái đã bán.

29. Khi đơn bị hủy và sản phẩm được giải phóng, sản phẩm trở lại trạng thái có thể bán.

30. Không được tự ý thay đổi các quy tắc trên trong quá trình triển khai.

# **33. TEST CASE BẮT BUỘC**

## **TEST 01 – Cọc 50%**

Giá sản phẩm: 1.000.000đ

Cọc: 500.000đ

Tỷ lệ: 50%

Kết quả:

Hold days = 15

Remaining = 500.000đ

Status = HOLDING

## **TEST 02 – Cọc 55%**

Giá sản phẩm: 1.000.000đ

Cọc: 550.000đ

Tỷ lệ: 55%

Kết quả:

Hold days = 25

Remaining = 450.000đ

## **TEST 03 – Cọc 70%**

Giá sản phẩm: 1.000.000đ

Cọc: 700.000đ

Tỷ lệ: 70%

Kết quả:

Hold days = 55

Remaining = 300.000đ

## **TEST 04 – Cọc 100%**

Giá sản phẩm: 1.000.000đ

Cọc: 1.000.000đ

Tỷ lệ: 100%

Kết quả:

Hold days = 115

Remaining = 0

Status = PAID

Không tiếp tục cảnh báo hết hạn.

## **TEST 05 – Cọc 52%**

Giá sản phẩm: 1.000.000đ

Cọc: 520.000đ

Tỷ lệ: 52%

Kết quả:

Hold days = 15

Vì chưa đạt mốc 55%.

## **TEST 06 – Cọc bổ sung từ 50% lên 55%**

Ban đầu:

50%

15 ngày

Cọc thêm:

5%

Kết quả:

55%

25 ngày

Ngày hết hạn phải được tính lại từ **ngày bắt đầu giữ ban đầu**.

## **TEST 07 – Cọc bổ sung 2% rồi 3%**

Ban đầu:

50%

15 ngày

Cọc thêm:

2%

Kết quả:

52%

15 ngày

Cọc tiếp:

3%

Kết quả:

55%

25 ngày

## **TEST 08 – Cọc vượt 100%**

Nếu:

depositPercentage \> 100%

Hệ thống phải từ chối.

## **TEST 09 – Hết hạn**

Nếu:

currentDate \> holdExpireDate

và:

totalPaid \< productPrice

thì:

status = EXPIRED

## **TEST 10 – Thanh toán đủ trước hạn**

Nếu khách thanh toán đủ 100% trước ngày hết hạn:

totalPaid = productPrice

thì:

status = PAID

Hệ thống dừng việc theo dõi thời gian giữ.

# **34. NGUYÊN TẮC CUỐI CÙNG**

Chức năng giữ hàng phải đảm bảo 4 yếu tố:

**RÕ TIỀN CỌC**

Khách biết mình đã cọc bao nhiêu.

**RÕ THỜI GIAN**

Khách biết mình được giữ hàng bao nhiêu ngày.

**RÕ NGÀY HẾT HẠN**

Khách biết chính xác ngày phải hoàn tất thanh toán hoặc liên hệ shop.

**RÕ LỊCH SỬ**

Mọi khoản cọc, cọc thêm, thanh toán, gia hạn và thay đổi trạng thái đều phải được lưu lại.

Công thức nghiệp vụ cốt lõi của hệ thống:

50% cọc = 15 ngày giữ hàng

Mỗi +5% cọc = +10 ngày giữ hàng

Tối đa 100% cọc = 115 ngày giữ hàng

Hệ thống phải sử dụng các quy tắc này làm nguồn dữ liệu duy nhất để tính thời gian giữ hàng và không được tự ý thay đổi logic.

# **35. CHỨC NĂNG LẤY HÀNG TRONG THỜI GIAN GIỮ HÀNG**

## **35.1. Nguyên tắc**

Trong thời gian đơn hàng vẫn còn hiệu lực giữ hàng, khách hàng có quyền yêu cầu lấy sản phẩm.

**Không bắt buộc khách hàng phải thanh toán đủ 100% giá trị sản phẩm trước khi được yêu cầu lấy hàng.**

Hệ thống phải luôn hiển thị chức năng:

**LẤY HÀNG**

đối với các đơn đang ở trạng thái:

HOLDING

Khách hàng có thể lựa chọn phương thức thanh toán phần tiền còn lại phù hợp với chính sách của shop.

# **36. PHƯƠNG THỨC THANH TOÁN KHI LẤY HÀNG**

Khi khách hàng nhấn:

**LẤY HÀNG**

hệ thống phải hiển thị các phương thức thanh toán được shop hỗ trợ.

Tối thiểu gồm:

### **Phương thức 1 – Thanh toán full trước**

Khách hàng thanh toán toàn bộ số tiền còn lại trước khi nhận hàng.

Công thức:

remainingAmount = productPrice - totalPaid

Ví dụ:

Giá sản phẩm: 2.000.000đ

Đã cọc: 1.000.000đ

Còn lại: 1.000.000đ

Khách chọn:

THANH TOÁN FULL

Khách thanh toán thêm:

1.000.000đ

Tổng thanh toán:

2.000.000đ

Đơn chuyển sang trạng thái:

PAID

Sau đó thực hiện quy trình giao hàng/nhận hàng.

# **37. PHƯƠNG THỨC 2 – COD PHẦN CÒN LẠI**

Nếu shop cho phép COD, khách hàng có thể chọn:

**COD PHẦN CÒN LẠI**

Khách không cần thanh toán full trước.

Ví dụ:

Giá sản phẩm: 2.000.000đ

Đã cọc: 1.000.000đ

Còn lại: 1.000.000đ

Khách chọn:

LẤY HÀNG – COD

Hệ thống tạo yêu cầu giao hàng với:

COD Amount = 1.000.000đ

Khách thanh toán phần còn lại cho đơn vị vận chuyển khi nhận hàng.

# **38. QUY TẮC TIỀN CỌC KHI LẤY HÀNG**

Tiền cọc trước đó luôn được tính vào tổng giá trị sản phẩm.

Không được tính tiền cọc như một khoản phí riêng.

Công thức:

remainingAmount = productPrice - totalPaid

Ví dụ:

Giá sản phẩm = 3.000.000đ

Đã cọc = 1.500.000đ

Khi khách lấy hàng:

Phần còn lại = 3.000.000 - 1.500.000

= 1.500.000đ

Nếu chọn COD:

COD = 1.500.000đ

Nếu chọn thanh toán full trước:

Thanh toán thêm = 1.500.000đ

# **39. ĐIỀU KIỆN ĐỂ HIỂN THỊ NÚT "LẤY HÀNG"**

Nút:

**LẤY HÀNG**

phải được hiển thị khi:

orderStatus = HOLDING

và:

currentDate \<= holdExpireDate

Khách vẫn còn thời gian giữ hàng thì có quyền yêu cầu lấy hàng.

Không được yêu cầu:

depositPercentage = 100%

mới hiển thị nút lấy hàng.

Đây là quy tắc quan trọng.

# **40. LẤY HÀNG KHI CHƯA CỌC FULL**

Ví dụ:

Giá sản phẩm: 2.000.000đ

Cọc: 50%

Đã cọc: 1.000.000đ

Còn lại: 1.000.000đ

Thời gian giữ: 15 ngày

Trong thời gian 15 ngày, khách có thể nhấn:

**LẤY HÀNG**

Hệ thống cho phép khách chọn:

\[ THANH TOÁN PHẦN CÒN LẠI \]

\[ COD PHẦN CÒN LẠI \]

Không được bắt buộc khách phải cọc thêm 50% để đạt 100% trước khi lấy hàng.

# **41. QUY TRÌNH LẤY HÀNG – THANH TOÁN FULL**

Flow:

Đơn đang giữ hàng

↓

Khách chọn "LẤY HÀNG"

↓

Chọn "THANH TOÁN FULL"

↓

Hệ thống hiển thị số tiền còn lại

↓

Khách thanh toán

↓

Thanh toán thành công

↓

Đơn chuyển PAID

↓

Tạo yêu cầu giao hàng / nhận tại shop

↓

Giao hàng

↓

Khách nhận hàng

↓

COMPLETED

# **42. QUY TRÌNH LẤY HÀNG – COD**

Flow:

Đơn đang giữ hàng

↓

Khách chọn "LẤY HÀNG"

↓

Chọn "COD PHẦN CÒN LẠI"

↓

Hệ thống kiểm tra shop có hỗ trợ COD

↓

Hiển thị số tiền COD

↓

Khách xác nhận địa chỉ nhận hàng

↓

Tạo yêu cầu giao hàng

↓

Đơn chuyển trạng thái chờ giao

↓

Đơn vị vận chuyển thu tiền còn lại

↓

Giao hàng thành công

↓

Xác nhận đã thu COD

↓

COMPLETED

# **43. TRẠNG THÁI ĐƠN HÀNG KHI YÊU CẦU LẤY HÀNG**

Nên bổ sung các trạng thái:

HOLDING

↓

DELIVERY_REQUESTED

↓

WAITING_PAYMENT / COD

↓

SHIPPING

↓

DELIVERED

↓

COMPLETED

Trong đó:

### **HOLDING**

Sản phẩm đang được giữ cho khách.

### **DELIVERY_REQUESTED**

Khách đã yêu cầu lấy hàng.

### **WAITING_PAYMENT**

Khách chọn thanh toán phần còn lại trước.

### **COD**

Khách chọn thanh toán phần còn lại bằng COD.

### **SHIPPING**

Sản phẩm đang được giao.

### **DELIVERED**

Đơn vị vận chuyển báo đã giao hàng.

### **COMPLETED**

Đơn hàng hoàn tất.

# **44. QUY TẮC DỪNG THỜI GIAN GIỮ KHI KHÁCH YÊU CẦU LẤY HÀNG**

Khi khách đã xác nhận:

**LẤY HÀNG**

và shop xác nhận yêu cầu lấy hàng, sản phẩm không còn được xem là một sản phẩm đang chờ giữ để bán cho người khác.

Hệ thống chuyển đơn sang:

DELIVERY_REQUESTED

Thời gian giữ hàng không tiếp tục được sử dụng để tự động hủy đơn trong quá trình giao hàng.

Ví dụ:

Ngày hết hạn giữ: 20/10

Khách yêu cầu lấy hàng: 18/10

Shop xác nhận: 18/10

Từ thời điểm shop xác nhận yêu cầu lấy hàng:

Không được tự động chuyển đơn sang EXPIRED

dù quá ngày 20/10 trong lúc đơn đang giao.

# **45. HỦY YÊU CẦU LẤY HÀNG**

Nếu khách yêu cầu lấy hàng nhưng sau đó hủy yêu cầu trước khi sản phẩm được giao, hệ thống phải xử lý theo trạng thái thực tế.

Nếu đơn vẫn còn thời gian giữ:

DELIVERY_REQUESTED → HOLDING

Nếu thời gian giữ đã hết:

DELIVERY_REQUESTED → EXPIRED

Việc hoàn/hủy tiền cọc phải tuân theo chính sách cọc của shop.

Không tự động hoàn tiền cọc chỉ vì khách hủy yêu cầu lấy hàng.

# **46. ĐỊA CHỈ VÀ THÔNG TIN GIAO HÀNG**

Khi khách chọn:

**LẤY HÀNG**

hệ thống phải yêu cầu xác nhận:

- Họ tên người nhận.

- Số điện thoại.

- Địa chỉ nhận hàng.

- Tỉnh/thành.

- Quận/huyện.

- Phường/xã.

- Phương thức giao hàng.

- Phương thức thanh toán phần còn lại.

Nếu khách chọn COD:

COD Amount = remainingAmount

Không được tính lại toàn bộ giá sản phẩm vào COD.

# **47. TRƯỜNG HỢP NHẬN HÀNG TẠI SHOP**

Nếu shop có hỗ trợ nhận hàng trực tiếp, khách có thể chọn:

**NHẬN TẠI SHOP**

Khi đó hệ thống cho phép:

LẤY HÀNG → NHẬN TẠI SHOP

Khách có thể thanh toán phần còn lại tại shop nếu shop cho phép.

Sau khi admin xác nhận khách đã thanh toán và nhận hàng:

COMPLETED

# **48. QUY TẮC QUAN TRỌNG CHO AI KHI CODE**

AI phải tuân thủ các nguyên tắc sau:

1.  Khách đang giữ hàng **không bắt buộc phải cọc đủ 100% mới được lấy hàng**.

2.  Đơn đang HOLDING phải có nút **LẤY HÀNG**.

3.  Khi chọn lấy hàng, khách được chọn phương thức thanh toán phần còn lại.

4.  Có thể thanh toán full phần còn lại trước.

5.  Nếu shop hỗ trợ COD, khách có thể chọn COD phần còn lại.

6.  Tiền cọc luôn được trừ vào giá sản phẩm.

7.  COD chỉ bằng số tiền còn phải thanh toán.

8.  Không được tính COD bằng toàn bộ giá sản phẩm.

9.  Khi khách yêu cầu lấy hàng và shop xác nhận, đơn chuyển sang quy trình giao hàng.

10. Sau khi xác nhận lấy hàng, thời gian giữ hàng không tiếp tục làm đơn tự động hết hạn.

11. Đơn đang giao không được chuyển sang EXPIRED chỉ vì ngày giữ hàng ban đầu đã qua.

12. Nếu khách chưa yêu cầu lấy hàng và thời gian giữ đã hết, đơn có thể chuyển EXPIRED.

13. Khách có thể nhận hàng tại shop nếu hệ thống hỗ trợ.

14. Lịch sử thanh toán, cọc và giao hàng phải được lưu đầy đủ.

15. Không xóa lịch sử đơn khi đơn đã hoàn tất hoặc hủy.

# **49. CẤU TRÚC DỮ LIỆU BỔ SUNG**

Trong bảng orders nên có thêm:

delivery_method

payment_method_remaining

delivery_status

shipping_name

shipping_phone

shipping_address

cod_amount

delivery_requested_at

shipping_at

delivered_at

completed_at

Các giá trị payment_method_remaining có thể gồm:

FULL_PAYMENT

COD

SHOP_PAYMENT

Các giá trị delivery_method:

SHIP

PICKUP_AT_SHOP

# **50. TEST CASE BẮT BUỘC**

## **TEST 11 – Cọc 50% và lấy hàng bằng thanh toán full**

Giá: 2.000.000đ

Đã cọc: 1.000.000đ

Còn lại: 1.000.000đ

Khách chọn:

LẤY HÀNG

→ THANH TOÁN FULL

Kết quả:

Thanh toán thêm: 1.000.000đ

Tổng thanh toán: 2.000.000đ

Status: PAID

Sau khi nhận hàng:

COMPLETED

## **TEST 12 – Cọc 50% và lấy hàng bằng COD**

Giá: 2.000.000đ

Đã cọc: 1.000.000đ

Còn lại: 1.000.000đ

Khách chọn:

LẤY HÀNG

→ COD

Kết quả:

COD Amount = 1.000.000đ

Không được tạo COD:

2.000.000đ

## **TEST 13 – Cọc 70% và lấy hàng bằng COD**

Giá: 3.000.000đ

Đã cọc: 2.100.000đ

Tỷ lệ cọc: 70%

Còn lại: 900.000đ

Khách chọn COD:

COD = 900.000đ

Thời gian giữ trước khi lấy:

55 ngày

Không yêu cầu khách cọc thêm để đạt 100%.

## **TEST 14 – Yêu cầu lấy hàng trước ngày hết hạn**

Ngày hết hạn: 20/10

Ngày yêu cầu lấy hàng: 18/10

Kết quả:

HOLDING

→ DELIVERY_REQUESTED

Nếu ngày giao hàng là 21/10:

**Không được chuyển đơn thành EXPIRED.**

## **TEST 15 – Chưa lấy hàng và hết hạn**

Ngày hết hạn: 20/10

Khách chưa yêu cầu lấy hàng

Chưa thanh toán đủ

Kết quả:

HOLDING

→ EXPIRED

# **51. TÓM TẮT LOGIC CUỐI CÙNG**

Luồng tổng thể:

KHÁCH ĐẶT HÀNG

↓

THANH TOÁN CỌC ≥ 50%

↓

ĐƠN ĐƯỢC GIỮ

↓

50% = 15 NGÀY

↓

MỖI +5% = +10 NGÀY

↓

┌─────────────────────────────┐

│ │

│ KHÁCH CỌC THÊM │

│ ↓ │

│ TĂNG THỜI GIAN GIỮ │

│ │

│ HOẶC │

│ │

│ KHÁCH CHỌN "LẤY HÀNG" │

│ ↓ │

│ ┌───────────────┐ │

│ │ THANH TOÁN │ │

│ │ FULL PHẦN CÒN │ │

│ │ LẠI │ │

│ └───────────────┘ │

│ HOẶC │

│ ┌───────────────┐ │

│ │ COD PHẦN CÒN │ │

│ │ LẠI │ │

│ └───────────────┘ │

│ ↓ │

│ GIAO HÀNG │

│ ↓ │

│ KHÁCH NHẬN HÀNG │

│ ↓ │

│ COMPLETED │

│ │

└─────────────────────────────┘

NẾU KHÁCH KHÔNG LẤY HÀNG

↓

HẾT THỜI GIAN GIỮ

↓

EXPIRED

↓

ADMIN XỬ LÝ

## **QUY TẮC CỐT LÕI**

Cọc 50% = giữ 15 ngày

Mỗi +5% cọc = +10 ngày

Tối đa 100% cọc = 115 ngày

Trong thời gian giữ:

→ Có thể cọc thêm

→ Có thể thanh toán full phần còn lại

→ Có thể chọn COD phần còn lại

→ Có thể nhận hàng tại shop nếu được hỗ trợ

KHÔNG bắt buộc:

100% cọc → mới được lấy hàng.

Khi đã xác nhận yêu cầu lấy hàng:

→ Dừng logic hết hạn giữ

→ Chuyển sang quy trình giao/nhận hàng.
