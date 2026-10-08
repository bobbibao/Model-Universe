# **ĐẶC TẢ CHỨC NĂNG CẦM CỐ MÔ HÌNH – WEBSITE VŨ TRỤ MÔ HÌNH**

## **1. Mục đích chức năng**

Chức năng cầm cố mô hình cho phép khách hàng gửi yêu cầu cầm cố mô hình trực tuyến trên website Vũ Trụ Mô Hình.

Khách hàng có thể cung cấp thông tin và hình ảnh mô hình để shop tiếp nhận, kiểm tra, thẩm định và đưa ra mức giá cầm phù hợp.

Sau khi giao dịch được xác nhận, hệ thống quản lý toàn bộ quá trình từ lúc tạo khoản cầm, nhận tiền, tính lãi theo ngày, thanh toán và chuộc mô hình hoặc chuyển sang trạng thái xử lý tài sản khi khách không thực hiện nghĩa vụ theo thỏa thuận.

# **2. Quy trình hoạt động tổng quát**

Website hoạt động theo quy trình:

**Khách gửi yêu cầu → Shop tiếp nhận → Thẩm định mô hình → Báo giá → Khách xác nhận → Tạo hợp đồng → Giao nhận mô hình → Giải ngân → Theo dõi khoản cầm → Chuộc hoặc gia hạn → Hoàn tất**

Nếu khách không thực hiện chuộc theo thời hạn:

**Đến hạn → Thông báo → Gia hạn nếu được chấp thuận → Quá hạn → Xử lý tài sản theo hợp đồng**

# **3. Chức năng dành cho khách hàng**

## **3.1. Gửi yêu cầu cầm mô hình**

Khách hàng truy cập chức năng **Cầm mô hình** trên website và điền thông tin.

Thông tin yêu cầu gồm:

- Họ và tên

- Số điện thoại

- Phương thức liên hệ

- Tên mô hình

- Hãng sản xuất

- Phiên bản

- Tình trạng mô hình

- Mô hình NEW / 2nd / đã build

- Có hộp hay không

- Phụ kiện đi kèm

- Tình trạng phụ kiện

- Giá trị mong muốn

- Hình ảnh mô hình

- Ghi chú thêm

Sau khi gửi, hệ thống tạo một **Mã yêu cầu cầm cố** để khách theo dõi.

# **4. Trạng thái yêu cầu cầm**

Mỗi yêu cầu cầm cố được quản lý theo các trạng thái:

**Chờ tiếp nhận**

→ Shop chưa kiểm tra yêu cầu.

**Đang thẩm định**

→ Shop đang kiểm tra thông tin và tình trạng mô hình.

**Đã báo giá**

→ Shop đã đưa ra giá trị tài sản và số tiền có thể cầm.

**Chờ khách xác nhận**

→ Khách đang xem và xác nhận mức cầm.

**Đã xác nhận**

→ Hai bên đồng ý giao dịch.

**Đang hoàn tất giao nhận**

→ Mô hình đang được bàn giao và kiểm tra thực tế.

**Đang cầm**

→ Khoản cầm đã được giải ngân.

**Đã chuộc**

→ Khách đã thanh toán và nhận lại mô hình.

**Đang gia hạn**

→ Khoản cầm được shop chấp thuận gia hạn.

**Quá hạn**

→ Đã đến hạn nhưng khách chưa chuộc hoặc chưa được gia hạn.

**Đã xử lý tài sản**

→ Tài sản được xử lý theo điều khoản hợp đồng.

**Từ chối**

→ Yêu cầu không đủ điều kiện cầm.

# **5. Thẩm định giá trị mô hình**

Admin có chức năng nhập giá trị thẩm định của mô hình.

Giá trị thẩm định được xác định dựa trên:

- Giá thị trường

- Tình trạng mô hình

- Độ hiếm

- Phiên bản

- Hãng

- Tình trạng hộp

- Phụ kiện

- Mức độ hoàn thiện

- Khả năng thanh khoản

Sau khi nhập giá trị thẩm định, hệ thống tự động tính khoảng tiền khách có thể nhận.

### **Công thức**

**Mức cầm tối thiểu = Giá trị thẩm định × 50%**

**Mức cầm tối đa = Giá trị thẩm định × 80%**

Ví dụ:

Giá trị thẩm định:

**2.000.000đ**

Mức cầm:

**1.000.000đ – 1.600.000đ**

Admin có thể lựa chọn một mức cụ thể trong khoảng này dựa trên tình trạng thực tế của mô hình.

# **6. Xác nhận khoản cầm**

Sau khi thẩm định, hệ thống hiển thị cho khách:

- Giá trị mô hình được thẩm định

- Tỷ lệ cầm

- Số tiền được nhận

- Lãi suất

- Ngày bắt đầu

- Ngày đáo hạn

- Số tiền lãi dự kiến

- Điều kiện chuộc

- Điều kiện gia hạn

- Điều kiện xử lý tài sản

Khách xác nhận đồng ý trước khi giao dịch được tạo thành hợp đồng.

# **7. Tạo hợp đồng cầm cố**

Sau khi khách đồng ý, hệ thống tạo thông tin hợp đồng gồm:

- Mã hợp đồng

- Mã khách hàng

- Thông tin khách hàng

- Thông tin mô hình

- Hình ảnh tài sản

- Tình trạng tài sản

- Giá trị thẩm định

- Tỷ lệ cầm

- Số tiền cầm

- Lãi suất

- Ngày bắt đầu

- Ngày đáo hạn

- Điều kiện gia hạn

- Điều kiện chuộc

- Điều kiện xử lý tài sản

- Trạng thái hợp đồng

Hợp đồng phải được hai bên xác nhận trước khi khoản cầm được kích hoạt.

# **8. Tính tiền lãi tự động**

Website tự động tính tiền lãi theo ngày.

### **Lãi suất**

**0,03%/ngày**

### **Công thức**

**Tiền lãi = Tiền cầm × 0,03% × Số ngày cầm**

Ví dụ:

Tiền cầm:

**1.400.000đ**

Lãi mỗi ngày:

**1.400.000 × 0,03% = 420đ**

Sau 30 ngày:

**420 × 30 = 12.600đ**

Tổng tiền chuộc:

**1.412.600đ**

Hệ thống phải tự động cập nhật số ngày cầm và tiền lãi theo ngày.

# **9. Giới hạn tiền lãi**

Hệ thống phải đặt giới hạn:

**Tổng tiền lãi ≤ Số tiền gốc đã cầm**

Ví dụ:

Khách nhận:

**1.400.000đ**

Thì tổng tiền lãi tối đa được hệ thống ghi nhận là:

**1.400.000đ**

Khi tiền lãi đạt mức này:

**Hệ thống ngừng cộng thêm tiền lãi.**

Tuy nhiên, việc đạt giới hạn lãi không đồng nghĩa với việc khách tự động mất tài sản. Việc xử lý tài sản phải căn cứ vào thời hạn hợp đồng và các điều khoản đã được hai bên xác nhận.

# **10. Trang quản lý khoản cầm của khách**

Khách hàng có trang **Khoản cầm của tôi**.

Trang này hiển thị:

**Mã hợp đồng**

**Tên mô hình**

**Giá trị tài sản**

**Số tiền đã nhận**

**Ngày cầm**

**Ngày đáo hạn**

**Số ngày đã cầm**

**Lãi suất**

**Tiền lãi hiện tại**

**Tổng tiền cần chuộc**

**Trạng thái**

Khách có thể xem số tiền cần thanh toán tại thời điểm hiện tại.

# **11. Chức năng chuộc mô hình**

Khách chọn:

**Chuộc mô hình**

Hệ thống tự động tính:

**Tiền gốc + tiền lãi hiện tại = Tổng tiền cần thanh toán**

Sau khi khách hoàn tất thanh toán và shop xác nhận, hệ thống chuyển trạng thái:

**Đang cầm → Đã chuộc**

Khoản cầm được đóng và mô hình được trả lại cho khách.

# **12. Chức năng gia hạn**

Trước hoặc khi đến hạn, khách có thể gửi yêu cầu gia hạn.

Hệ thống hiển thị:

- Ngày hết hạn hiện tại

- Số ngày đã cầm

- Tiền lãi hiện tại

- Số tiền cần chuộc

- Thời gian gia hạn đề nghị

Admin xem xét và quyết định:

**Chấp nhận gia hạn**

hoặc

**Từ chối gia hạn**

Nếu được chấp nhận, hệ thống cập nhật ngày đáo hạn mới và lưu lại lịch sử gia hạn.

# **13. Xử lý quá hạn**

Khi đến ngày đáo hạn:

Nếu khách đã chuộc:

**→ Đóng hợp đồng**

Nếu khách yêu cầu và được chấp thuận gia hạn:

**→ Chuyển sang trạng thái gia hạn**

Nếu khách không chuộc và không được gia hạn:

**→ Chuyển trạng thái quá hạn**

Hệ thống gửi thông báo cho khách.

Sau thời gian xử lý theo hợp đồng, shop có thể chuyển tài sản sang trạng thái:

**Được phép xử lý**

Sau đó mô hình có thể được shop:

- Giữ lại

- Đưa vào kho

- Đăng bán

- Thanh lý

# **14. Quản lý tài sản sau khi quá hạn**

Khi tài sản được chuyển sang quyền xử lý của shop, hệ thống phải tách riêng trạng thái tài sản:

**Đang cầm**

→ **Quá hạn**

→ **Được xử lý**

→ **Đưa vào kho**

→ **Đang bán**

→ **Đã bán**

Điều này giúp liên kết chức năng cầm cố với chức năng **quản lý kho và bán mô hình** của Vũ Trụ Mô Hình.

# **15. Quản lý dành cho Admin**

Admin có trang quản lý toàn bộ hoạt động cầm cố.

Có thể:

- Xem danh sách yêu cầu

- Xem thông tin khách hàng

- Xem hình ảnh mô hình

- Thẩm định giá

- Nhập giá trị tài sản

- Chọn tỷ lệ cầm

- Nhập số tiền giải ngân

- Tạo hợp đồng

- Xác nhận giao dịch

- Xác nhận thanh toán

- Xác nhận chuộc

- Gia hạn hợp đồng

- Chuyển trạng thái quá hạn

- Xử lý tài sản

- Đưa tài sản vào kho

- Chuyển tài sản sang bán

- Xem lịch sử giao dịch

# **16. Lịch sử giao dịch**

Mỗi hợp đồng phải lưu lại lịch sử:

- Thời điểm tạo yêu cầu

- Thời điểm thẩm định

- Giá trị thẩm định

- Tỷ lệ cầm

- Số tiền giải ngân

- Ngày bắt đầu

- Các lần thanh toán

- Các lần gia hạn

- Tiền lãi từng thời điểm

- Ngày chuộc

- Người thực hiện thao tác

- Thời điểm thay đổi trạng thái

Lịch sử này không được tự ý xóa để đảm bảo khả năng kiểm tra giao dịch.

# **17. Thông báo tự động**

Hệ thống có thể gửi thông báo cho khách khi:

- Yêu cầu đã được tiếp nhận

- Đã có kết quả thẩm định

- Đã có mức cầm

- Hợp đồng được tạo

- Khoản cầm được kích hoạt

- Sắp đến hạn

- Đến ngày đáo hạn

- Được gia hạn

- Chuyển sang quá hạn

- Đủ điều kiện chuộc

- Đã hoàn tất chuộc

- Tài sản chuyển sang trạng thái xử lý

# **18. Tích hợp với hệ thống thành viên**

Chức năng cầm cố cần được thiết kế sẵn để kết nối với **hệ thống điểm và hạng thành viên**.

Sau này có thể áp dụng:

**Giao dịch cầm thành công → cộng điểm**

**Chuộc đúng hạn → cộng điểm thưởng**

**Khách hàng có lịch sử tốt → tăng quyền lợi**

**Hạng thành viên cao → được ưu đãi theo chính sách**

Ví dụ quyền lợi trong tương lai có thể bao gồm:

- Tỷ lệ cầm tốt hơn

- Ưu đãi lãi suất

- Ưu tiên gia hạn

- Ưu tiên thẩm định

- Ưu đãi khi mua mô hình

Phần này **chưa áp dụng vào công thức chính** cho đến khi xây dựng xong hệ thống điểm.

# **19. Các dữ liệu cần lưu trong cơ sở dữ liệu**

Hệ thống tối thiểu cần các nhóm dữ liệu:

### **Khách hàng**

- customer_id

- họ tên

- số điện thoại

- tài khoản

- điểm

- hạng thành viên

- lịch sử giao dịch

### **Tài sản**

- asset_id

- tên mô hình

- hãng

- phiên bản

- tình trạng

- phụ kiện

- hình ảnh

- giá trị thẩm định

- trạng thái tài sản

### **Hợp đồng cầm**

- contract_id

- customer_id

- asset_id

- giá trị thẩm định

- tỷ lệ cầm

- số tiền cầm

- lãi suất

- ngày bắt đầu

- ngày đáo hạn

- tiền lãi

- số tiền cần chuộc

- trạng thái

### **Thanh toán**

- payment_id

- contract_id

- số tiền

- loại thanh toán

- thời gian

- phương thức thanh toán

- người xác nhận

### **Lịch sử**

- history_id

- contract_id

- hành động

- thời gian

- người thực hiện

- nội dung thay đổi

# **20. Nguyên tắc vận hành chính**

Toàn bộ chức năng cầm cố của Vũ Trụ Mô Hình phải đảm bảo 4 nguyên tắc:

**MINH BẠCH**

Khách luôn biết mô hình được định giá bao nhiêu, nhận bao nhiêu tiền và đang phát sinh bao nhiêu tiền lãi.

**TỰ ĐỘNG**

Hệ thống tự tính số ngày, tiền lãi, số tiền cần chuộc và cập nhật trạng thái theo thời gian.

**AN TOÀN**

Thông tin tài sản, hợp đồng và lịch sử giao dịch được lưu trữ đầy đủ.

**LIÊN KẾT**

Cầm cố phải liên kết được với hệ thống khách hàng, điểm thành viên, kho hàng và bán hàng của Vũ Trụ Mô Hình.

## **Luồng nghiệp vụ chính**

**KHÁCH HÀNG**

Gửi mô hình  
↓  
Gửi yêu cầu cầm  
↓  
Chờ thẩm định  
↓  
Nhận báo giá  
↓  
Xác nhận  
↓  
Bàn giao mô hình  
↓  
Nhận tiền  
↓  
Theo dõi khoản cầm  
↓  
Chuộc / Gia hạn  
↓  
Nhận lại mô hình

**SHOP**

Tiếp nhận  
↓  
Kiểm tra  
↓  
Định giá  
↓  
Xác định 50%–80%  
↓  
Tạo hợp đồng  
↓  
Giải ngân  
↓  
Theo dõi  
↓  
Xác nhận chuộc / gia hạn  
↓  
Hoặc xử lý tài sản khi đủ điều kiện
