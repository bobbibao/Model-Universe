<!-- Archived from Google Drive folder "Voucher & Loyalty v6.2 – BRD, SRS và Quy tắc triển khai"
     (17T-YNzDtFLUJDEH1s1oxNg-3pPPuNYRt), document "01 – BRD Nghiệp vụ Voucher, Hạng thành viên và Tích điểm v6.2"
     (id 1f2AVTrtDNZe6eG0S4u71Iz-R2RlvfVTfRELqhRn5RBc, last modified 2026-10-20). Read 2026-10-22 through the Drive
     connector (text export, markdown escapes removed). Owner status line: proposed specification, not yet live. -->

# BRD — MODEL UNIVERSE: VOUCHER, LOYALTY, HẠNG THÀNH VIÊN VÀ GIÁ BÁN v6.2

Ngày lập: 20/10/2026 | Trạng thái: Đặc tả nghiệp vụ đề xuất để triển khai, chưa xác nhận đã chạy trên web.
Tài liệu liên quan: quy chế v6.2 https://docs.google.com/document/d/13vpNqp3FzXY8BoZVsQYgi1wtKrhjn4jE2AvMR-5lK6g/edit
Mục đích: thống nhất toàn bộ nghiệp vụ áp mã trên web MODEL UNIVERSE, cơ chế hạng, điểm và mức bảo vệ lợi nhuận.

## 1. TÓM TẮT QUẢN TRỊ

Khách xem giá niêm yết R thực sự được duyệt. Thành viên có mã mặc định 10% giúp thanh toán về mức bán mục tiêu S10=ROUND(R×0,90). Khách có thể sử dụng bất kỳ một voucher chính hợp lệ nào họ sở hữu, gồm voucher mặc định, mã chiến dịch, mã cố định, mã đổi điểm. Sau đó hệ thống thử cộng MỘT quyền lợi hạng trên chính giá niêm yết R và chỉ cho dùng tổ hợp nếu hai lớp bảo vệ lợi nhuận đều đạt.

Không có quy tắc cộng vô điều kiện: voucher đứng riêng giữ tối thiểu 80% lợi nhuận chuẩn, sau cộng hạng giữ tối thiểu 75%. Hai lớp này độc lập và tuần tự. Thực hiện trên backend; frontend chỉ hiển thị các phương án xác thực. Một đơn không có hai voucher chính hoặc hai hạng.

Giá vốn và phí là dữ liệu nội bộ; khách chỉ thấy giá, quyền lợi, trần giảm và lý do nghiệp vụ phù hợp, không thấy công thức biên lợi nhuận bí mật.

## 2. PHẠM VI

Bao gồm sản phẩm NEW, 2ND và mô hình thu mua được shop sở hữu; giá theo SKU/biến thể, thùng hàng nhiều SKU; giỏ, checkout, mã ví, mã sự kiện, hạng thành viên, đổi điểm lấy voucher, tích điểm, quà tặng/miễn ship shop tài trợ, thanh toán, tiền cọc, COD, trả hàng/hoàn tiền, Admin, báo cáo, audit.

Hàng đối tác/marketplace KHÔNG tự tham gia nếu chưa xác nhận bên tài trợ và đối chiếu lợi nhuận đúng mô hình seller; nghiệp vụ thu mua khách bán hàng cho shop, cho vay cầm cố và hoàn gốc/lãi không nhận voucher mua sắm và không tự tích điểm.

Không thuộc phạm vi: mã quảng cáo chưa phê duyệt, tính giá gốc giả, thay đổi giá của đơn đã chốt, tự động mở chương trình chưa có ngân sách, sửa source web trong tài liệu.

## 3. VAI TRÒ

Khách vãng lai: xem giá R, chưa mặc định có MEMBER10 nếu không có quyền. Thành viên: xem mã sở hữu, hạng, điểm pending/available/lifetime, nhận gợi ý voucher đủ điều kiện. Khách đạt hạng: một quyền cộng thêm nếu cả hai test bảo vệ đạt. Admin chiến dịch: cấu hình mã và SKU; quản lý giá, ngân sách, thời gian, quota; xem dự báo. Admin tài chính/quản lý: xác nhận vốn, phí, giá niêm yết, min profit và duyệt xuất bản. CSKH: tra trạng thái voucher, hủy/hoàn, audit nhưng không ghi đè giá hoặc điểm tùy ý. Backend: nguồn sự thật cho quyền và tính toán.

## 4. ĐỊNH NGHĨA GIÁ VÀ LỢI NHUẬN

R: giá công khai có thật, có thể thanh toán ngay cả khi không có mã; không hiển thị R=S10/0,9 thành giá gạch ngang nếu chưa niêm yết được chứng minh.

S10: số tiền hàng sau khi áp MEMBER10 trên R, làm tròn VND: ROUND(R×0,9). Đây là mốc lợi nhuận chuẩn, không phải vốn.

B: giá thu mua/nhập thực tế; C: giá vốn và chi phí shop chịu, gồm thu vào, bảo dưỡng, đóng gói, trợ giá vận chuyển/đối tác, phí cố định, quà và tổn thất dự kiến (tránh tính hai lần).

f: phí biến đổi thực trên số tiền nhận. P: tiền hàng thực trả sau giảm, chưa kể phí ship khách trả (ship do shop tài trợ vào C). Tích điểm chỉ trên phần hàng thực trả hợp lệ.

Profit(P)=P×(1−f)−C−giftCost−FLOOR(P_eligible/40.000)×1.120đ (hệ số dự phòng điểm hiện tại có phiên bản, có thể cấu hình theo nghĩa vụ thực tế).

L10=Profit(S10); nếu L10≤0 thì dừng cấp mã tự động, phải xử lý dữ liệu/giá vốn trước.

## 5. QUY TẮC THU MUA LIÊN KẾT GIÁ BÁN

Trên S mục tiêu đến 500k: trừ 100k; >500k–1tr: trừ 200k; >1tr–1,5tr: trừ 250k; >1,5tr–2tr: trừ 350k; >2tr–3tr: trừ 450k; >3tr–5tr: trừ 500k; trên 5tr: thẩm định thủ công. Mỗi lỗi thường trừ 50k/lỗi hợp lệ. Giá thu không bằng giá vốn sau mọi chi phí. Bảng thu không tạo giá web R tự động. Mỗi SKU phải có tình trạng, chi phí phát sinh, ngày giá và người duyệt.

## 6. VOUCHER CHÍNH

MEMBER10 mặc định 10% khi khách đủ quyền; các mã WELCOME08/KIT12/CART14/BUNDLE16/EVENT18/VIP20/VIP22/FLASH25, voucher tiền cố định, voucher đổi điểm. Mỗi mã có code, điều kiện min order, trần, loại SKU, quantity, quota, ngày hiệu lực, ngân sách và nguồn tài trợ. Không cộng hai voucher chính.

Mỗi mã giảm % tính trên tổng giá niêm yết R của SKU thuộc phạm vi được giảm; tiền giảm = MIN(ROUND(rate×R_eligible), cap). Mã tiền cố định giảm không quá tổng giá hàng hợp lệ, có kiểm tra phân bổ theo SKU. Voucher điểm là voucher chính sau khi đổi điểm và sở hữu thành công, không được trừ điểm hai lần khi thanh toán.

Voucher chỉ hợp lệ khi kiểm tra 80% lợi nhuận chuẩn, ≥50.000đ/đơn, ≥5% số tiền hàng thu và điều kiện mã. Không tự động làm nhỏ % hoặc thay trần đã công bố cho từng khách để thông qua.

## 7. HẠNG THÀNH VIÊN

Đồng ≥150 điểm xét hạng: giảm thêm 0,5%, trần 15.000đ.
Bạc ≥250: 0,75%, trần 25.000đ.
Vàng ≥500: 1%, trần 40.000đ.
Bạch Kim ≥1.500: 1,25%, trần 50.000đ.
Lục Bảo ≥3.500: 1,5%, trần 65.000đ.
Kim Cương ≥10.000: 2%, trần 100.000đ.

Đây là quyền giảm thêm, không phải mã độc lập 2%/4%/6%/10%/12%/15% cũ. Lấy hạng từ lifetime/rank points; dùng điểm đổi mã không giảm hạng. Chỉ cộng 1 hạng lên 1 voucher chính.

Phần giảm hạng = MIN(ROUND(rank_rate×R_eligible), rank_cap), cộng trực tiếp với phần voucher chính trên cùng R: ví dụ KIT12 + Kim Cương2% = 14% danh nghĩa trước các trần; không nhân tuần tự thành 12% rồi 2% của số còn lại.

Tổ hợp chỉ hợp lệ khi voucher chính riêng đạt 80% và sau cộng hạng Profit(Pstack)≥75% L10, ≥50k và ≥5% Pstack. Nếu không đạt, voucher chính vẫn được dùng một mình khi đạt 80%. Không được giảm ngầm rank_rate của khách hoặc đẩy R cao lên.

## 8. QUY TẮC GIÁ, TỶ LỆ VÀ BIÊN LỢI NHUẬN

A. Giỏ sản phẩm phải có giá công khai và vốn/chi phí được duyệt. Nếu thiếu từ chối tự cấp mã.
B. Tính Profit10 từ giá bán sau mã 10% trên cùng giỏ và khoản điểm dự phòng.
C. Xét tính hợp lệ mã chính và ProfitPlain≥MAX(0,8×L10,50k,0,05×Pplain).
D. Nếu có hạng, tính thêm RankBonus và ProfitStack≥MAX(0,75×L10,50k,0,05×Pstack). Phải qua C trước D.
E. Với giỏ upsell, ngoài tỷ lệ theo nhánh cần Profit(new cart) ≥ Profit(original cart), cùng cơ sở so sánh, tránh tạo doanh thu ảo bằng ép giỏ. Không tự giới hạn 78% như chính sách cũ.
F. Trong mỗi checkout, các phương án hợp lệ được so sánh theo giá khách thanh toán THỰC (bao gồm các khoản phí bắt buộc đã công bố), chọn phương án tiết kiệm nhất; khách được phép chọn mã khác nếu hợp lệ.
G. Nếu SKU không thuộc allowlist, mã hết hạn, không đủ điểm, hết ngân sách hoặc loại trừ đối tác: không hiển thị là dùng được. Ghi lý do để Admin tra cứu, không lộ lãi nội bộ cho khách.

## 9. TÍCH ĐIỂM & ĐỔI ĐIỂM

Mỗi 40.000đ tiền hàng thực trả sau giảm hợp lệ tích 1 điểm, FLOOR trên số tiền hàng sau voucher/hạng, không tính ship/phí/cọc riêng, không cấp khi đang chờ/đặt cọc/COD chưa hoàn tất; chỉ cấp một lần khi COMPLETED, kiểm soát thời hạn đổi trả theo cấu hình.

Điểm tách lifetime_points dùng xếp hạng, available_points dùng đổi thưởng, pending_points, reserved_points, adjustments/reversals. Hoàn/hủy làm bút toán đảo điểm có tham chiếu đơn, không xóa ledger. Chỉ một lần thưởng cho một orderId dù webhook lặp.

Đổi điểm lấy voucher phải atomic: kiểm tra available, khóa điểm, cấp mã, ghi debit một lần; dùng voucher không trừ điểm lần nữa. Voucher đổi điểm sau khi cấp cũng được xét cộng một hạng nếu bản thân nó đáp ứng 80% và tổ hợp 75%. Không khuyến khích khách tiêu điểm khi có lựa chọn miễn phí tốt hơn.

Bảng đề xuất: 60 điểm=50k đơn≥500k;110=100k ≥1tr;160=150k ≥1,5tr;210=200k ≥2tr;500=500k ≥5tr;900=1tr ≥10tr. Các mã 2%/3%/5%/7%/10%/12% đổi lần lượt 50/100/200/350/500/800 điểm và có trần riêng. Chỉ là mẫu DRAFT đến khi phê duyệt.

## 10. QUẢN TRỊ & QUYỀN LỢI KHÁCH

Trang sản phẩm hiển thị R, giá sau một mã nếu đủ quyền, số tiền tiết kiệm và tình trạng áp hạng. Không quảng cáo mã 25% là giảm đúng 25% nếu có cap; không tự ẩn trần hoặc kiểm tra SKU cho đến checkout mới báo. Lý do với khách: không đủ đơn, mã hết hạn, SKU không tham gia, không cộng được quyền hạng trên sản phẩm này, thay vì tiết lộ lợi nhuận kinh doanh.

Trang ví voucher: mã sở hữu, mã có thể dùng, mã chỉ dùng riêng, mã cộng hạng được, hết hạn và tiến độ điểm hạng. Nơi checkout hiển thị breakdown R, voucher Dv, hạng Dr, tiền hàng P, ship/phí riêng, cọc, tiền còn phải thu, điểm sẽ tích khi hoàn tất.

Admin phải mô phỏng mỗi mã với mọi bậc thu, hãng, SKU, phí, giỏ mẫu và 6 hạng trước khi bật, xem tỷ lệ giỏ đạt, margin, budget. Lưu userId duyệt, version, timestamp, ai sửa, lý do.

## 11. QUY TRÌNH ĐẶT HÀNG & THANH TOÁN

Customer tạo giỏ → nhận giá R đã xác thực → backend dựng ứng viên voucher sở hữu hoặc mặc định → kiểm tra từng voucher riêng ≥80% → với hạng nếu có kiểm tra stack ≥75% → trả phương án và lý do → user xác nhận số tiền cuối → khóa snapshot và giữ quota voucher → thanh toán/cọc theo giá cuối → đơn COMPLETED thì ghi điểm → hủy/hoàn/đổi trả thì điều chỉnh ledger/quota/giá theo cam kết. Cọc 10% hay cọc giữ hàng 50% theo nghiệp vụ riêng đều là phần thanh toán, không tính doanh thu thêm. COD = tiền hàng chưa trả + phí có thể thu hộ đã công bố, không tính lại mã vào lúc giao.

Nếu giá SKU/thành viên/budget đổi trước user xác nhận, backend phải tính lại preview và yêu cầu user xác nhận thay đổi; sau khi chốt không sửa ngầm.

## 12. RỦI RO, NGOẠI LỆ VÀ KIỂM SOÁT

Rủi ro R không thật; hàng 2ND thiếu chi phí sửa; combo 12%+hạng Kim Cương thủng lãi; tính fee và điểm hai lần; hoàn hàng khiến điểm âm; seller không chịu chiết khấu; chạy đồng thời dùng một mã nhiều lần; giá/cap admin chỉnh khi khách checkout; voucher mã cao không tiết kiệm bằng mã 10%; sản phẩm có biến thể khác chi phí; khuyến mãi sát giờ hết hạn.

Kiểm soát qua tính backend với số nguyên VNĐ, bản chụp phiên bản quy tắc, transaction DB, audit không xóa, độ lệch quote/checkout phải xác nhận, idempotency, ngân sách hàng ngày/toàn chiến dịch, người duyệt, chế độ disable; kiểm thử phá biên 75%/80% với rounding và phí.

## 13. TIÊU CHÍ NGHIỆM THU KINH DOANH

100% mã cấp qua backend đều qua 80% riêng; 100% tổ hợp qua cả 80% riêng và 75% tổ hợp, sàn lãi 50k và biên 5%; không mã nào cộng 2 voucher chính/2 hạng; 100% điểm phát sinh từ tiền hàng ròng và COMPLETED; không tính điểm trùng; mọi giá web có căn cứ; 100% checkout hiển thị tiền sau mã, phí/cọc chính xác; lịch sử đơn chốt không bị ghi đè; tài liệu khách không tiết lộ chi phí nội bộ.

## 14. QUYẾT ĐỊNH VÀ THÔNG SỐ CẦN CHỦ SHOP XÁC NHẬN TRƯỚC GO-LIVE

Mốc 50k lãi tuyệt đối và 5% biên lãi là đề xuất nội bộ đã ghi trong đặc tả, phải xác nhận chính thức và không cam kết mọi SKU áp dụng. Dự phòng 1.120đ/điểm phải được đối chiếu chi phí đổi quà thực. Hạn cấp điểm qua thời gian đổi trả, phạm vi các voucher đổi điểm và quyền lợi hàng đối tác phải có chính sách công bố cụ thể. Cơ chế cộng hạng trên voucher đổi điểm/sự kiện cần ghi điều kiện khách nhìn thấy trước sử dụng. Không tự coi mô phỏng là danh mục mã đã phát hành.
