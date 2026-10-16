# **ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG MUA HÀNG ĐẶT CỌC VÀ VẬN CHUYỂN TỰ ĐỘNG**

## **MODEL UNIVERSE – VŨ TRỤ MÔ HÌNH**

**Phiên bản: 1.0  
Loại tài liệu: BRD + SRS – Đặc tả nghiệp vụ và yêu cầu hệ thống  
Phạm vi: Mua hàng đặt cọc, giao dịch trực tiếp (GDTT), vận chuyển SPX, thanh toán COD, thông báo Zalo, website và email.**

# **CHƯƠNG I. MỤC TIÊU HỆ THỐNG**

## **1. Mục tiêu**

**MODEL universe xây dựng hệ thống mua hàng đặt cọc, cho phép khách hàng thanh toán trước một phần giá trị sản phẩm và lựa chọn phương thức nhận hàng phù hợp.**

**Hệ thống có hai phương thức nhận hàng chính:**

**Phương thức 1: Giao dịch trực tiếp (GDTT)**

**Khách hàng đặt cọc mua sản phẩm, cung cấp địa điểm giao dịch, lựa chọn hoặc thỏa thuận thời gian nhận hàng, sau đó thanh toán phần tiền còn lại khi giao dịch trực tiếp.**

**Phương thức 2: Giao hàng SPX – Thu hộ COD**

**Khách hàng đặt cọc mua sản phẩm, cung cấp địa chỉ nhận hàng. Website tự động tính số tiền COD còn lại, chuẩn bị thông tin kiện hàng, tạo vận đơn SPX và gửi thông báo cho shop cùng khách hàng.**

## **2. Nguyên tắc chung**

- **Khách hàng đặt cọc mua hàng tối thiểu 10%.**

- **Khách được lựa chọn thanh toán trước từ 10% đến 100%.**

- **Tiền cọc là khoản thanh toán trước cho đơn mua hàng.**

- **Tiền cọc không phải cọc giữ hàng.**

- **Đơn hàng chỉ được xác nhận sau khi thanh toán cọc thành công.**

- **Không áp dụng quy định giữ hàng 15 ngày.**

- **Không áp dụng cơ chế cộng thêm ngày giữ hàng.**

- **Không tự động ghi nhận tiền chưa nhận.**

- **COD được tính dựa trên phần tiền khách chưa thanh toán.**

- **Mỗi đơn hàng có mã riêng.**

- **Mỗi giao dịch thanh toán phải được ghi nhận.**

- **Mọi thông báo phải gắn đúng đơn hàng và người nhận.**

# **CHƯƠNG II. QUY TRÌNH MUA HÀNG CHUNG**

## **3. Quy trình đặt mua sản phẩm**

**Khách hàng truy cập website MODEL universe.**

**Khách chọn sản phẩm muốn mua, số lượng và phiên bản.**

**Tại trang thanh toán, hệ thống hiển thị:**

- **Tên sản phẩm.**

- **Mã sản phẩm.**

- **Số lượng.**

- **Giá sản phẩm.**

- **Tổng tiền sản phẩm.**

- **Tỷ lệ cọc.**

- **Số tiền cần thanh toán trước.**

- **Số tiền còn lại.**

- **Phương thức nhận hàng.**

**Khách chọn một trong hai hình thức:**

**GDTT – Giao dịch trực tiếp**

**hoặc**

**SPX COD – Giao hàng tận nơi, thu tiền còn lại khi nhận hàng.**

**Sau khi chọn phương thức, website hiển thị các trường thông tin tương ứng.**

## **4. Quy định cọc mua hàng**

**Mức cọc tối thiểu là 10% giá trị sản phẩm của đơn hàng.**

**Mức cọc tối đa là 100%.**

**Ví dụ sản phẩm có giá 2.000.000đ:**

| **Tỷ lệ thanh toán trước** | **Tiền cọc**   | **Tiền còn lại** |
|----------------------------|----------------|------------------|
| **10%**                    | **200.000đ**   | **1.800.000đ**   |
| **20%**                    | **400.000đ**   | **1.600.000đ**   |
| **30%**                    | **600.000đ**   | **1.400.000đ**   |
| **50%**                    | **1.000.000đ** | **1.000.000đ**   |
| **70%**                    | **1.400.000đ** | **600.000đ**     |
| **90%**                    | **1.800.000đ** | **200.000đ**     |
| **100%**                   | **2.000.000đ** | **0đ**           |

**Khách có thể thanh toán bổ sung trước khi hoàn tất giao dịch nếu hệ thống cho phép.**

## **5. Công thức tính tiền**

**product_total = unit_price \* quantity**

**deposit_amount =**

**CEIL(product_total \* deposit_percent / 100)**

**confirmed_paid =**

**Tổng thanh toán thành công - Tổng đã hoàn**

**remaining_amount =**

**MAX(0, product_total - confirmed_paid)**

**Phí vận chuyển và các khoản phí khác được tính riêng theo phương thức nhận hàng.**

**Backend phải tính toán lại toàn bộ số tiền, không sử dụng giá trị do trình duyệt tự gửi làm kết quả cuối cùng.**

# **CHƯƠNG III. NGHIỆP VỤ GIAO DỊCH TRỰC TIẾP (GDTT)**

## **6. Mục tiêu**

**Cho phép khách mua mô hình bằng hình thức đặt cọc trước, sau đó gặp trực tiếp shop hoặc nhân viên để nhận hàng và thanh toán phần còn lại.**

## **7. Thông tin khách phải cung cấp**

**Khi chọn GDTT, website yêu cầu:**

- **Họ và tên.**

- **Số điện thoại liên hệ.**

- **Địa chỉ hoặc địa điểm giao dịch mong muốn.**

- **Tỉnh/thành phố.**

- **Ngày giao dịch mong muốn.**

- **Khung giờ giao dịch mong muốn.**

- **Ghi chú nếu có.**

**Khách có thể lựa chọn địa điểm do shop đề xuất hoặc gửi địa chỉ mong muốn để shop xác nhận.**

**Địa chỉ khách nhập là địa điểm đề xuất, không tự động đồng nghĩa shop đã đồng ý giao dịch tại đó.**

## **8. Quy trình GDTT**

**KHÁCH CHỌN SẢN PHẨM**

**↓**

**CHỌN GDTT**

**↓**

**NHẬP ĐỊA CHỈ / ĐỊA ĐIỂM GIAO DỊCH**

**↓**

**CHỌN TỶ LỆ CỌC TỪ 10%**

**↓**

**THANH TOÁN CỌC**

**↓**

**HỆ THỐNG XÁC NHẬN THANH TOÁN**

**↓**

**TẠO ĐƠN GDTT**

**↓**

**THÔNG BÁO CHO ADMIN QUA ZALO**

**↓**

**SHOP XÁC NHẬN ĐỊA ĐIỂM VÀ LỊCH HẸN**

**↓**

**THÔNG BÁO CHO KHÁCH**

**↓**

**HAI BÊN GIAO DỊCH TRỰC TIẾP**

**↓**

**KHÁCH KIỂM TRA SẢN PHẨM**

**↓**

**KHÁCH THANH TOÁN PHẦN CÒN LẠI**

**↓**

**NHÂN VIÊN XÁC NHẬN ĐÃ NHẬN TIỀN**

**↓**

**HOÀN TẤT ĐƠN HÀNG**

## **9. Trạng thái đơn GDTT**

**PENDING_DEPOSIT**

**DEPOSIT_CONFIRMED**

**WAITING_FOR_APPOINTMENT**

**APPOINTMENT_CONFIRMED**

**READY_FOR_HANDOVER**

**MEETING_IN_PROGRESS**

**WAITING_REMAINING_PAYMENT**

**COMPLETED**

**CANCEL_REQUESTED**

**CANCELLED**

**DISPUTED**

## **10. Xác nhận giao dịch**

**Khi giao dịch trực tiếp, nhân viên cần:**

1.  **Xác nhận đúng mã đơn hàng.**

2.  **Kiểm tra sản phẩm và số lượng.**

3.  **Cho khách kiểm tra tình trạng hàng.**

4.  **Xác nhận khoản tiền còn lại.**

5.  **Ghi nhận phương thức thanh toán.**

6.  **Xác nhận đã nhận tiền.**

7.  **Xác nhận đã bàn giao hàng.**

**Khuyến nghị sử dụng mã QR hoặc mã OTP giao nhận để giảm nguy cơ giao nhầm người.**

**Không cho phép hoàn tất đơn chỉ vì khách đã đến điểm hẹn nếu chưa xác nhận giao hàng và nghĩa vụ thanh toán.**

## **11. Thay đổi địa điểm hoặc lịch hẹn**

**Khách có thể yêu cầu thay đổi địa điểm hoặc lịch hẹn.**

**Yêu cầu phải được shop xác nhận trước khi có hiệu lực.**

**Mọi thay đổi được lưu trong lịch sử đơn hàng.**

**Nếu phát sinh phí giao hàng trực tiếp, website phải thông báo và được khách đồng ý trước khi áp dụng.**

# **CHƯƠNG IV. NGHIỆP VỤ SHIP COD QUA SPX**

## **12. Mục tiêu**

**Tự động tạo vận đơn SPX từ dữ liệu đặt hàng đã được xác nhận, giảm thao tác nhập thủ công và đảm bảo số tiền COD chính xác.**

## **13. Thông tin khách cung cấp**

**Khi chọn SPX COD, website yêu cầu:**

- **Họ tên người nhận.**

- **Số điện thoại người nhận.**

- **Địa chỉ chi tiết.**

- **Tỉnh/thành phố.**

- **Phường/xã.**

- **Các thành phần địa chỉ khác nếu SPX yêu cầu.**

- **Ghi chú giao hàng.**

**Khách phải xác nhận địa chỉ trước khi tạo vận đơn.**

## **14. Thông tin sản phẩm phục vụ vận chuyển**

**Mỗi sản phẩm có hồ sơ vận chuyển:**

**product_id**

**product_name**

**product_sku**

**product_weight_gram**

**package_length_cm**

**package_width_cm**

**package_height_cm**

**package_weight_gram**

**fragile**

**shipping_note**

**declared_value**

**Đối với đơn có nhiều sản phẩm, hệ thống cần xác định thông số kiện hàng sau khi đóng gói.**

**Admin hoặc nhân viên kho được phép điều chỉnh kích thước, cân nặng trước khi tạo vận đơn.**

## **15. Quy trình SPX COD**

**KHÁCH CHỌN SẢN PHẨM**

**↓**

**CHỌN SHIP COD**

**↓**

**NHẬP ĐỊA CHỈ NHẬN HÀNG**

**↓**

**CHỌN TỶ LỆ CỌC TỪ 10%**

**↓**

**XÁC NHẬN THÔNG TIN ĐƠN**

**↓**

**THANH TOÁN CỌC**

**↓**

**HỆ THỐNG XÁC NHẬN THANH TOÁN**

**↓**

**KIỂM TRA TỒN KHO**

**↓**

**XÁC NHẬN THÔNG SỐ KIỆN HÀNG**

**↓**

**LẤY PHÍ VẬN CHUYỂN SPX**

**↓**

**XÁC NHẬN SỐ TIỀN COD**

**↓**

**GỬI YÊU CẦU TẠO VẬN ĐƠN SPX**

**↓**

**SPX TRẢ MÃ VẬN ĐƠN**

**↓**

**LƯU MÃ VẬN ĐƠN VÀO WEBSITE**

**↓**

**THÔNG BÁO ZALO CHO SHOP**

**↓**

**THÔNG BÁO WEBSITE / EMAIL CHO KHÁCH**

**↓**

**SPX LẤY HÀNG**

**↓**

**SPX VẬN CHUYỂN**

**↓**

**KHÁCH NHẬN HÀNG VÀ THANH TOÁN COD**

**↓**

**SPX CẬP NHẬT GIAO THÀNH CÔNG**

**↓**

**ĐỐI SOÁT TIỀN COD**

**↓**

**HOÀN TẤT ĐƠN**

## **16. Công thức COD**

**product_total = Tổng giá trị sản phẩm**

**confirmed_paid = Tổng tiền đã thanh toán thành công**

**remaining_product_amount =**

**MAX(0, product_total - confirmed_paid)**

**cod_amount =**

**remaining_product_amount**

**+ shipping_fee_collected_by_carrier**

**+ other_eligible_cod_fees**

**Phí vận chuyển chỉ được cộng vào COD nếu SPX hỗ trợ thu hộ và khách đã đồng ý.**

## **17. Ví dụ tính COD**

**Giá sản phẩm: 2.500.000đ**

**Khách cọc 10%: 250.000đ**

**Còn lại: 2.250.000đ**

**Phí vận chuyển: 35.000đ**

**COD gửi SPX: 2.285.000đ**

**Ví dụ giả định phí vận chuyển 35.000đ được thu cùng COD.**

**Nếu phí vận chuyển do khách trả riêng, COD gửi SPX là 2.250.000đ.**

## **18. Kiểm tra trước khi tạo vận đơn**

**Hệ thống phải kiểm tra:**

- **Đơn hàng hợp lệ.**

- **Khách đã thanh toán tối thiểu 10%.**

- **Thanh toán đã được xác nhận.**

- **Tồn kho đủ.**

- **Địa chỉ đầy đủ.**

- **Có thông tin người nhận.**

- **Có kích thước kiện hàng.**

- **Có cân nặng kiện hàng.**

- **Có phí vận chuyển đã xác nhận.**

- **COD không âm.**

- **COD nằm trong giới hạn SPX.**

- **Chưa có vận đơn đang hoạt động cho cùng lần giao.**

**Nếu một điều kiện không đạt, không tạo vận đơn và thông báo Admin xử lý.**

## **19. Nhận mã vận đơn SPX**

**Khi SPX trả kết quả thành công, website lưu:**

**shipment_id**

**order_id**

**carrier = SPX**

**carrier_order_id**

**tracking_number**

**tracking_url**

**cod_amount**

**shipping_fee**

**shipping_status**

**created_at**

**Website chỉ thông báo có mã vận đơn sau khi nhận được mã hợp lệ.**

**Việc tạo vận đơn không đồng nghĩa SPX đã lấy hàng.**

## **20. Đồng bộ trạng thái**

**CREATED**

**AWAITING_PICKUP**

**PICKED_UP**

**IN_TRANSIT**

**OUT_FOR_DELIVERY**

**DELIVERED**

**DELIVERY_FAILED**

**RETURNING**

**RETURNED**

**CANCELLED**

**Các trạng thái trên là trạng thái nội bộ, phải được ánh xạ theo dữ liệu thực tế của SPX.**

## **21. Trường hợp khách thanh toán đủ 100%**

**Nếu khách đã thanh toán đủ:**

**remaining_product_amount = 0**

**Hệ thống có thể tạo vận đơn không thu COD nếu SPX hỗ trợ.**

**Nếu còn phí vận chuyển chưa thanh toán, cần xác định ai trả phí và có thu hộ hay không.**

**Không được tự động yêu cầu khách trả lại số tiền sản phẩm đã thanh toán.**

# **CHƯƠNG V. THÔNG BÁO ZALO CHO SHOP**

## **22. Mục tiêu**

**Khi khách đặt cọc thành công hoặc khi SPX tạo vận đơn thành công, hệ thống gửi thông báo đến kênh Zalo quản trị được MODEL universe cấu hình.**

## **23. Phương thức tích hợp**

**Ưu tiên:**

- **Zalo Official Account của MODEL universe.**

- **API hoặc dịch vụ thông báo được Zalo cho phép.**

- **Các cơ chế tích hợp chính thức khác được cấp quyền.**

**Không mặc định rằng website có thể tự động gửi tin nhắn tới Zalo cá nhân hoặc nhóm Zalo bất kỳ.**

**Nếu không có quyền tích hợp phù hợp, website cần tạo thông báo nội bộ để nhân viên xem và chuyển tiếp thủ công.**

## **24. Sự kiện gửi Zalo**

### **ZALO-01. Khách cọc đơn GDTT thành công**

**Nội dung:**

**MODEL universe – ĐƠN GDTT MỚI**

**Mã đơn: {{order_code}}**

**Khách hàng: {{customer_name}}**

**Số điện thoại: {{customer_phone}}**

**Sản phẩm: {{product_summary}}**

**Giá trị đơn: {{product_total}}**

**Đã cọc: {{deposit_amount}}**

**Còn lại: {{remaining_amount}}**

**Địa điểm GDTT đề xuất: {{meeting_address}}**

**Thời gian mong muốn: {{requested_meeting_time}}**

**Trạng thái: Chờ xác nhận lịch giao dịch.**

**Xem đơn: {{admin_order_url}}**

### **ZALO-02. Khách cọc đơn SPX thành công**

**MODEL universe – ĐƠN SHIP COD MỚI**

**Mã đơn: {{order_code}}**

**Khách hàng: {{customer_name}}**

**Sản phẩm: {{product_summary}}**

**Giá trị đơn: {{product_total}}**

**Đã thanh toán: {{confirmed_paid}}**

**COD sản phẩm dự kiến: {{remaining_amount}}**

**Địa chỉ nhận: {{recipient_address}}**

**Trạng thái: Chờ tạo vận đơn SPX.**

**Xem đơn: {{admin_order_url}}**

### **ZALO-03. SPX tạo vận đơn thành công**

**MODEL universe – TẠO VẬN ĐƠN THÀNH CÔNG**

**Mã đơn: {{order_code}}**

**Mã SPX: {{tracking_number}}**

**Khách hàng: {{customer_name}}**

**COD: {{cod_amount}}**

**Phí vận chuyển: {{shipping_fee}}**

**Trạng thái: {{shipping_status}}**

**Theo dõi: {{tracking_url}}**

**Xem đơn: {{admin_order_url}}**

### **ZALO-04. SPX tạo vận đơn thất bại**

**MODEL universe – CẢNH BÁO TẠO VẬN ĐƠN**

**Mã đơn: {{order_code}}**

**Lỗi: {{error_message}}**

**Trạng thái: Cần nhân viên kiểm tra.**

**Xem đơn: {{admin_order_url}}**

### **ZALO-05. Giao hàng thất bại**

**MODEL universe – GIAO HÀNG THẤT BẠI**

**Mã đơn: {{order_code}}**

**Mã SPX: {{tracking_number}}**

**Lý do: {{failure_reason}}**

**Trạng thái: Chờ xử lý.**

**Xem đơn: {{admin_order_url}}**

# **CHƯƠNG VI. THÔNG BÁO WEBSITE VÀ EMAIL CHO KHÁCH**

## **25. Nguyên tắc**

**Mỗi đơn hàng liên kết với customer_id.**

**Hệ thống xác định đúng tài khoản sở hữu đơn trước khi gửi thông báo.**

**Thông báo website được lưu trong tài khoản khách.**

**Email được gửi tới địa chỉ hợp lệ đã liên kết với tài khoản và được phép sử dụng cho thông báo giao dịch.**

**Không hiển thị dữ liệu của khách khác.**

## **26. Email xác nhận cọc GDTT**

**Tiêu đề: \[MODEL universe\] Đã xác nhận cọc đơn GDTT {{order_code}}**

**Xin chào {{customer_name}},**

**MODEL universe đã xác nhận khoản thanh toán trước cho đơn hàng {{order_code}} của bạn.**

**Thông tin đơn hàng**

- **Sản phẩm: {{product_summary}}**

- **Tổng giá trị sản phẩm: {{product_total}}**

- **Đã thanh toán: {{confirmed_paid}}**

- **Số tiền còn lại: {{remaining_amount}}**

- **Địa điểm giao dịch đề xuất: {{meeting_address}}**

- **Thời gian mong muốn: {{requested_meeting_time}}**

**Shop sẽ kiểm tra và xác nhận lịch giao dịch với bạn.**

**Bạn vui lòng chỉ đến địa điểm giao dịch sau khi lịch hẹn đã được xác nhận.**

**Xem đơn hàng: {{order_url}}**

**Cảm ơn bạn đã lựa chọn MODEL universe!**

## **27. Thông báo website GDTT**

**Đặt cọc đơn GDTT thành công!**

**Đơn hàng {{order_code}} đã được ghi nhận.**

**Đã thanh toán: {{confirmed_paid}}**

**Còn lại: {{remaining_amount}}**

**Địa điểm đề xuất: {{meeting_address}}**

**Trạng thái: Chờ shop xác nhận lịch hẹn.**

**\[Xem đơn hàng\]**

## **28. Email xác nhận cọc SPX COD**

**Tiêu đề: \[MODEL universe\] Xác nhận đơn hàng {{order_code}}**

**Xin chào {{customer_name}},**

**MODEL universe đã xác nhận khoản thanh toán trước cho đơn hàng {{order_code}}.**

**Thông tin thanh toán:**

- **Tổng giá trị sản phẩm: {{product_total}}**

- **Tổng đã thanh toán: {{confirmed_paid}}**

- **Số tiền sản phẩm còn lại: {{remaining_amount}}**

**Đơn hàng đang được chuẩn bị để tạo vận đơn SPX.**

**Số tiền COD chính thức sẽ được xác nhận sau khi hoàn tất kiểm tra phí vận chuyển và thông tin kiện hàng.**

**Xem đơn: {{order_url}}**

**Cảm ơn bạn đã mua sắm tại MODEL universe!**

## **29. Email thông báo mã vận đơn SPX**

**Tiêu đề: \[MODEL universe\] Đơn {{order_code}} đã có mã vận đơn SPX**

**Xin chào {{customer_name}},**

**Đơn hàng {{order_code}} của bạn đã được tạo vận đơn SPX thành công.**

**Thông tin vận chuyển**

- **Mã đơn hàng: {{order_code}}**

- **Đơn vị vận chuyển: SPX**

- **Mã vận đơn: {{tracking_number}}**

- **Trạng thái: {{shipping_status}}**

- **Số tiền COD: {{cod_amount}}**

**Bạn có thể theo dõi tại:**

**{{tracking_url}}**

**Lưu ý: Đơn đã có mã vận đơn nhưng SPX có thể chưa đến lấy hàng. Thông tin sẽ được cập nhật theo trạng thái vận chuyển thực tế.**

**Cảm ơn bạn đã tin tưởng MODEL universe!**

## **30. Thông báo website mã SPX**

**Đơn hàng đã có mã vận chuyển!**

**Mã đơn: {{order_code}}**

**Mã SPX: {{tracking_number}}**

**COD: {{cod_amount}}**

**Trạng thái: {{shipping_status}}**

**\[Theo dõi vận chuyển\]**

## **31. Email xác nhận lịch GDTT**

**Tiêu đề: \[MODEL universe\] Xác nhận lịch giao dịch đơn {{order_code}}**

**Xin chào {{customer_name}},**

**MODEL universe xác nhận lịch giao dịch trực tiếp của bạn như sau:**

- **Mã đơn: {{order_code}}**

- **Địa điểm: {{confirmed_meeting_address}}**

- **Thời gian: {{confirmed_meeting_time}}**

- **Số tiền còn lại: {{remaining_amount}}**

**Bạn vui lòng mang theo mã đơn hàng để nhân viên kiểm tra khi giao dịch.**

**Nếu cần thay đổi lịch hẹn, vui lòng gửi yêu cầu qua website trước thời gian giao dịch.**

**Cảm ơn bạn!**

## **32. Thông báo giao SPX thất bại**

**Đơn hàng chưa được giao thành công**

**Mã đơn: {{order_code}}**

**Mã vận đơn: {{tracking_number}}**

**Lý do: {{failure_reason}}**

**Vui lòng kiểm tra thông tin giao hàng hoặc liên hệ bộ phận hỗ trợ MODEL universe.**

**\[Xem đơn hàng\] \[Liên hệ hỗ trợ\]**

# **CHƯƠNG VII. GIAO DIỆN WEBSITE**

## **33. Trang thanh toán**

**Giao diện checkout gồm:**

### **Thông tin sản phẩm**

**Tên, mã, phiên bản, số lượng, giá trị đơn.**

### **Chọn tỷ lệ cọc**

**Mặc định 10%.**

**Cho phép chọn các mức từ 10% đến 100%.**

**Hiển thị ngay:**

- **Tiền phải thanh toán trước.**

- **Tiền sản phẩm còn lại.**

### **Chọn hình thức nhận hàng**

**GDTT**

**Hiển thị form địa điểm, ngày và giờ mong muốn.**

**SPX COD**

**Hiển thị form địa chỉ nhận hàng, thông tin người nhận, phí vận chuyển dự kiến và COD dự kiến.**

### **Xác nhận đơn**

**Hiển thị đầy đủ tổng tiền, tiền cọc, tiền còn lại, phương thức nhận hàng và điều kiện áp dụng trước khi khách thanh toán.**

## **34. Trang chi tiết đơn hàng**

**Khách xem:**

- **Mã đơn.**

- **Sản phẩm.**

- **Tiền đã thanh toán.**

- **Tiền còn lại.**

- **Hình thức nhận hàng.**

- **Trạng thái xử lý.**

- **Lịch hẹn GDTT hoặc mã SPX.**

- **Lịch sử thông báo.**

- **Lịch sử thanh toán.**

## **35. Trang thông báo**

**Có biểu tượng chuông trên website.**

**Khách xem:**

- **Đơn được xác nhận.**

- **Thanh toán thành công.**

- **Lịch GDTT được xác nhận.**

- **Vận đơn SPX được tạo.**

- **SPX lấy hàng.**

- **Đang giao hàng.**

- **Giao thành công.**

- **Giao thất bại.**

# **CHƯƠNG VIII. DASHBOARD ADMIN**

## **36. Danh sách đơn hàng**

**Admin có thể lọc:**

- **Đơn mới.**

- **Đơn chờ cọc.**

- **Đơn đã cọc.**

- **Đơn GDTT.**

- **Đơn SPX.**

- **Đơn chờ đóng gói.**

- **Đơn chờ tạo vận đơn.**

- **Đơn đã tạo vận đơn.**

- **Đơn đang giao.**

- **Đơn hoàn tất.**

- **Đơn lỗi.**

- **Đơn hoàn hàng.**

## **37. Quản lý GDTT**

**Admin được:**

- **Xem địa điểm khách đề xuất.**

- **Xác nhận lịch hẹn.**

- **Đề xuất thay đổi.**

- **Ghi chú nội bộ.**

- **Xác nhận giao hàng.**

- **Xác nhận thanh toán phần còn lại.**

- **Hoàn tất đơn.**

## **38. Quản lý SPX**

**Admin được:**

- **Kiểm tra địa chỉ.**

- **Xem kích thước kiện.**

- **Xem cân nặng.**

- **Xem COD.**

- **Xem phí vận chuyển.**

- **Tạo vận đơn.**

- **Xem mã SPX.**

- **In nhãn.**

- **Theo dõi vận chuyển.**

- **Xử lý lỗi.**

- **Đối soát COD.**

# **CHƯƠNG IX. DATABASE ĐỀ XUẤT**

## **39. Bảng orders**

**id**

**order_code**

**customer_id**

**fulfillment_method**

**product_total**

**deposit_percent**

**required_deposit_amount**

**confirmed_paid_amount**

**remaining_amount**

**order_status**

**payment_status**

**created_at**

**updated_at**

**fulfillment_method:**

**DIRECT_MEETING**

**SPX_COD**

## **40. Bảng order_payments**

**id**

**order_id**

**amount**

**payment_method**

**payment_status**

**transaction_reference**

**confirmed_at**

**created_at**

## **41. Bảng direct_meetings**

**id**

**order_id**

**requested_address**

**confirmed_address**

**requested_time**

**confirmed_time**

**meeting_status**

**handover_confirmed_at**

**confirmed_by**

## **42. Bảng shipments**

**id**

**order_id**

**carrier**

**carrier_order_id**

**tracking_number**

**tracking_url**

**recipient_snapshot**

**package_snapshot**

**shipping_fee**

**cod_amount**

**shipping_status**

**created_at**

**updated_at**

## **43. Bảng notifications**

**id**

**customer_id**

**order_id**

**event_type**

**title**

**content**

**is_read**

**created_at**

## **44. Bảng notification_deliveries**

**id**

**notification_id**

**channel**

**recipient_reference**

**provider_message_id**

**status**

**attempt_count**

**sent_at**

**delivered_at**

## **45. Bảng admin_alerts**

**id**

**order_id**

**alert_type**

**channel**

**title**

**content**

**status**

**created_at**

## **46. Bảng audit_logs**

**id**

**actor_id**

**actor_role**

**entity_type**

**entity_id**

**action**

**old_value**

**new_value**

**reason**

**created_at**

**Các khoản tiền phải được lưu bằng số nguyên VND hoặc kiểu decimal phù hợp.**

# **CHƯƠNG X. API NỘI BỘ ĐỀ XUẤT**

## **47. API đặt hàng**

**POST /checkout/preview**

**POST /orders**

**GET /orders/:id**

**POST /orders/:id/payments**

**GET /orders/:id/payments**

## **48. API GDTT**

**POST /orders/:id/direct-meeting**

**PATCH /admin/direct-meetings/:id**

**POST /admin/direct-meetings/:id/confirm**

**POST /admin/direct-meetings/:id/complete**

## **49. API SPX**

**POST /shipping/quote**

**POST /admin/shipments/confirm-package**

**POST /shipping/create**

**GET /shipping/:id/tracking**

**POST /shipping/spx/webhook**

## **50. API thông báo**

**GET /me/notifications**

**PATCH /me/notifications/:id/read**

**POST /internal/notifications/dispatch**

**GET /admin/notification-deliveries**

**Các API này là thiết kế nội bộ của MODEL universe, không phải endpoint SPX hoặc Zalo đã được xác minh.**

# **CHƯƠNG XI. XỬ LÝ NGOẠI LỆ**

## **51. Khách cọc dưới 10%**

**Từ chối xác nhận đơn.**

**Hiển thị số tiền cọc tối thiểu.**

## **52. Thanh toán thất bại**

**Không xác nhận đã cọc.**

**Không tạo vận đơn.**

## **53. Khách yêu cầu hủy đơn**

**Chuyển sang quy trình xét duyệt hủy và hoàn tiền.**

**Không tự động tịch thu tiền cọc.**

## **54. Khách thay đổi địa chỉ**

**Nếu chưa tạo vận đơn, cho phép thay đổi và tính lại phí.**

**Nếu đã tạo vận đơn, xử lý theo khả năng hỗ trợ của SPX.**

## **55. SPX tạo vận đơn thất bại**

**Ghi lỗi và thông báo Admin.**

**Không tạo mã vận đơn giả.**

**Không gửi email báo tạo đơn thành công.**

## **56. Zalo gửi thất bại**

**Lưu cảnh báo trong Admin.**

**Cho phép gửi lại.**

**Không ảnh hưởng tới đơn hàng đã được xác nhận.**

## **57. Email gửi thất bại**

**Giữ thông báo website.**

**Thử lại có giới hạn.**

## **58. SPX giao thất bại**

**Không hoàn tất đơn.**

**Không ghi nhận đã thu COD.**

**Chuyển sang quy trình xử lý giao lại hoặc hoàn hàng.**

## **59. GDTT không diễn ra**

**Không tự động hoàn tất đơn.**

**Admin phải ghi nhận nguyên nhân và xử lý theo chính sách hủy/đổi lịch đã công bố.**

# **CHƯƠNG XII. BẢO MẬT VÀ KIỂM SOÁT**

## **60. Phân quyền**

- **Khách chỉ xem đơn của mình.**

- **Nhân viên kho chỉ được sửa thông số đóng gói trong phạm vi cho phép.**

- **Nhân viên chăm sóc khách hàng không được tự ý xác nhận đã nhận tiền.**

- **Chỉ nhân viên có quyền mới được xác nhận giao dịch GDTT.**

- **Chỉ nhân viên có quyền mới được chỉnh sửa vận đơn hoặc duyệt hoàn tiền.**

## **61. Chống xử lý trùng**

**Hệ thống phải chống:**

- **Tạo hai đơn do khách bấm nhiều lần.**

- **Ghi nhận tiền cọc hai lần.**

- **Tạo hai vận đơn SPX cho cùng một lần giao.**

- **Gửi thông báo trùng do webhook lặp.**

- **Thu COD trùng với tiền đã thanh toán.**

## **62. Bảo vệ dữ liệu**

**Thông tin khách hàng chỉ được sử dụng cho mục đích xử lý đơn, giao hàng và thông báo hợp lệ.**

**Không gửi dữ liệu cá nhân nhạy cảm không cần thiết qua Zalo hoặc email.**

**Liên kết Admin phải yêu cầu đăng nhập và kiểm tra phân quyền.**

# **CHƯƠNG XIII. KIỂM THỬ NGHIỆP VỤ**

| **Mã**   | **Tình huống**                         | **Kết quả**                                 |
|----------|----------------------------------------|---------------------------------------------|
| **TC01** | **Khách chọn cọc 5%**                  | **Không cho xác nhận**                      |
| **TC02** | **Khách cọc 10%**                      | **Cho đặt hàng**                            |
| **TC03** | **Khách cọc 100%**                     | **Còn lại 0đ**                              |
| **TC04** | **Khách chọn GDTT**                    | **Hiện form địa điểm**                      |
| **TC05** | **Khách chọn SPX COD**                 | **Hiện form địa chỉ nhận**                  |
| **TC06** | **GDTT đã cọc**                        | **Thông báo Admin**                         |
| **TC07** | **Shop xác nhận lịch GDTT**            | **Thông báo khách**                         |
| **TC08** | **Khách thanh toán đủ khi GDTT**       | **Ghi nhận thanh toán**                     |
| **TC09** | **GDTT chưa bàn giao**                 | **Không hoàn tất**                          |
| **TC10** | **SPX thiếu kích thước**               | **Chặn tạo vận đơn**                        |
| **TC11** | **SPX tạo đơn thành công**             | **Lưu mã vận đơn**                          |
| **TC12** | **SPX trả lỗi**                        | **Cảnh báo Admin**                          |
| **TC13** | **SPX trả mã vận đơn**                 | **Thông báo khách**                         |
| **TC14** | **Khách không có email**               | **Vẫn nhận thông báo web**                  |
| **TC15** | **Zalo lỗi**                           | **Lưu cảnh báo**                            |
| **TC16** | **Thanh toán bổ sung**                 | **COD được tính lại trước khi tạo vận đơn** |
| **TC17** | **Webhook SPX lặp**                    | **Không tạo thông báo trùng**               |
| **TC18** | **Giao thất bại**                      | **Không hoàn tất**                          |
| **TC19** | **Giao thành công, COD chưa đối soát** | **Chờ đối soát**                            |
| **TC20** | **Khách khác mở đơn**                  | **Từ chối truy cập**                        |

# **CHƯƠNG XIV. CÁC QUY TẮC CẦN ADMIN CHỐT**

**Các nội dung sau chưa được xác định là quy định chính thức:**

1.  **Thời gian tối đa để khách thanh toán khoản cọc sau khi tạo đơn.**

2.  **Thời gian shop chuẩn bị hàng sau khi cọc thành công.**

3.  **Chính sách hoàn tiền cọc khi khách hủy.**

4.  **Chính sách khách không đến GDTT đúng hẹn.**

5.  **Phí giao dịch trực tiếp tại địa điểm do khách yêu cầu.**

6.  **Phương án xử lý nếu SPX không nhận vận chuyển.**

7.  **Ai thanh toán phí hoàn hàng khi giao thất bại.**

8.  **Có cho phép thanh toán bổ sung sau khi đã tạo vận đơn hay không.**

9.  **Kênh Zalo chính thức được phép nhận thông báo tự động.**

10. **Quyền truy cập API SPX và giới hạn COD thực tế.**

**Những quy tắc chưa chốt phải được cấu hình riêng, không tự đưa thành chính sách cố định.**

# **CHƯƠNG XV. KẾT LUẬN**

**Hệ thống mua hàng đặt cọc MODEL universe vận hành theo nguyên tắc:**

**CỌC MUA HÀNG TỪ 10% – CHỌN GDTT HOẶC SPX COD – TÍNH ĐÚNG TIỀN CÒN LẠI – TỰ ĐỘNG TẠO VẬN ĐƠN – THÔNG BÁO ĐÚNG NGƯỜI – ĐỐI SOÁT MINH BẠCH.**

**Khách hàng được chủ động lựa chọn tỷ lệ thanh toán trước và phương thức nhận hàng.**

**MODEL universe có thể quản lý cả giao dịch trực tiếp lẫn giao hàng COD từ một hệ thống duy nhất, đồng thời giảm thao tác nhập liệu thủ công, hạn chế sai sót thanh toán và nâng cao chất lượng phục vụ.**
