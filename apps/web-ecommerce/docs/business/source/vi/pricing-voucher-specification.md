# **MODEL UNIVERSE – ĐẶC TẢ HỆ THỐNG GIÁ THU, GIÁ BÁN THÀNH VIÊN VÀ VOUCHER THÔNG MINH**

**Phiên bản:** 4.0  
**Loại tài liệu:** BRD + SRS  
**Phạm vi:** Thu mua mô hình, định giá bán lại, giá thành viên 10%, voucher 8–25%, giới hạn lợi nhuận, tối ưu giỏ hàng, gợi ý mua thêm và thông báo khách hàng.

# **CHƯƠNG I. QUY TẮC NỀN TẢNG**

## **1. Bốn giá trị phải được phân biệt**

Hệ thống phải quản lý riêng:

**A – Giá vốn thực tế:** Số tiền shop đã bỏ ra để nhập hoặc thu mô hình, cộng chi phí cần thiết để bán lại.

**S – Giá bán thực mục tiêu:** Số tiền sản phẩm được bán cho khách thành viên sau khi áp dụng voucher 10%.

**R – Giá niêm yết:** Mức giá bán công khai hợp lệ mà từ đó hệ thống tính ưu đãi cho khách đủ điều kiện.

**L – Lợi nhuận chuẩn:** Lợi nhuận khi khách mua ở mức giá S sau voucher 10%, trừ tất cả chi phí shop chịu.

Không lấy R để thay thế S khi tính toán quy tắc thu mô hình.

## **2. Chính sách voucher cơ bản**

- Voucher thành viên 10% là mức ưu đãi tiêu chuẩn.

- Các voucher khác có thể từ 8% đến 25%.

- Mọi voucher phải có điều kiện và thời hạn cụ thể.

- Không cộng dồn hai mã có tác dụng giảm tiền.

- Voucher cao hơn 10% không được làm giảm lợi nhuận vượt giới hạn đã đặt.

- Không tự động tăng giá sản phẩm theo tài khoản hoặc mã khách nhập.

- Không sử dụng giá tham chiếu giả.

- Giá và điều kiện đã xác nhận trong đơn phải được giữ nguyên.

## **3. Giới hạn lợi nhuận**

**Đơn một sản phẩm:**

Lợi nhuận sau mã cao hơn phải bằng ít nhất 80% lợi nhuận chuẩn 10%.

**Giỏ mua thêm từ hai sản phẩm hợp lệ:**

Lợi nhuận sau mã cao hơn phải bằng ít nhất 78% lợi nhuận chuẩn 10% của cùng giỏ.

Nếu mua thêm hàng, lợi nhuận tuyệt đối sau voucher còn phải không thấp hơn lợi nhuận dự kiến khi khách chỉ mua giỏ ban đầu.

# **CHƯƠNG II. TỪ GIÁ THU RA GIÁ BÁN THỰC**

## **4. Quy tắc thu mua hiện hành**

Đối với hàng đầy đủ, không lỗi:

| **Giá bán thực tham chiếu** | **Trừ cơ bản**  |
|-----------------------------|-----------------|
| Đến 500.000đ                | 100.000đ        |
| Trên 500k đến 1.000.000đ    | 150.000đ        |
| Trên 1tr đến 1.500.000đ     | 200.000đ        |
| Trên 1,5tr đến 2.000.000đ   | 300.000đ        |
| Trên 2tr đến 3.000.000đ     | 400.000đ        |
| Trên 3tr đến 5.000.000đ     | 500.000đ        |
| Trên 5 triệu                | Thẩm định riêng |

Mọi lỗi thông thường của hàng thu mua được trừ 50.000đ trên một đơn vị lỗi, theo quy định thu hàng riêng.

## **5. Công thức xác định giá thu**

Giá thu dự kiến = Giá bán thực tham chiếu – Khoản trừ cơ bản – 50.000đ × Số lỗi.

Khoản trừ cơ bản được chọn theo chính giá bán thực tham chiếu.

Sản phẩm lỗi nặng hoặc không có mức giá phù hợp được định giá thủ công.

## **6. Tính ngược từ giá thu**

Nếu Admin đã biết giá thu B nhưng chưa xác định giá bán thực S:

1.  Thử từng bậc trừ cơ bản.

2.  Tính giá bán ứng viên = B + mức trừ của bậc đó.

3.  Kiểm tra giá bán ứng viên có nằm trong bậc tương ứng hay không.

4.  Kiểm tra tình trạng hàng và giá thị trường.

5.  Admin xác nhận giá bán thực được lựa chọn.

Một số giá thu có thể tạo ra nhiều ứng viên hợp lệ do các bậc giá có mức trừ khác nhau tại ranh giới.

Không được chọn tùy tiện mà bỏ qua điều kiện của bảng giá.

## **7. Ví dụ với giá thu 900.000đ**

Theo bảng thu hàng, khi sản phẩm không lỗi:

Giá bán thực tham chiếu: 1.100.000đ.

Khoản trừ cơ bản: 200.000đ.

Giá thu: 900.000đ.

Nếu shop muốn bán lại ở mức 1.050.000đ, hệ thống vẫn cho phép vì đó là quyết định giá bán dựa trên chi phí thực tế, nhưng phải ghi nhận đây là trường hợp định giá riêng thay vì kết quả suy ngược từ bảng thu tiêu chuẩn.

# **CHƯƠNG III. TÍNH GIÁ NIÊM YẾT VÀ GIÁ THÀNH VIÊN 10%**

## **8. Công thức**

Giả sử:

- S = Giá bán thực muốn khách thành viên thanh toán.

- d = 10%.

Giá niêm yết tính toán:

**R = S / 0,90**

Giá sau mã:

**Giá thành viên = R – ROUND(R × 10%)**

Hệ thống cần có quy tắc làm tròn số tiền nhất quán.

## **9. Ví dụ**

Nếu S = 1.050.000đ:

R ≈ 1.166.667đ.

Khách có mã 10%:

1.166.667đ – 116.667đ = 1.050.000đ.

Nếu S = 1.100.000đ:

R ≈ 1.222.222đ.

Khách có mã 10%:

1.222.222đ – 122.222đ = 1.100.000đ.

## **10. Quy định công bố giá**

R chỉ được sử dụng làm giá niêm yết khi đó là giá bán công khai thực sự và người mua không đủ điều kiện thành viên có thể giao dịch ở mức giá đó.

Nếu R chỉ là giá nội bộ được tính từ công thức, không được trình bày như giá gốc hoặc giá cũ đã từng bán.

Giao diện khuyến nghị:

**Giá niêm yết: {{regular_price}}**

**Giá thành viên sau mã 10%: {{member_price}}**

**Điều kiện: Đăng nhập, có mã thành viên hợp lệ và đáp ứng điều kiện chương trình.**

Giá gạch ngang chỉ được dùng trong trường hợp có căn cứ giá và hình thức khuyến mại phù hợp với quy định hiện hành.

## **11. Gói voucher 10% hằng tháng**

Đề xuất:

- Khách đăng ký thành viên đủ điều kiện được cấp mã 10% mỗi kỳ tháng.

- Mã được lưu trong ví voucher.

- Số lượt sử dụng và thời hạn do Admin công bố.

- Mã áp dụng cho danh mục đủ điều kiện.

- Không cộng dồn mã giảm tiền khác.

- Khách chưa có mã không được hiển thị giá sau 10% như giá mua mặc định chắc chắn áp dụng.

Nếu khách đăng ký gói VIP có trả phí, quyền lợi được xác định theo gói đã thanh toán.

# **CHƯƠNG IV. CÔNG THỨC BẢO VỆ LỢI NHUẬN**

## **12. Các biến**

R = Tổng giá niêm yết đủ điều kiện của giỏ.

S = Tổng giá khách phải trả khi dùng voucher chuẩn 10%.

C = Tổng giá vốn và các chi phí cố định mà shop chịu.

f = Tỷ lệ phí biến đổi trên tiền thanh toán.

L10 = Lợi nhuận chuẩn của giỏ khi dùng voucher 10%.

a = Tỷ lệ giảm tiền lời cho phép, bằng 0,20 hoặc 0,22.

## **13. Lợi nhuận chuẩn**

L10 = S × (1 – f) – C.

Nếu L10 không dương hoặc không đạt lợi nhuận tối thiểu khác mà shop đã cấu hình, phải từ chối duyệt khuyến mãi tự động.

## **14. Tiền lời tối thiểu phải giữ**

Đối với một sản phẩm:

Lmin = L10 × 0,80.

Đối với giỏ nhiều sản phẩm:

Lmin = L10 × 0,78.

## **15. Giá khách phải trả thấp nhất**

Khi phí biến đổi là f:

**MinimumCustomerPayment = (C + Lmin) / (1 – f)**

Trong trường hợp không có khoản phí khác:

**MinimumCustomerPayment = S – a × L10**

## **16. Số tiền voucher tối đa**

MaximumSafeDiscount = R – MinimumCustomerPayment.

Tỷ lệ giảm thực tế tối đa:

MaximumSafePercent = MaximumSafeDiscount / R × 100%.

Hệ thống còn phải kiểm tra lợi nhuận tối thiểu tuyệt đối, biên lợi nhuận, phí vận chuyển, thuế, ngân sách và các điều kiện sản phẩm.

## **17. Cách xử lý khi vượt giới hạn**

Nếu voucher khách chọn có số tiền giảm thực tế vượt ngưỡng an toàn:

- Không áp dụng mã cho giỏ không đủ điều kiện.

- Hiển thị lý do phù hợp.

- Đề xuất mã khác đủ điều kiện.

- Đề xuất sản phẩm phù hợp để khách đạt điều kiện mã cao hơn.

- Có thể áp dụng voucher có trần giảm công khai nếu mức giảm thực tế vẫn hợp lệ.

Không được tự thay đổi giá trị mã hoặc điều kiện đã công bố một cách âm thầm.

# **CHƯƠNG V. BẢNG TÍNH THEO TOÀN BỘ MỐC THU HÀNG**

## **18. Bảng chuẩn**

Bảng giả định không có chi phí ngoài số tiền thu hàng.

| **Giá bán thực S** | **Giá thu B** | **Giá niêm yết R** | **Giá bán thấp nhất sau mã cao** | **Mã tối đa theo toán học** |
|--------------------|---------------|--------------------|----------------------------------|-----------------------------|
| 500.000đ           | 400.000đ      | 555.556đ           | 480.000đ                         | 13,60%                      |
| 1.000.000đ         | 850.000đ      | 1.111.111đ         | 970.000đ                         | 12,70%                      |
| 1.500.000đ         | 1.300.000đ    | 1.666.667đ         | 1.460.000đ                       | 12,40%                      |
| 2.000.000đ         | 1.700.000đ    | 2.222.222đ         | 1.940.000đ                       | 12,70%                      |
| 3.000.000đ         | 2.600.000đ    | 3.333.333đ         | 2.920.000đ                       | 12,40%                      |
| 5.000.000đ         | 4.500.000đ    | 5.555.556đ         | 4.900.000đ                       | 11,80%                      |

Nếu shop phát sinh thêm chi phí đóng gói, sửa chữa, thanh toán hoặc vận chuyển, giới hạn giảm thực tế có thể thấp hơn.

## **19. Mã phù hợp tại các mốc trên**

Nếu áp dụng đầy đủ tỷ lệ mã và không có trần giảm:

- Mốc 500.000đ: mã 8%, 10%, 12%.

- Mốc 1.000.000đ: mã 8%, 10%, 12%.

- Mốc 1.500.000đ: mã 8%, 10%, 12%.

- Mốc 2.000.000đ: mã 8%, 10%, 12%.

- Mốc 3.000.000đ: mã 8%, 10%, 12%.

- Mốc 5.000.000đ: mã 8%, 10%.

Đây là kết quả giới hạn lợi nhuận cho một sản phẩm ở các điểm mốc, chưa xét giá trị đơn tối thiểu, thời hạn, tồn kho và điều kiện thành viên.

Các mã 14–25% phải có điều kiện hoặc trần giảm phù hợp.

# **CHƯƠNG VI. QUY ĐỊNH CỤ THỂ CHO VOUCHER 8–25%**

## **20. Ngưỡng lợi nhuận khi giảm đủ phần trăm**

Bảng sau giả định không có chi phí ngoài giá vốn đã xác định, không có phí theo doanh thu và không chạm trần giảm.

Các tỷ lệ biên lời được tính trên giá bán thực sau mã 10%.

| **Voucher** | **Biên lời chuẩn tối thiểu cho 1 SP** | **Biên lời chuẩn tối thiểu cho giỏ nhiều SP** |
|-------------|---------------------------------------|-----------------------------------------------|
| 8%          | Chỉ cần đạt lợi nhuận tối thiểu chung | Chỉ cần đạt lợi nhuận tối thiểu chung         |
| 10%         | Mức chuẩn                             | Mức chuẩn                                     |
| 12%         | 11,11%                                | 10,10%                                        |
| 14%         | 22,22%                                | 20,20%                                        |
| 16%         | 33,33%                                | 30,30%                                        |
| 18%         | 44,44%                                | 40,40%                                        |
| 20%         | 55,56%                                | 50,51%                                        |
| 22%         | 66,67%                                | 60,61%                                        |
| 25%         | 83,33%                                | 75,76%                                        |

Đây là điều kiện toán học để giảm đủ tỷ lệ danh nghĩa mà vẫn giữ đúng giới hạn mất tiền lời 20% hoặc 22%.

Không dùng bảng này thay thế bộ máy tính lợi nhuận khi phát sinh các loại phí hoặc trần giảm.

## **21. Bảng chương trình voucher đề xuất**

| **Mã** | **Giá trị đơn tối thiểu đề xuất** | **Quy định áp dụng**                              |
|--------|-----------------------------------|---------------------------------------------------|
| 8%     | 300.000đ                          | Đơn đủ điều kiện, khách thường hoặc sự kiện       |
| 10%    | 500.000đ                          | Mã thành viên tiêu chuẩn                          |
| 12%    | 800.000đ                          | Đơn có đủ lợi nhuận                               |
| 14%    | 1.200.000đ                        | SKU chọn lọc hoặc có trần giảm                    |
| 16%    | 2.000.000đ                        | Ưu tiên giỏ mua thêm                              |
| 18%    | 2.500.000đ                        | Giỏ có biên lời cao                               |
| 20%    | 3.000.000đ                        | VIP hoặc chương trình chọn lọc                    |
| 22%    | 4.000.000đ                        | Chương trình giới hạn ngân sách                   |
| 25%    | 5.000.000đ                        | Chương trình đặc biệt, có trần và danh mục hợp lệ |

Các ngưỡng tiền là đề xuất để Admin cấu hình, không tự đảm bảo một voucher sẽ có lãi.

## **22. Quy tắc áp dụng**

Mã chỉ hợp lệ khi thỏa mãn đồng thời:

1.  Khách có quyền sử dụng.

2.  Mã còn thời hạn.

3.  Đơn đạt giá trị tối thiểu.

4.  Sản phẩm thuộc danh mục được phép.

5.  Mã chưa hết lượt.

6.  Chương trình chưa hết ngân sách.

7.  Số tiền giảm thực tế không vượt trần đã công bố.

8.  Lợi nhuận đạt giới hạn 20% hoặc 22%.

9.  Không vi phạm quy tắc không cộng dồn.

10. Không xung đột với chương trình hoặc chính sách thanh toán.

# **CHƯƠNG VII. XỬ LÝ MÃ CAO 16–25%**

## **23. Ba phương án hợp lệ**

**Phương án A – Giảm đủ phần trăm**

Chỉ dùng khi biên lợi nhuận sản phẩm hoặc giỏ đủ cao.

**Phương án B – Giảm theo phần trăm có trần**

Ví dụ:

"Giảm 25%, tối đa 160.000đ."

Số tiền giảm thực tế bằng giá trị nhỏ hơn giữa 25% phần hàng đủ điều kiện và 160.000đ.

**Phương án C – Mở khóa bằng giỏ mua thêm**

Khách thêm một sản phẩm phù hợp để giỏ đạt điều kiện voucher và đồng thời tăng lợi nhuận cho shop.

## **24. Ví dụ mã 25% có trần**

Sản phẩm:

- Giá thu: 900.000đ.

- Giá bán thực: 1.100.000đ.

- Giá niêm yết: 1.222.222đ.

- Lợi nhuận chuẩn 10%: 200.000đ.

- Lợi nhuận phải giữ lại: 160.000đ.

Giá khách trả thấp nhất: 1.060.000đ.

Mức giảm tối đa từ giá niêm yết: 162.222đ.

Nếu tạo voucher "Giảm 25%, tối đa 160.000đ":

- Mức giảm thực tế: 160.000đ.

- Giá khách thanh toán: 1.062.222đ.

- Lợi nhuận: 162.222đ.

- Giảm tiền lời so với mức chuẩn: 18,89%.

Kết quả: Đạt giới hạn 20%.

Nhưng mức giảm hiệu dụng chỉ khoảng 13,09%, không phải 25% giá trị sản phẩm.

Phải công bố cả phần trăm và trần giảm, đồng thời hiển thị chính xác số tiền khách tiết kiệm.

Nếu mã có trần thấp đến mức ưu đãi kém hơn mã 10% mặc định, không nên gợi ý mã cao đó là lựa chọn tốt nhất.

# **CHƯƠNG VIII. GỢI Ý MUA THÊM VÀ GIỮ LỢI NHUẬN 22%**

## **25. Mục tiêu**

Khi khách thêm mô hình A vào giỏ, hệ thống tìm mô hình B hoặc phụ kiện có khả năng:

- Đủ ngưỡng voucher lớn hơn.

- Phù hợp với sản phẩm A.

- Có hàng trong kho.

- Mang lại lợi ích mua sắm rõ ràng cho khách.

- Giữ tối thiểu 78% lợi nhuận chuẩn của giỏ A + B.

- Làm tổng lợi nhuận sau ưu đãi cao hơn khi chỉ bán A.

## **26. Công thức**

Với giỏ A + B:

Giá bán thực chuẩn:

S_AB = S_A + S_B.

Tổng chi phí:

C_AB = C_A + C_B + chi phí tăng thêm của giỏ.

Lợi nhuận chuẩn:

L10_AB = S_AB × (1 – f) – C_AB.

Lợi nhuận tối thiểu phải giữ:

Lmin_AB = 78% × L10_AB.

Giá khách trả thấp nhất:

Pmin_AB = (C_AB + Lmin_AB) / (1 – f).

Giảm tối đa:

Dmax_AB = R_AB – Pmin_AB.

## **27. Điều kiện gợi ý mua thêm**

NewCartProfit \>= 78% × NewCartProfitAt10%

NewCartProfit \>= OriginalCartProfit

NewCartProfit \>= MinimumProfitAmount

SuggestedProductsInStock = TRUE

VoucherEligible = TRUE

Ngưỡng 22% chỉ áp dụng cho giỏ mua thêm hợp lệ. Không được tách hoặc gộp đơn giả để khai thác chính sách.

## **28. Ví dụ hai món đều là hàng thu mua**

Mô hình A:

- Giá thu 900.000đ.

- Giá bán thực 1.100.000đ.

- Lời chuẩn 200.000đ.

Mô hình B:

- Giá thu 600.000đ.

- Giá bán thực 750.000đ.

- Lời chuẩn 150.000đ.

Tổng giỏ:

- Giá bán thực chuẩn: 1.850.000đ.

- Tổng vốn: 1.500.000đ.

- Tiền lời chuẩn: 350.000đ.

Với mức bảo vệ 22%:

- Tiền lời tối thiểu: 273.000đ.

- Giá khách trả thấp nhất: 1.773.000đ.

- Tỷ lệ voucher tối đa tính toán: khoảng 13,75%.

Kết quả:

Mã 12% giảm đủ tỷ lệ có thể đạt giới hạn.

Mã 14% giảm đủ tỷ lệ không đạt.

Mã 16–25% chỉ dùng được nếu có trần giảm phù hợp hoặc điều kiện khác làm thay đổi cơ cấu lợi nhuận.

## **29. Ví dụ mở khóa mã 16% bằng sản phẩm có biên lời cao**

Mô hình A:

- Giá vốn: 900.000đ.

- Giá bán thực: 1.100.000đ.

Sản phẩm B từ nguồn nhập khác, không áp dụng công thức thu hàng cũ:

- Giá vốn: 200.000đ.

- Giá bán thực: 600.000đ.

Tổng:

- Giá bán thực chuẩn: 1.700.000đ.

- Tổng giá vốn: 1.100.000đ.

- Lợi nhuận chuẩn 10%: 600.000đ.

Giá niêm yết tổng tương ứng: khoảng 1.888.889đ.

Nếu áp dụng voucher 16% đủ tỷ lệ:

- Khách thanh toán: khoảng 1.586.667đ.

- Shop lời: khoảng 486.667đ.

- Tiền lời giảm: khoảng 18,89% so với lợi nhuận chuẩn 10% của giỏ.

Giới hạn cho phép: 22%.

**Kết quả: ĐẠT.**

So với chỉ bán A giá thành viên 1.100.000đ, shop tăng thêm khoảng 286.667đ tiền lời, trước các chi phí bổ sung chưa tính.

Khách chi thêm khoảng 486.667đ để nhận thêm sản phẩm B.

## **30. Xếp hạng các gợi ý**

Hệ thống ưu tiên:

1.  Sản phẩm tương thích với mô hình khách đang mua.

2.  Sản phẩm có khả năng mở khóa voucher.

3.  Phương án tạo lợi nhuận tăng thêm cao.

4.  Phương án yêu cầu khách chi thêm ít.

5.  Phương án có giá sau giảm hấp dẫn.

6.  Phương án có tồn kho thực tế và chi phí vận chuyển phù hợp.

Không tự thêm sản phẩm vào giỏ.

# **CHƯƠNG IX. HIỂN THỊ GIỎ HÀNG**

## **31. Giao diện giá**

Ví dụ:

**Mô hình A**

Giá niêm yết: 1.222.222đ.

Giá thành viên khi áp mã 10%: 1.100.000đ.

Nếu khách đang sở hữu mã tốt hơn, hệ thống phải kiểm tra khả năng áp dụng trước khi hiển thị giá thanh toán tương ứng.

## **32. Gợi ý mua thêm**

**MUA THÊM – MỞ KHÓA VOUCHER LỚN HƠN**

Giỏ hiện tại: {{current_cart_price}}

Voucher hiện tại: {{current_voucher}}

Sản phẩm gợi ý: {{suggested_product}}

Giá sản phẩm gợi ý: {{suggested_price}}

Voucher có thể mở khóa: {{new_voucher}}

Tổng tiền sau khi thêm: {{new_cart_payable}}

Số tiền chi thêm: {{additional_payment}}

**\[Thêm vào giỏ\] \[Xem sản phẩm\]**

## **33. Hiển thị tiết kiệm**

Phải phân biệt:

- Mức giảm trên giá niêm yết.

- Tổng thanh toán thực tế.

- Số tiền chi thêm so với giỏ ban đầu.

- Số tiền giảm tăng thêm so với voucher cũ.

Không được trình bày số tiền chi thêm thành khoản tiết kiệm ròng.

# **CHƯƠNG X. MỘT MÃ GIẢM TRÊN MỘT ĐƠN**

## **34. Quy tắc**

Khách chỉ được dùng một mã có tác dụng giảm giá cho mỗi đơn.

Bao gồm:

- Voucher thành viên.

- Voucher từ vòng quay.

- Voucher sự kiện Facebook.

- Voucher VIP.

- Mã giới thiệu có giảm tiền.

- Voucher miễn phí vận chuyển nếu chương trình quy định dùng chung một vị trí mã.

Không cộng dồn hai khoản giảm từ hai mã độc lập.

Mã giới thiệu chỉ dùng để ghi nhận người giới thiệu, không phát sinh giảm giá, có thể được lưu cùng một voucher hợp lệ.

## **35. Chọn mã tốt nhất**

Hệ thống tính tất cả phương án hợp lệ, sau đó đề xuất mã khiến khách thanh toán ít nhất.

Nếu khách có mã 25% nhưng bị giới hạn bởi trần giảm, còn mã 10% đem lại khoản giảm lớn hơn, hệ thống phải ưu tiên mã 10%.

# **CHƯƠNG XI. QUẢN LÝ THỜI HẠN**

## **36. Mỗi mã cần có**

- Ngày cấp.

- Ngày bắt đầu.

- Ngày hết hạn.

- Số lượt sử dụng.

- Số lượt còn lại.

- Giới hạn mỗi khách.

- Khả năng gia hạn.

- Lịch sử gia hạn.

## **37. Nhắc hết hạn**

Đề xuất gửi:

- Trước hạn 72 giờ.

- Trước hạn 24 giờ.

Thông báo qua:

- Chuông website.

- Email đủ điều kiện.

- Kênh khác khi đã được tích hợp và cho phép.

Không gửi lại khi voucher đã dùng hết hoặc hết hiệu lực.

## **38. Mẫu thông báo**

**VOUCHER CỦA BẠN SẮP HẾT HẠN!**

Bạn đang có mã {{voucher_code}}.

Ưu đãi: {{voucher_description}}.

Hết hạn: {{expire_at}}.

MODEL universe đã tìm được các sản phẩm phù hợp với mã của bạn.

**\[Xem hàng giá tốt\] \[Sử dụng voucher\]**

# **CHƯƠNG XII. QUẢN TRỊ ADMIN**

## **39. Quản lý giá thu và giá bán**

Admin được xem:

- Giá thu ban đầu.

- Mức trừ cơ bản.

- Khoản trừ lỗi.

- Chi phí sửa chữa.

- Chi phí đóng gói.

- Giá vốn cuối.

- Giá bán thực mục tiêu.

- Giá niêm yết hợp lệ.

- Lợi nhuận chuẩn 10%.

- Giới hạn voucher cao nhất.

## **40. Quản lý voucher**

Admin được:

- Tạo mã 8–25%.

- Thiết lập trần giảm.

- Thiết lập đơn tối thiểu.

- Thiết lập SKU áp dụng.

- Thiết lập danh mục bị loại trừ.

- Kiểm tra lợi nhuận.

- Thiết lập ngân sách.

- Thiết lập thời hạn.

- Gia hạn theo quyền.

- Tạm dừng chương trình.

- Xem số lượt dùng và lợi nhuận thực tế.

## **41. Kiểm tra trước khi kích hoạt mã**

Hệ thống phải mô phỏng chương trình trên danh mục và những giỏ hợp lệ.

Admin cần thấy:

- Bao nhiêu SKU đủ điều kiện.

- Bao nhiêu SKU không đủ điều kiện.

- Giá trị giảm dự kiến.

- Lợi nhuận sau giảm.

- Mức giảm tiền lời.

- Ngân sách cần sử dụng.

- Mã có thật sự đem lại lợi ích hơn mã 10% không.

Không kích hoạt mã cao như một quyền lợi áp dụng toàn bộ danh mục nếu hầu hết sản phẩm không thể đáp ứng điều kiện.

# **CHƯƠNG XIII. DATABASE ĐỀ XUẤT**

## **42. Bảng giá thu**

buyback_price_tiers

- id

- min_price

- max_price

- base_deduction

- status

## **43. Hồ sơ chi phí sản phẩm**

product_cost_profiles

- id

- sku

- variant_id

- actual_acquisition_cost

- repair_cost

- packaging_cost

- handling_cost

- allocated_return_cost

- shipping_subsidy

- payment_fee_percent

- cost_version

- updated_at

## **44. Giá bán**

product_price_versions

- id

- sku

- variant_id

- target_member_selling_price

- verified_regular_price

- price_effective_at

- price_reason

- approved_by

## **45. Voucher**

voucher_templates

- id

- name

- percent

- maximum_discount

- minimum_order_amount

- eligible_skus

- excluded_skus

- allowed_cart_type

- campaign_budget

- usage_limit

- start_at

- expires_at

- status

## **46. Ví voucher**

customer_vouchers

- id

- customer_id

- voucher_template_id

- voucher_code

- issued_at

- expires_at

- usage_status

## **47. Kiểm tra lợi nhuận**

voucher_profit_evaluations

- id

- cart_id

- customer_id

- voucher_id

- regular_total

- standard_member_total

- acquisition_cost_total

- other_cost_total

- baseline_profit

- actual_discount

- actual_profit

- maximum_loss_rate

- actual_loss_rate

- eligible

- rule_version

- calculated_at

## **48. Gợi ý mua thêm**

cart_upsell_recommendations

- id

- cart_id

- suggested_product_id

- original_cart_profit

- new_cart_profit

- unlocked_voucher_id

- customer_additional_payment

- incremental_profit

- calculated_at

## **49. Lịch sử**

promotion_audit_logs

- id

- actor_id

- entity_type

- entity_id

- action

- old_value

- new_value

- created_at

# **CHƯƠNG XIV. API NỘI BỘ**

## **50. Tính giá**

- POST /admin/pricing/calculate-resale-price

- POST /admin/pricing/calculate-member-price

- POST /admin/pricing/calculate-maximum-voucher

- POST /admin/pricing/simulate-profit

## **51. Voucher**

- GET /me/vouchers

- POST /checkout/preview

- POST /checkout/apply-voucher

- POST /admin/vouchers

- PATCH /admin/vouchers/

- POST /admin/vouchers//extend

## **52. Giỏ hàng**

- POST /cart/recommend-products

- POST /cart/simulate-upsell

- POST /cart/select-best-voucher

Toàn bộ giá trị tài chính phải được tính lại trên backend trước khi xác nhận giao dịch.

# **CHƯƠNG XV. TƯƠNG THÍCH THANH TOÁN ĐẶT CỌC VÀ SPX**

## **53. Đặt cọc mua hàng**

MODEL universe tiếp tục áp dụng mức thanh toán trước tối thiểu 10% giá trị sản phẩm sau voucher.

Ví dụ:

Giá niêm yết: 1.222.222đ.

Áp mã thành viên 10%:

Giá sản phẩm: 1.100.000đ.

Cọc mua hàng tối thiểu:

110.000đ.

Phần sản phẩm còn lại:

990.000đ.

Nếu khách chọn ship COD, hệ thống tiếp tục tính phí vận chuyển và số COD theo quy trình SPX đã thiết kế.

Không tính tiền cọc từ giá niêm yết trước khi áp voucher.

# **CHƯƠNG XVI. KIỂM THỬ NGHIỆP VỤ**

| **Mã** | **Tình huống**                    | **Kết quả**                       |
|--------|-----------------------------------|-----------------------------------|
| TC01   | Thu hàng 900k theo đúng bảng      | Xác định ứng viên bán thực 1,1tr  |
| TC02   | Giá bán thực 1,05tr, giá thu 900k | Ghi nhận định giá ngoại lệ        |
| TC03   | S = 1,05tr                        | R tính toán khoảng 1.166.667đ     |
| TC04   | R = 1.155.000đ giảm 10%           | Kết quả 1.039.500đ                |
| TC05   | S = 1,05tr, lời 150k              | Giá thấp nhất 1,02tr              |
| TC06   | Đơn một SP mất 19% lời            | Đạt                               |
| TC07   | Đơn một SP mất 21% lời            | Không đạt                         |
| TC08   | Giỏ mua thêm mất 21% lời          | Đạt nếu đủ các điều kiện khác     |
| TC09   | Giỏ mua thêm mất 23% lời          | Không đạt                         |
| TC10   | Voucher 25% có trần               | Tính đúng tiền giảm thực tế       |
| TC11   | Voucher có trần kém hơn mã 10%    | Đề xuất mã 10%                    |
| TC12   | Khách thêm B làm tăng tổng lời    | Có thể gợi ý                      |
| TC13   | Khách thêm B làm giảm tổng lời    | Không ưu tiên gợi ý               |
| TC14   | Thiếu dữ liệu giá vốn             | Chặn phê duyệt tự động            |
| TC15   | Voucher hết hạn                   | Không áp dụng                     |
| TC16   | Hai mã giảm tiền                  | Chỉ được chọn một                 |
| TC17   | Voucher thay đổi sau khi đơn chốt | Không sửa giá đã xác nhận         |
| TC18   | Đơn cọc sau voucher               | Tính chính xác                    |
| TC19   | Phí ship hoặc đóng gói tăng       | Tính lại lợi nhuận                |
| TC20   | Giá niêm yết không có căn cứ      | Không cho dùng làm giá gạch ngang |

# **CHƯƠNG XVII. QUY ĐỊNH CUỐI CÙNG**

**MODEL UNIVERSE – CHÍNH SÁCH VOUCHER VÀ ĐỊNH GIÁ 4.0**

1.  Giá thu hàng được xác định theo bảng thu mua và tình trạng thực tế.

2.  Giá vốn bán lại lấy từ số tiền thu thật cộng các chi phí phát sinh hợp lệ.

3.  Giá bán thực mục tiêu là giá khách thành viên thanh toán sau mã tiêu chuẩn 10%.

4.  Giá niêm yết được xác định và công bố minh bạch, không dùng giá ảo để tạo khuyến mãi.

5.  Khách đủ điều kiện được nhận voucher thành viên 10% theo chương trình hằng tháng.

6.  Các voucher 8–25% được áp dụng theo điều kiện riêng.

7.  Đơn một sản phẩm không được giảm quá 20% tiền lời chuẩn.

8.  Giỏ mua thêm không được giảm quá 22% tiền lời chuẩn.

9.  Mọi voucher phải đáp ứng lợi nhuận tối thiểu và giới hạn ngân sách.

10. Mã giảm lớn được hỗ trợ qua SKU có biên lời cao, giỏ hàng phù hợp hoặc trần giảm công khai.

11. Không cộng dồn hai mã giảm tiền.

12. Mã có thời hạn và hệ thống nhắc khách trước khi hết hạn.

13. Website gợi ý thêm sản phẩm phù hợp với voucher khách đang có.

14. Mọi thay đổi giá phải có lịch sử và người phê duyệt.

15. Đơn hàng đã xác nhận được giữ nguyên giá và ưu đãi đã chốt.

**MỤC TIÊU: GIÁ THU ĐÚNG – GIÁ BÁN MINH BẠCH – MÃ GIẢM ĐƯỢC KIỂM SOÁT – KHÁCH ĐƯỢC LỢI ÍCH THẬT – SHOP GIỮ ĐƯỢC LỢI NHUẬN.**
