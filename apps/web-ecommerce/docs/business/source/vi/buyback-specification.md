# **ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG THU MUA MÔ HÌNH**

## **MODEL UNIVERSE – VŨ TRỤ MÔ HÌNH**

**Phiên bản:** 2.0 – Cập nhật quy định tất cả lỗi 50.000đ/lỗi  
**Loại tài liệu:** BRD + SRS – Đặc tả nghiệp vụ và kỹ thuật  
**Áp dụng:** Website khách hàng, quản trị Admin, kiểm hàng, vận chuyển, báo giá và thanh toán thu mua.

# **CHƯƠNG I. MỤC ĐÍCH VÀ NGUYÊN TẮC HOẠT ĐỘNG**

## **1. Mục đích**

MODEL universe triển khai chức năng **THU MÔ HÌNH** nhằm hỗ trợ khách hàng bán lại các sản phẩm mô hình mà shop có nhu cầu thu mua.

Website cho phép:

1.  Khách lựa chọn sản phẩm muốn bán lại.

2.  Hệ thống lấy giá bán tham chiếu của shop.

3.  Tự động xác định mức giá thu cơ bản.

4.  Khách khai báo tình trạng thực tế.

5.  Tự động khấu trừ 50.000đ cho mỗi lỗi.

6.  Khách cung cấp hình ảnh và video.

7.  Hệ thống tính giá thu dự kiến.

8.  Khách gửi yêu cầu thu mua.

9.  Shop kiểm tra hồ sơ và xác nhận tiếp nhận.

10. Khách giao hàng trực tiếp hoặc gửi vận chuyển đến shop.

11. Shop quay video nhận hàng, mở kiện và kiểm tra lại toàn bộ sản phẩm.

12. Shop đối chiếu thực tế với thông tin khách đã cung cấp.

13. Shop báo kết quả kiểm hàng và giá thu chính thức.

14. Khách xác nhận đồng ý hoặc không đồng ý.

15. Shop thanh toán nếu giao dịch được hai bên thống nhất.

16. Nếu không thống nhất, shop xử lý trả hàng theo chính sách.

## **2. Nguyên tắc bắt buộc**

- Giá thu cơ bản được tính theo bảng giá MODEL universe.

- Tất cả các loại lỗi thông thường đều trừ 50.000đ/lỗi.

- Không áp dụng mức trừ khác nhau cho từng loại lỗi.

- Không tăng mức trừ theo giá trị mô hình.

- Không tự động nhân đôi tiền trừ cho cùng một lỗi.

- Mọi lỗi phải có mô tả và bằng chứng.

- Khách bắt buộc khai báo tình trạng trung thực.

- Hình ảnh/video phải thể hiện đầy đủ tình trạng.

- Giá hiển thị ban đầu chỉ là giá thu dự kiến.

- Khi shop nhận hàng phải quay video và kiểm tra lại.

- Giá thu cuối cùng phải được gửi để khách xác nhận.

- Shop không được tự ý hoàn tất thu mua khi khách chưa đồng ý giá cuối.

- Nếu phát hiện lỗi nghiêm trọng ngoài phạm vi bảng giá, shop có thể đề xuất báo giá thủ công hoặc từ chối thu, có giải thích rõ ràng.

# **CHƯƠNG II. BẢNG GIÁ THU CƠ BẢN**

## **3. Giá tham chiếu**

Giá tham chiếu là giá bán được MODEL universe xác định cho đúng sản phẩm, mã kit, phiên bản và tình trạng tương đương.

Không sử dụng giá do khách tự nhập làm giá chuẩn.

Đối với sản phẩm chưa có trong hệ thống, Admin phải định giá thủ công.

## **4. Bảng trừ cơ bản theo giá trị sản phẩm**

| **Giá bán tham chiếu**       | **Mức trừ cơ bản**     |
|------------------------------|------------------------|
| Đến 500.000đ                 | 100.000đ               |
| Trên 500.000đ – 1.000.000đ   | 150.000đ               |
| Trên 1.000.000đ – 1.500.000đ | 200.000đ               |
| Trên 1.500.000đ – 2.000.000đ | 300.000đ               |
| Trên 2.000.000đ – 3.000.000đ | 400.000đ               |
| Trên 3.000.000đ – 5.000.000đ | 500.000đ               |
| Trên 5.000.000đ              | Admin báo giá thủ công |

Bảng này giữ nguyên mức trừ cơ bản, chỉ chuẩn hóa khoảng giá và điểm ranh giới để lập trình.

## **5. Ví dụ hàng đầy đủ, không lỗi**

| **Giá shop bán** | **Trừ cơ bản** | **Giá thu dự kiến** |
|------------------|----------------|---------------------|
| 500.000đ         | 100.000đ       | 400.000đ            |
| 1.000.000đ       | 150.000đ       | 850.000đ            |
| 1.500.000đ       | 200.000đ       | 1.300.000đ          |
| 2.000.000đ       | 300.000đ       | 1.700.000đ          |
| 3.000.000đ       | 400.000đ       | 2.600.000đ          |
| 5.000.000đ       | 500.000đ       | 4.500.000đ          |

Các giá trị trên áp dụng khi hàng đáp ứng đủ điều kiện của nhóm hàng đầy đủ, không lỗi.

# **CHƯƠNG III. QUY ĐỊNH TẤT CẢ LỖI TRỪ 50.000Đ/LỖI**

## **6. Quy định chính thức**

**Tất cả các loại lỗi thông thường của mô hình đều được khấu trừ 50.000đ cho mỗi lỗi được ghi nhận.**

Không phân biệt giá trị sản phẩm và không áp dụng mức trừ tăng theo từng bậc.

## **7. Bảng lỗi thống nhất**

| **Loại lỗi**       | **Đơn vị tính**                      | **Mức trừ** |
|--------------------|--------------------------------------|-------------|
| Thiếu hộp gốc      | 1 tình trạng                         | 50.000đ     |
| Gãy part           | 1 part gãy                           | 50.000đ     |
| Thiếu phụ kiện     | 1 món phụ kiện                       | 50.000đ     |
| Lắp ráp xấu        | 1 tình trạng lắp xấu của mô hình     | 50.000đ     |
| Dính keo           | 1 vị trí có keo                      | 50.000đ     |
| Nứt part           | 1 part nứt                           | 50.000đ     |
| Trầy xước          | 1 khu vực lỗi được ghi nhận          | 50.000đ     |
| Mất decal          | 1 mục decal thiếu theo danh mục kiểm | 50.000đ     |
| Lỏng khớp          | 1 khớp lỗi                           | 50.000đ     |
| Thiếu chi tiết nhỏ | 1 chi tiết thiếu                     | 50.000đ     |
| Hộp hư hỏng        | 1 tình trạng hộp hư                  | 50.000đ     |
| Lỗi khác           | 1 lỗi riêng biệt                     | 50.000đ     |

Các loại lỗi chưa có trong danh sách vẫn được tính 50.000đ/lỗi nếu đủ điều kiện xác định là lỗi thông thường.

## **8. Cách đếm lỗi**

### **8.1. Thiếu hộp**

Không có hộp nguyên bản:

- Số lượng lỗi: 1.

- Mức trừ: 50.000đ.

Không trừ thêm chỉ vì không có ảnh hộp khi khách đã khai báo thiếu hộp.

### **8.2. Gãy part**

- Gãy 1 part: 50.000đ.

- Gãy 2 part: 100.000đ.

- Gãy 3 part: 150.000đ.

Mỗi part gãy được tính là một lỗi.

### **8.3. Thiếu phụ kiện**

- Thiếu 1 món: 50.000đ.

- Thiếu 2 món: 100.000đ.

- Thiếu 3 món: 150.000đ.

- Thiếu 4 món: 200.000đ.

**Không còn quy định thiếu phụ kiện ở bậc giá cao sẽ trừ nhiều tiền hơn.**

### **8.4. Lắp ráp xấu**

Nếu toàn bộ mô hình thuộc tình trạng lắp ráp xấu, mặc định tính 1 lỗi và trừ 50.000đ.

Không tính mỗi vết cắt xấu thành một lỗi riêng nếu tất cả đã thuộc cùng một tình trạng lắp ráp xấu.

### **8.5. Dính keo**

Mỗi vị trí dính keo riêng biệt được tính một lỗi.

- 1 vị trí: 50.000đ.

- 2 vị trí: 100.000đ.

### **8.6. Trầy xước**

Mỗi khu vực trầy xước độc lập được kiểm tra và ghi nhận là một lỗi.

Không được cố tình chia nhỏ một vết trầy thành nhiều lỗi để tăng tiền trừ.

### **8.7. Lỗi khác**

Khách có thể nhập tên, số lượng và mô tả lỗi.

Mức trừ tự động:

50.000đ × số lỗi hợp lệ.

## **9. Tránh trừ trùng lỗi**

Một hư hỏng có thể có nhiều biểu hiện.

Ví dụ part gãy đã được dán lại bằng keo.

Nhân viên phải xác định đây là:

- Một lỗi gãy part có dấu sửa chữa.

- Hay hai lỗi độc lập thực sự ảnh hưởng đến sản phẩm.

Mặc định không trừ hai lần cho cùng một sự cố nếu không có căn cứ rõ ràng.

## **10. Lỗi nghiêm trọng**

Đối với lỗi khiến sản phẩm mất chức năng chính, biến dạng lớn, thiếu bộ phận trọng yếu hoặc không còn đủ điều kiện thu mua, hệ thống không tự ý nâng mức trừ trên 50.000đ/lỗi.

Thay vào đó chuyển sang **kiểm tra và báo giá thủ công**.

Shop có thể:

- Giữ mức giá theo công thức nếu chấp nhận.

- Đề xuất giá thu mới với lý do rõ ràng.

- Từ chối thu mua.

Mọi đề xuất mới đều cần khách xác nhận.

# **CHƯƠNG IV. CÔNG THỨC TÍNH GIÁ THU**

## **11. Công thức chuẩn**

Giá thu cơ bản =

Giá bán tham chiếu - Mức trừ cơ bản theo bậc

Tổng tiền trừ lỗi =

Tổng số lỗi hợp lệ × 50.000đ

Giá thu dự kiến =

MAX(

0,

Giá thu cơ bản - Tổng tiền trừ lỗi

)

Công thức này áp dụng cho các sản phẩm trong phạm vi định giá tự động.

Nếu giá tham chiếu không hợp lệ, lỗi quá nghiêm trọng hoặc giá thu dự kiến bằng 0, đơn chuyển sang Admin xem xét.

## **12. Ví dụ 1 – Hàng hoàn hảo**

Giá shop bán: 1.500.000đ.

Mức trừ cơ bản: 200.000đ.

Số lỗi: 0.

**Giá thu dự kiến: 1.300.000đ.**

## **13. Ví dụ 2 – Hàng thiếu box và gãy part**

Giá shop bán: 1.500.000đ.

Mức trừ cơ bản: 200.000đ.

Thiếu box: 50.000đ.

Gãy 1 part: 50.000đ.

Tổng lỗi: 2.

Tổng trừ lỗi: 100.000đ.

**Giá thu dự kiến: 1.200.000đ.**

## **14. Ví dụ 3 – Hàng nhiều lỗi**

Giá shop bán: 2.000.000đ.

Mức trừ cơ bản: 300.000đ.

- Thiếu box: 1 lỗi.

- Gãy 2 part: 2 lỗi.

- Lắp xấu: 1 lỗi.

- Dính keo 1 vị trí: 1 lỗi.

- Thiếu 2 phụ kiện: 2 lỗi.

Tổng: 7 lỗi.

Trừ lỗi: 350.000đ.

2.000.000đ

\- 300.000đ

\- 350.000đ

= 1.350.000đ

**Giá thu dự kiến: 1.350.000đ.**

## **15. Ví dụ 4 – Hàng giá 5 triệu**

Giá bán tham chiếu: 5.000.000đ.

Trừ cơ bản: 500.000đ.

Gãy 2 part: 100.000đ.

Thiếu 3 phụ kiện: 150.000đ.

Tổng trừ lỗi: 250.000đ.

**Giá thu dự kiến: 4.250.000đ.**

# **CHƯƠNG V. CHỨC NĂNG GỬI YÊU CẦU THU HÀNG**

## **16. Bước 1 – Chọn sản phẩm**

Khách chọn mục **THU MÔ HÌNH**.

Hệ thống cho phép tìm theo:

- Hãng.

- Tên mô hình.

- Mã kit.

- Phiên bản.

- Màu sắc.

- SKU.

Website lấy giá bán tham chiếu do Admin quản lý.

Nếu không tìm thấy sản phẩm, khách vẫn có thể gửi thông tin và hình ảnh để xin định giá thủ công.

## **17. Bước 2 – Khai báo tình trạng**

Khách phải cung cấp:

- Tình trạng đã lắp hay chưa lắp.

- Tình trạng hộp.

- Số lượng part gãy.

- Số lượng part nứt.

- Số lượng phụ kiện thiếu.

- Các vị trí dính keo.

- Tình trạng lắp ráp.

- Các lỗi phát sinh khác.

Mỗi loại lỗi được chọn sẽ cập nhật giá thu dự kiến.

## **18. Bước 3 – Nhập thông tin lỗi**

Mỗi lỗi cần có:

issue_id

issue_type

issue_description

issue_quantity

deduction_per_issue = 50000

deduction_total

evidence_media_ids

Ví dụ:

Loại lỗi: Gãy part

Số lượng: 2

Vị trí: Khớp tay trái, chi tiết vai phải

Tiền trừ: 100.000đ

## **19. Bước 4 – Upload hình ảnh/video**

Khách tải hình ảnh và video chứng minh tình trạng sản phẩm.

Hệ thống phải kiểm tra hồ sơ media tối thiểu trước khi cho gửi yêu cầu.

## **20. Bước 5 – Xem giá dự kiến**

Website hiển thị:

Tên mô hình: {{product_name}}

Mã sản phẩm: {{product_sku}}

Giá tham chiếu: {{reference_price}}

Mức trừ cơ bản: {{base_deduction}}

Tổng lỗi khai báo: {{issue_count}}

Trừ lỗi:

{{issue_count}} × 50.000đ

Tổng tiền trừ lỗi: {{issue_deduction}}

GIÁ THU DỰ KIẾN:

{{estimated_buyback_price}}

Bên dưới có thông báo cảnh báo bắt buộc.

## **21. Bước 6 – Xác nhận gửi yêu cầu**

Trước khi gửi, khách xác nhận đã:

- Cung cấp thông tin sản phẩm trung thực.

- Khai báo các lỗi đã biết.

- Tải hình ảnh/video rõ ràng.

- Hiểu giá ban đầu chỉ là giá dự kiến.

- Hiểu shop sẽ quay video kiểm tra lại sau khi nhận hàng.

- Đồng ý nhận thông báo kết quả kiểm tra và đưa ra quyết định về giá thu cuối cùng.

# **CHƯƠNG VI. QUY ĐỊNH HÌNH ẢNH VÀ VIDEO**

## **22. Hình ảnh khách phải cung cấp**

Đối với mô hình đã lắp:

1.  Ảnh mặt trước.

2.  Ảnh mặt sau.

3.  Ảnh bên trái.

4.  Ảnh bên phải.

5.  Ảnh hộp nếu có.

6.  Ảnh toàn bộ phụ kiện được bày ra.

7.  Ảnh cận cảnh những lỗi đã khai báo.

Đối với mô hình chưa lắp:

- Ảnh hộp.

- Ảnh toàn bộ runner/túi part.

- Ảnh sách hướng dẫn.

- Ảnh decal và phụ kiện.

- Ảnh lỗi nếu có.

## **23. Video của khách**

Khách cần quay rõ:

- Toàn bộ mô hình.

- Các mặt của sản phẩm.

- Part và phụ kiện đi kèm.

- Những vị trí bị lỗi.

- Các món còn đủ hoặc đang thiếu theo danh mục.

Video không được cố tình che giấu vị trí lỗi.

Không yêu cầu khách quay khuôn mặt hoặc cung cấp thông tin cá nhân không cần thiết.

## **24. Hồ sơ thiếu hình ảnh/video**

Nếu thông tin không đầy đủ:

Trạng thái chuyển sang NEED_MORE_EVIDENCE.

Website yêu cầu khách bổ sung trước khi shop xác nhận báo giá sơ bộ.

# **CHƯƠNG VII. QUY TRÌNH TIẾP NHẬN VÀ QUAY VIDEO KIỂM HÀNG**

## **25. Quy định bắt buộc**

**Tất cả các yêu cầu thu mua được chấp thuận tiếp nhận phải được kiểm tra lại trước khi shop xác nhận giá thu cuối cùng.**

Đối với sản phẩm gửi từ xa, shop thực hiện quay video quá trình tiếp nhận, mở kiện và kiểm tra.

Đối với sản phẩm giao trực tiếp, nhân viên ghi hình hoặc chụp các bước kiểm tra quan trọng theo quy trình tiếp nhận tại quầy.

## **26. Quy trình nhận hàng từ xa**

KHÁCH GỬI YÊU CẦU THU

↓

SHOP DUYỆT HỒ SƠ

↓

KHÁCH XÁC NHẬN GỬI HÀNG

↓

KHÁCH ĐÓNG GÓI

↓

KHÁCH GỬI VẬN CHUYỂN

↓

SHOP NHẬN KIỆN

↓

QUAY VIDEO KIỆN HÀNG

↓

QUAY QUÁ TRÌNH MỞ KIỆN

↓

QUAY TOÀN BỘ SẢN PHẨM

↓

KIỂM TRA PART VÀ PHỤ KIỆN

↓

ĐỐI CHIẾU KHAI BÁO BAN ĐẦU

↓

TỔNG HỢP LỖI THỰC TẾ

↓

TÍNH LẠI GIÁ THU

↓

GỬI KẾT QUẢ CHO KHÁCH

↓

CHỜ KHÁCH XÁC NHẬN

## **27. Tiêu chuẩn video mở kiện**

Video cần thể hiện:

- Mã yêu cầu thu mua.

- Tình trạng kiện hàng trước mở.

- Tình trạng niêm phong nếu có.

- Quá trình mở kiện.

- Sản phẩm trong kiện.

- Toàn bộ phụ kiện đi kèm.

- Những lỗi được phát hiện.

- Kết quả đối chiếu với hồ sơ khách.

Video cần đủ rõ để kiểm tra lại khi xảy ra tranh chấp.

Không chỉnh sửa hoặc cắt ghép video gốc làm mất ngữ cảnh bằng chứng.

Các đoạn trích để thông báo lỗi có thể được tạo riêng nhưng phải giữ bản gốc.

## **28. Danh sách kiểm hàng**

Nhân viên thực hiện:

| **Hạng mục** | **Nội dung**              |
|--------------|---------------------------|
| Mã sản phẩm  | Đúng mã kit               |
| Phiên bản    | Đúng phiên bản và màu     |
| Hộp          | Có/thiếu/hư               |
| Runner/part  | Đầy đủ hoặc thiếu         |
| Gãy/nứt      | Ghi từng part             |
| Khớp         | Kiểm tra lỏng, hỏng       |
| Phụ kiện     | Đối chiếu danh sách chuẩn |
| Lắp ráp      | Đánh giá tình trạng       |
| Keo          | Ghi từng vị trí           |
| Bề mặt       | Kiểm tra trầy, móp        |
| Lỗi khác     | Mô tả và chụp minh chứng  |

## **29. Quy tắc kiểm tra thực tế**

Nếu tình trạng giống khách khai báo:

- Xác nhận hồ sơ đúng.

- Giữ nguyên giá thu dự kiến nếu không có yếu tố cần thẩm định thêm.

- Chuyển sang báo giá thu chính thức.

Nếu phát hiện lỗi mới:

- Ghi nhận loại lỗi.

- Ghi số lượng lỗi.

- Đính kèm hình ảnh/video.

- Áp dụng 50.000đ/lỗi thông thường.

- Tính lại giá.

- Gửi thông báo cho khách.

Nếu phát hiện khai báo sai nghiêm trọng:

- Chuyển Admin duyệt thủ công.

- Gửi lý do và bằng chứng.

- Không tự động xác nhận mức giá mới nếu khách chưa đồng ý.

# **CHƯƠNG VIII. THÔNG BÁO BẮT BUỘC CHO KHÁCH**

## **30. Thông báo trước khi gửi hàng**

**THÔNG BÁO QUAN TRỌNG – QUY TRÌNH THU MÔ HÌNH**

Giá thu hiển thị trên website là giá dự kiến được tính theo tình trạng sản phẩm mà bạn đã cung cấp.

Khi sản phẩm được gửi đến MODEL universe, shop sẽ tiến hành quay video tiếp nhận, mở kiện và kiểm tra toàn bộ mô hình cùng các phụ kiện đi kèm.

Sau khi kiểm tra, MODEL universe sẽ gửi kết quả tình trạng thực tế và thông báo lại giá thu chính thức.

Nếu phát hiện lỗi phát sinh, thiếu phụ kiện hoặc tình trạng khác với khai báo, giá thu có thể thay đổi theo quy định **50.000đ/lỗi thông thường** hoặc được báo giá thủ công đối với trường hợp đặc biệt.

Bạn có quyền xem kết quả kiểm tra, đồng ý hoặc không đồng ý với giá thu chính thức.

Nếu hai bên không thống nhất, giao dịch sẽ được hủy và sản phẩm được xử lý hoàn trả theo chính sách đã công bố.

## **31. Thông báo website khi nhận hàng**

**MODEL universe đã nhận được sản phẩm của bạn!**

Mã yêu cầu: {{buyback_code}}

Sản phẩm: {{product_name}}

Trạng thái: Đang chuẩn bị kiểm tra.

MODEL universe sẽ quay video kiểm hàng và đối chiếu toàn bộ sản phẩm, part cùng phụ kiện theo hồ sơ bạn đã cung cấp.

Kết quả kiểm tra và giá thu chính thức sẽ được cập nhật trong tài khoản của bạn.

## **32. Email xác nhận đã nhận hàng**

**Tiêu đề:** \[MODEL universe\] Đã nhận sản phẩm thu mua {{buyback_code}}

Xin chào {{customer_name}},

MODEL universe đã nhận được kiện hàng liên quan đến yêu cầu thu mua **{{buyback_code}}**.

Thông tin:

- Sản phẩm: {{product_name}}

- Mã yêu cầu: {{buyback_code}}

- Ngày nhận: {{received_at}}

- Giá thu dự kiến: {{estimated_buyback_price}}

Shop sẽ tiến hành quay video mở kiện, kiểm tra tình trạng sản phẩm và đối chiếu toàn bộ phụ kiện với thông tin bạn đã khai báo.

Sau khi hoàn tất kiểm tra, chúng tôi sẽ thông báo kết quả cùng giá thu chính thức để bạn xác nhận.

Xem tiến trình: {{buyback_url}}

Cảm ơn bạn đã sử dụng dịch vụ thu mô hình của MODEL universe!

## **33. Thông báo đang kiểm hàng**

**MODEL universe đang kiểm tra sản phẩm của bạn**

Đơn thu mua: {{buyback_code}}

Nhân viên đang kiểm tra sản phẩm, các part và phụ kiện đi kèm.

Quá trình kiểm tra được ghi hình để hỗ trợ đối chiếu tình trạng.

Giá thu chính thức sẽ được gửi sau khi hoàn tất.

## **34. Thông báo kiểm hàng đúng khai báo**

**KẾT QUẢ KIỂM HÀNG – ĐÚNG THÔNG TIN**

Mã thu mua: {{buyback_code}}

Sản phẩm: {{product_name}}

MODEL universe đã hoàn tất kiểm tra và không ghi nhận lỗi mới ngoài thông tin bạn đã khai báo.

- Giá thu dự kiến: {{estimated_buyback_price}}

- Giá thu chính thức đề xuất: {{final_buyback_price}}

Vui lòng xác nhận để hoàn tất giao dịch.

**\[Đồng ý bán\] \[Yêu cầu hỗ trợ\]**

## **35. Thông báo phát sinh lỗi**

**KẾT QUẢ KIỂM HÀNG – CÓ ĐIỀU CHỈNH**

Mã yêu cầu: {{buyback_code}}

Sản phẩm: {{product_name}}

Giá thu dự kiến ban đầu: {{estimated_buyback_price}}

Sau khi kiểm tra thực tế, MODEL universe ghi nhận thêm:

{{new_issues_list}}

Số lỗi phát sinh bổ sung: {{new_issue_count}}

Mức trừ mỗi lỗi: 50.000đ.

Tổng tiền trừ bổ sung: {{additional_deduction}}

**Giá thu chính thức đề xuất: {{revised_buyback_price}}**

Hình ảnh/video kiểm hàng:

{{inspection_url}}

Vui lòng kiểm tra và lựa chọn:

**\[Đồng ý với giá thu\] \[Không đồng ý – Yêu cầu trả hàng\] \[Yêu cầu kiểm tra lại\]**

## **36. Email báo giá thu sau kiểm hàng**

**Tiêu đề:** \[MODEL universe\] Kết quả kiểm hàng và giá thu chính thức – {{buyback_code}}

Xin chào {{customer_name}},

MODEL universe đã hoàn thành việc kiểm tra sản phẩm thuộc yêu cầu thu mua {{buyback_code}}.

Thông tin đối chiếu:

- Giá thu dự kiến: {{estimated_buyback_price}}

- Số lỗi đã khai báo: {{declared_issue_count}}

- Số lỗi thực tế được ghi nhận: {{inspected_issue_count}}

- Chênh lệch khấu trừ: {{deduction_difference}}

- Giá thu chính thức đề xuất: {{final_buyback_price}}

Bạn có thể xem kết quả kiểm tra và hình ảnh/video tại:

{{inspection_url}}

Nếu đồng ý, vui lòng xác nhận trên website để shop tiến hành thanh toán.

Nếu không đồng ý, bạn có thể yêu cầu kiểm tra lại hoặc xử lý trả hàng theo quy định.

MODEL universe cảm ơn bạn đã hợp tác!

# **CHƯƠNG IX. XÁC NHẬN GIÁ THU VÀ THANH TOÁN**

## **37. Khách đồng ý giá thu**

Sau khi khách đồng ý:

1.  Hệ thống lưu thời gian xác nhận.

2.  Khóa giá thu đã được chấp thuận.

3.  Admin kiểm tra thông tin thanh toán.

4.  Thực hiện thanh toán.

5.  Xác nhận chuyển tiền thành công.

6.  Cập nhật trạng thái hoàn tất.

## **38. Khách không đồng ý**

Nếu khách từ chối:

- Hệ thống ghi nhận yêu cầu.

- Ngừng quy trình thanh toán.

- Không chuyển hàng thành tồn kho thuộc sở hữu shop.

- Tạo yêu cầu trả hàng.

- Xác định phí vận chuyển trả hàng theo chính sách đã công bố.

- Cung cấp mã vận đơn trả hàng khi có.

## **39. Khách yêu cầu kiểm tra lại**

Khách được gửi yêu cầu kiểm tra lại nếu cho rằng lỗi ghi nhận không chính xác.

Nhân viên có thẩm quyền xem video, đối chiếu và đưa ra kết quả xử lý.

Không yêu cầu khách chấp nhận giá sửa đổi khi tranh chấp chưa được giải quyết.

# **CHƯƠNG X. VẬN CHUYỂN VÀ HOÀN HÀNG**

## **40. Giao dịch trực tiếp**

Khách có thể mang mô hình đến địa điểm MODEL universe đã xác nhận.

Shop kiểm tra tại chỗ, ghi nhận bằng chứng và thỏa thuận giá thu.

## **41. Gửi hàng từ xa**

Khách gửi mô hình qua đơn vị vận chuyển.

Theo quy định hiện tại của MODEL universe, khách chịu chi phí gửi hàng đến shop.

Thông tin người nhận, hướng dẫn đóng gói và yêu cầu vận chuyển phải được xác nhận trước khi gửi.

## **42. Quy định đóng gói**

Khách cần:

- Đóng gói chắc chắn.

- Cố định các part dễ gãy.

- Bọc chống sốc khi cần.

- Đặt phụ kiện vào túi hoặc hộp riêng.

- Tránh để phụ kiện va chạm trong quá trình vận chuyển.

## **43. Trường hợp hư hỏng vận chuyển**

Nếu phát hiện hư hỏng khi mở kiện, shop phải lưu bằng chứng tình trạng kiện và sản phẩm.

Cần phân biệt:

- Lỗi đã tồn tại trước khi gửi.

- Lỗi phát sinh trong vận chuyển.

- Lỗi do thao tác kiểm hàng.

Trách nhiệm chi phí phải được xác định theo bằng chứng, điều kiện vận chuyển và thỏa thuận áp dụng, không mặc định mọi hư hỏng đều do khách.

## **44. Hoàn hàng khi không thống nhất giá**

Nếu khách không chấp nhận giá thu chính thức:

- Shop xác nhận yêu cầu hoàn trả.

- Kiểm tra lại danh sách phụ kiện.

- Đóng gói sản phẩm.

- Tạo vận đơn trả hàng hoặc thỏa thuận nhận trực tiếp.

- Thông báo phí và người chịu phí trước khi thực hiện.

- Cập nhật mã vận đơn.

- Theo dõi hoàn trả thành công.

Không tự động bán hoặc thanh lý hàng chưa thuộc quyền sở hữu của shop.

# **CHƯƠNG XI. HỆ THỐNG QUẢN TRỊ ADMIN**

## **45. Dashboard thu mua**

Admin có danh sách:

- Yêu cầu mới.

- Chờ khách bổ sung ảnh/video.

- Chờ báo giá sơ bộ.

- Chờ khách gửi hàng.

- Đang vận chuyển.

- Shop đã nhận hàng.

- Đang quay video kiểm tra.

- Chờ kiểm tra hoàn tất.

- Có lỗi phát sinh.

- Chờ khách xác nhận giá.

- Khách đồng ý.

- Khách yêu cầu kiểm tra lại.

- Chờ thanh toán.

- Đã thanh toán.

- Chờ trả hàng.

- Hoàn tất.

## **46. Giao diện kiểm hàng**

Nhân viên nhìn thấy:

**Bên trái: Khai báo khách hàng**

- Thông tin sản phẩm.

- Giá tham chiếu.

- Tình trạng khai báo.

- Danh sách lỗi.

- Video và hình ảnh khách gửi.

- Giá dự kiến.

**Bên phải: Kết quả shop kiểm tra**

- Danh sách lỗi thực tế.

- Số lượng từng lỗi.

- Bằng chứng tương ứng.

- Tổng số lỗi.

- Khoản trừ 50.000đ/lỗi.

- Giá đề xuất sau kiểm tra.

## **47. Chức năng so sánh**

Hệ thống tự đối chiếu:

declared_issue_count

inspected_issue_count

new_issue_count =

Số lỗi mới thực tế chưa được tính

resolved_issue_count =

Số lỗi khách khai báo nhưng không có thực

initial_deduction

final_deduction

deduction_difference

Nếu có lỗi khách khai báo nhưng không tồn tại khi kiểm tra, hệ thống phải điều chỉnh lại khoản trừ cho chính xác, không chỉ trừ thêm một chiều.

## **48. Quản lý bằng chứng**

Admin được:

- Xem ảnh/video gốc.

- Tải video kiểm hàng.

- Thêm ảnh cận cảnh.

- Gắn bằng chứng vào từng lỗi.

- Gửi kết quả cho khách.

- Xem lịch sử báo giá.

Không được cho phép nhân viên xóa bằng chứng quan trọng đã sử dụng làm căn cứ báo giá mà không có lịch sử thao tác.

# **CHƯƠNG XII. CƠ SỞ DỮ LIỆU**

## **49. Bảng cấu hình giá thu**

buyback_price_tiers

id

min_reference_price

max_reference_price

base_deduction

active

created_at

updated_at

## **50. Bảng cấu hình lỗi**

buyback_issue_types

id

issue_code

issue_name

counting_unit

deduction_per_unit = 50000

requires_evidence

requires_manual_review

active

Tất cả lỗi thuộc nhóm định giá tự động sử dụng mức khấu trừ cố định 50.000đ/đơn vị lỗi.

## **51. Bảng yêu cầu thu**

buyback_requests

id

buyback_code

customer_id

product_id

product_variant_id

reference_price_snapshot

base_deduction_snapshot

declared_issue_count

estimated_buyback_price

inspected_issue_count

final_buyback_price

fulfillment_method

status

created_at

updated_at

## **52. Bảng lỗi khai báo**

buyback_declared_issues

id

buyback_request_id

issue_type_id

quantity

description

deduction_per_unit

deduction_total

created_at

## **53. Bảng lỗi kiểm tra thực tế**

buyback_inspected_issues

id

inspection_id

issue_type_id

quantity

description

deduction_per_unit

deduction_total

evidence_reference

created_at

## **54. Bảng hình ảnh/video**

buyback_media

id

buyback_request_id

inspection_id

uploaded_by

media_type

media_category

file_reference

created_at

## **55. Bảng kiểm hàng**

buyback_inspections

id

buyback_request_id

inspector_id

package_received_at

inspection_started_at

inspection_completed_at

declared_issue_count

actual_issue_count

initial_quote

final_quote

inspection_video_reference

inspection_notes

status

created_at

## **56. Bảng báo giá**

buyback_quotes

id

buyback_request_id

inspection_id

quote_type

quoted_amount

reason

customer_decision

customer_decided_at

status

created_at

## **57. Bảng thanh toán**

buyback_payments

id

buyback_request_id

amount

payment_method

payment_status

transaction_reference

paid_at

## **58. Bảng vận chuyển**

buyback_shipments

id

buyback_request_id

shipment_direction

carrier

tracking_number

shipping_fee

fee_payer

status

created_at

## **59. Bảng lịch sử**

buyback_audit_logs

id

buyback_request_id

actor_id

action

old_value

new_value

reason

created_at

# **CHƯƠNG XIII. API NỘI BỘ**

## **60. API khách hàng**

GET /buyback/products/search

POST /buyback/estimate

POST /buyback/requests

POST /buyback/requests/:id/media

GET /me/buyback-requests

GET /me/buyback-requests/:id

POST /buyback/requests/:id/accept-quote

POST /buyback/requests/:id/reject-quote

POST /buyback/requests/:id/request-review

## **61. API Admin**

GET /admin/buyback/requests

POST /admin/buyback/:id/preliminary-review

POST /admin/buyback/:id/receive

POST /admin/buyback/:id/inspection/start

POST /admin/buyback/:id/inspection/media

POST /admin/buyback/:id/inspection/issues

POST /admin/buyback/:id/inspection/complete

POST /admin/buyback/:id/issue-final-quote

POST /admin/buyback/:id/payment

POST /admin/buyback/:id/return

GET /admin/buyback/price-tiers

GET /admin/buyback/issue-types

Các endpoint trên là thiết kế API nội bộ đề xuất.

# **CHƯƠNG XIV. TRẠNG THÁI NGHIỆP VỤ**

## **62. Danh sách trạng thái**

DRAFT

SUBMITTED

NEED_MORE_EVIDENCE

PRELIMINARY_REVIEW

PRELIMINARY_APPROVED

AWAITING_CUSTOMER_SHIPMENT

IN_TRANSIT_TO_SHOP

RECEIVED

INSPECTION_VIDEO_PENDING

INSPECTING

INSPECTION_COMPLETED

FINAL_QUOTE_SENT

AWAITING_CUSTOMER_CONFIRMATION

CUSTOMER_ACCEPTED

CUSTOMER_REJECTED

REINSPECTION_REQUESTED

PAYMENT_PENDING

PAID

COMPLETED

RETURN_PENDING

RETURNING

RETURNED

CANCELLED

DISPUTED

# **CHƯƠNG XV. KIỂM THỬ NGHIỆP VỤ**

| **Mã** | **Trường hợp**                   | **Kết quả mong đợi**        |
|--------|----------------------------------|-----------------------------|
| TC01   | Hàng 500k không lỗi              | Giá thu 400k                |
| TC02   | Hàng 1tr không lỗi               | Giá thu 850k                |
| TC03   | Hàng 1,5tr không lỗi             | Giá thu 1,3tr               |
| TC04   | Hàng 2tr không lỗi               | Giá thu 1,7tr               |
| TC05   | Hàng 3tr không lỗi               | Giá thu 2,6tr               |
| TC06   | Hàng 5tr không lỗi               | Giá thu 4,5tr               |
| TC07   | Thiếu hộp                        | Trừ 50k                     |
| TC08   | Lắp xấu                          | Trừ 50k                     |
| TC09   | Gãy 2 part                       | Trừ 100k                    |
| TC10   | Thiếu 3 phụ kiện                 | Trừ 150k                    |
| TC11   | Keo 2 vị trí                     | Trừ 100k                    |
| TC12   | Lỗi khác 3 mục                   | Trừ 150k                    |
| TC13   | Một lỗi bị báo trùng             | Không trừ hai lần           |
| TC14   | Không đủ ảnh/video               | Yêu cầu bổ sung             |
| TC15   | Shop nhận kiện                   | Tạo bước ghi hình kiểm hàng |
| TC16   | Có video kiểm hàng               | Lưu bằng chứng              |
| TC17   | Phát hiện lỗi mới                | Tính lại báo giá            |
| TC18   | Lỗi khách khai báo không tồn tại | Điều chỉnh giảm khoản trừ   |
| TC19   | Khách chưa xác nhận giá          | Không thanh toán tự động    |
| TC20   | Khách đồng ý                     | Chuyển chờ thanh toán       |
| TC21   | Khách từ chối                    | Chuyển xử lý trả hàng       |
| TC22   | Khách yêu cầu kiểm tra lại       | Mở luồng xem xét            |
| TC23   | Thanh toán thất bại              | Không hoàn tất              |
| TC24   | Lỗi nghiêm trọng                 | Định giá thủ công           |
| TC25   | Sản phẩm trên 5 triệu            | Chuyển Admin định giá       |

# **CHƯƠNG XVI. CHÍNH SÁCH HIỂN THỊ CÔNG KHAI**

## **QUY ĐỊNH THU MÔ HÌNH – MODEL UNIVERSE**

MODEL universe hỗ trợ thu mua các sản phẩm mô hình theo giá trị và tình trạng thực tế.

### **1. Giá thu cơ bản**

Giá thu được tính dựa trên giá bán tham chiếu của MODEL universe, sau khi trừ khoản khấu trừ cơ bản theo từng mốc giá.

### **2. Quy định sản phẩm có lỗi**

Đối với các lỗi thông thường như thiếu hộp, gãy part, thiếu phụ kiện, lắp ráp xấu, dính keo, trầy xước hoặc lỗi phát sinh khác, MODEL universe áp dụng mức trừ thống nhất **50.000đ cho mỗi lỗi được ghi nhận**.

Mỗi lỗi chỉ được tính một lần theo đơn vị kiểm tra tương ứng.

### **3. Hình ảnh và video**

Khách hàng cần cung cấp hình ảnh/video rõ ràng của sản phẩm, tất cả part và phụ kiện, cũng như những lỗi đã biết.

Không được cố tình che giấu tình trạng sản phẩm.

### **4. Kiểm tra khi shop nhận hàng**

Sau khi nhận sản phẩm, MODEL universe sẽ quay video tiếp nhận, mở kiện và kiểm tra toàn bộ tình trạng mô hình cùng phụ kiện.

Kết quả kiểm tra sẽ được đối chiếu với thông tin khách đã khai báo.

### **5. Thông báo giá thu chính thức**

Sau khi kiểm tra, MODEL universe sẽ gửi kết quả và giá thu chính thức đến khách hàng qua tài khoản website hoặc kênh liên hệ phù hợp.

Giá thu có thể thay đổi nếu tình trạng thực tế khác với khai báo.

Mọi thay đổi phải được thông báo kèm lý do và bằng chứng.

### **6. Quyền quyết định của khách**

Khách hàng có quyền chấp nhận, yêu cầu kiểm tra lại hoặc từ chối giá thu được đề xuất.

Shop chỉ tiến hành hoàn tất giao dịch sau khi hai bên thống nhất.

### **7. Trường hợp không đồng ý**

Nếu hai bên không thống nhất, MODEL universe sẽ xử lý hoàn trả sản phẩm theo chính sách giao nhận và chi phí đã được thông báo trước.

### **8. Trách nhiệm vận chuyển**

Đối với hình thức gửi hàng từ xa, người gửi chịu chi phí vận chuyển đến shop theo chính sách đã công bố.

Trường hợp hàng phát sinh hư hỏng trong vận chuyển sẽ được đối chiếu bằng chứng để xác định trách nhiệm.

### **9. Lỗi nghiêm trọng**

Các sản phẩm hư hỏng nặng, thiếu bộ phận trọng yếu hoặc không thể định giá bằng bảng tiêu chuẩn sẽ được kiểm tra và báo giá riêng.

# **CHƯƠNG XVII. ĐIỀU KIỆN NGHIỆM THU HỆ THỐNG**

Hệ thống được xem là đáp ứng đặc tả khi:

1.  Giá thu cơ bản được tính đúng theo bậc giá.

2.  Tất cả các loại lỗi thông thường đều trừ 50.000đ/đơn vị lỗi.

3.  Không còn áp dụng mức trừ 80k, 100k, 140k, 170k hoặc 200k cho từng lỗi.

4.  Không tính trùng lỗi.

5.  Khách khai báo đầy đủ tình trạng và tải ảnh/video.

6.  Shop có quy trình ghi hình mở kiện, kiểm hàng.

7.  Hệ thống lưu bằng chứng kiểm hàng.

8.  Kết quả kiểm tra được gửi đến đúng tài khoản khách.

9.  Giá thu mới phải được khách chấp nhận.

10. Trường hợp không đồng ý được chuyển sang quy trình trả hàng.

11. Thanh toán có chứng từ xác nhận.

12. Mọi thay đổi giá có lịch sử và người chịu trách nhiệm.

# **KẾT LUẬN**

**CHÍNH SÁCH THU MUA MODEL UNIVERSE 2.0**

- Giá thu cơ bản theo giá bán tham chiếu.

- Tất cả lỗi thông thường trừ 50.000đ/lỗi.

- Khách cung cấp đầy đủ hình ảnh/video.

- Shop nhận hàng và quay video kiểm tra lại.

- Thông báo kết quả và giá thu chính thức.

- Khách có quyền đồng ý hoặc từ chối.

- Chỉ thanh toán khi đã thống nhất giá.

- Giao dịch minh bạch, có bằng chứng và lịch sử kiểm tra.

**Mục tiêu: Thu mô hình nhanh chóng – Định giá rõ ràng – Kiểm hàng minh bạch – Bảo vệ quyền lợi của cả khách hàng và MODEL universe.**
