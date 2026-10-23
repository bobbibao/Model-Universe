<!-- Archived from Google Drive: "MODEL UNIVERSE – QUY TẮC CHUNG GIÁ, VOUCHER, TÍCH ĐIỂM & LỢI NHUẬN v5.0"
     Drive file id 13vpNqp3FzXY8BoZVsQYgi1wtKrhjn4jE2AvMR-5lK6g, read 2026-10-22 through the Drive connector (text export,
     markdown escapes removed). Contains v5.0, appendix 13 and the v6.0 / v6.1 / v6.2 priority rules of 20/10/2026. -->

# QUY CHẾ THỐNG NHẤT v5.0 — MODEL UNIVERSE

Ngày áp dụng nội bộ: 20/10/2026. Đây là nguồn quy tắc nghiệp vụ chung cho Thu mua, Voucher, Tích điểm, Bán hàng, Đặt cọc, Vận chuyển, Marketplace và Cầm cố. Các bảng hoặc ví dụ cũ trái với phụ lục này không dùng để triển khai. Giá và quyền lợi đã chốt của giao dịch trước không bị thay đổi hồi tố.

## 1. BẢNG GIÁ THU MUA ĐÃ CHỐT

Áp dụng hàng đầy đủ, không lỗi; bậc chọn theo GIÁ BÁN THỰC THAM CHIẾU S, không chọn theo tiền thu B.

S ≤500.000đ: trừ 100.000đ (500.000 → 400.000).

500.000đ < S ≤1.000.000đ: trừ 200.000đ (1.000.000 → 800.000).

1.000.000đ < S ≤1.500.000đ: trừ 250.000đ (1.500.000 → 1.250.000).

1.500.000đ < S ≤2.000.000đ: trừ 350.000đ (2.000.000 → 1.650.000).

2.000.000đ < S ≤3.000.000đ: trừ 450.000đ (3.000.000 → 2.550.000).

3.000.000đ < S ≤5.000.000đ: trừ 500.000đ (5.000.000 → 4.500.000).

S >5.000.000đ: báo giá thủ công; không tự tính.

Giá thu dự kiến = MAX(0, S − MỨC_TRỪ_THEO_S − 50.000đ × số lỗi hợp lệ); lỗi nghiêm trọng chuyển thẩm định. Với B đã biết: xét mọi S ứng viên = B + mức trừ, chỉ lấy S nằm đúng bậc; khi có nhiều ứng viên, đề xuất S hợp lệ thấp nhất, Admin duyệt cuối cùng theo thị trường và chi phí. Giữ dấu mốc chính xác và lịch sử phiên bản quy tắc.

## 2. PHÂN BIỆT GIÁ — TUYỆT ĐỐI KHÔNG ĐÁNH ĐỒNG

B = giá thu mua/giá nhập thực tế; A = B + sửa chữa + đóng gói + xử lý + phần ship shop hỗ trợ + phí cố định + chi phí hoàn hàng dự kiến + hoa hồng/chi phí đối tác shop chịu + giá vốn quà (nếu tặng). S = giá bán thực MỤC TIÊU sau voucher tiêu chuẩn 10% (chưa trừ phí biến đổi); R = GIÁ NIÊM YẾT THỰC TẾ ĐƯỢC DUYỆT VÀ CÔNG BỐ, không phải giá nội bộ ảo. Giá khách trả P = giá các SKU hợp lệ − đúng một ưu đãi giảm tiền + phí khách phải trả được công bố riêng. Không dùng S/R làm giá vốn. R≈S/0,90 chỉ là bài toán thử; tuyệt đối không tự hiển thị mức R chưa có căn cứ làm 'giá gốc' hay 'giá đã bán'. Giá ở sheet Danh mục 6 hãng cột I hiện là S đề xuất từ giá thu, không phải R đã được chứng thực.

## 3. MỘT ƯU ĐÃI GIẢM TIỀN TRÊN MỘT ĐƠN

Mã thành viên 10% hằng tháng, giảm theo hạng 2%/4%/6%/10%/12%/15%, voucher sự kiện 8–25%, voucher đổi điểm, mã giới thiệu có giảm tiền: đều chiếm MỘT vị trí ưu đãi; khách chọn một phương án hợp lệ có số tiền thanh toán thấp nhất (khi lợi nhuận đạt ngưỡng). Không cộng voucher + giảm theo hạng + voucher điểm. Khách vẫn được TÍCH điểm sau đơn hoàn tất nếu SKU đủ điều kiện; đây là chi phí tương lai phải dự phòng, không phải một ưu đãi tiền cộng thêm tức thời. Đổi quà/hoàn xu/miễn ship do shop tài trợ phải cộng chi phí vào kiểm tra lợi nhuận, không được lách giới hạn một mã. Không thay giá niêm yết theo mã/khách để tạo khuyến mãi ảo. Thực hiện trên backend và khóa thông số khi đơn được chốt.

## 4. TÍCH ĐIỂM THỐNG NHẤT

Tích điểm: FLOOR(giá trị sản phẩm khách thực thanh toán và đủ điều kiện SAU giảm giá / 40.000đ); cấp đúng một lần khi đơn COMPLETED và qua thời hạn kiểm soát hoàn hàng do Admin cấu hình. Không cấp khi cọc/trả góp trước hoàn tất; không tính điểm trên ship, COD, thuế/phí không đủ điều kiện, lãi cầm, phí dịch vụ, khoản khách bán model cho shop, tiền shop chi trả trong trade, khoản bị hoàn, phần voucher đã trừ, đơn hủy và thanh toán seller/đối tác. Trade chỉ tích điểm khi có phần tiền MUA HÀNG MỚI hợp lệ, không tính theo giá mô hình khách đem đổi. Giao dịch cũ phải đối soát bằng chứng, mỗi giao dịch một lần; không hồi tố điểm cho tiền thu mua hoặc tiền đã hoàn.

Tách lifetime/rank points, available points, pending points, reserved points, debit/reversal; đổi điểm không làm tụt hạng. Khi hoàn hàng, ghi dòng REVERSAL, không xóa lịch sử; nếu âm nghĩa vụ thu hồi thì quản lý debit/carryforward và chặn đổi thưởng cho đến khi cân bằng. Không cấp trùng qua webhook, cọc, COD giao lại hoặc đối soát đối tác.

## 5. ĐỔI ĐIỂM, QUÀ, HẠNG THÀNH VIÊN

Giữ biểu tỷ lệ tích 40.000đ = 1 điểm và các mốc hạng Đồng 150, Bạc 250, Vàng 500, Bạch Kim 1.500, Lục Bảo 3.500, Kim Cương 10.000 điểm xét hạng. Quyền hạng hiện hành là +0,5%/+0,75%/+1%/+1,25%/+1,5%/+2% có trần tương ứng 15k/25k/40k/50k/65k/100k; có thể cộng với MỘT voucher chính khi voucher đơn lẻ giữ ≥80% và tổ hợp giữ ≥75% lợi nhuận chuẩn.

Bảng voucher điểm kế thừa chỉ là mẫu cấu hình (không mặc định áp dụng mọi SKU): 60điểm→50.000đ/đơn ≥500k; 110→100.000đ/≥1tr; 160→150.000đ/≥1,5tr; 210→200.000đ/≥2tr; 500→500.000đ/≥5tr; 900→1.000.000đ/≥10tr. Các mẫu %: 50 điểm→2%/trần100k; 100→3%/150k; 200→5%/250k; 350→7%/300k; 500→10%/500k; 800→12%/700k. Mọi mẫu cần kiểm tra lợi nhuận SKU, trần, ngân sách và thời hạn. Quà quy đổi tính theo GIÁ VỐN THỰC CỘNG vận chuyển/quà gói, không dùng giá trị quảng cáo. Nếu không có SKU đủ điều kiện thực tế hoặc voucher điểm kém lợi hơn mã miễn phí 10%, không gợi ý tiêu điểm vô ích; cho khách biết điều kiện, hạn và quyền hủy đổi rõ ràng. Khóa điểm trong lúc cấp mã, hoàn khóa khi cấp thất bại; trừ điểm khi cấp thành công; không trừ lần nữa khi dùng.

## 6. DỰ PHÒNG CHI PHÍ ĐIỂM

Tạm dùng POINT_COST_RESERVE = 1.120đ / điểm mới phát sinh, làm tròn lên so với mẫu quy đổi tiền cao nhất hiện tại 1.000.000đ / 900 điểm. Đây là giá trị dự phòng thận trọng để duyệt voucher, KHÔNG phải tỷ giá quy đổi tiền mặt cho khách và KHÔNG phải giá trị nợ kế toán đương nhiên. PointReserve(P)=FLOOR(eligibleProductPayment(P)/40.000) × 1.120đ. Nếu mở chương trình đổi điểm/quà có chi phí cao hơn, cập nhật hệ số trước khi bật; tách dự phòng kế toán và giải phóng dự phòng khi quyền lợi thực sử dụng để tránh hạch toán trùng. Lợi nhuận không tính điểm thưởng phát sinh do bán mô hình cho shop (vì không được cấp).

## 7. CÔNG THỨC BẢO VỆ LỢI NHUẬN — BẮT BUỘC

Đặt f = tổng tỷ lệ phí biến đổi theo khoản tiền thực thu; C = tổng giá vốn và chi phí shop chịu (không gồm PointReserve nếu đang tính riêng); giftCost = giá vốn quà/chi phí cộng thêm chương trình. Với một đơn có giá khách trả tiền hàng P: Profit(P) = P × (1−f) − C − giftCost − PointReserve(P). Tính Profit10 tương tự với P10 là tổng tiền hàng sau voucher thành viên 10% HỢP LỆ trên giá công khai R (không lấy S/0,90 giả làm R). Nếu Profit10 ≤ 0 hoặc không có giá niêm yết được xác minh: chặn phê duyệt voucher tự động, chuyển Admin. Giới hạn cho mã cao hơn: 1 sản phẩm Profit(P) ≥ 80% Profit10; giỏ mua thêm đủ điều kiện Profit(P) ≥ 78% Profit10 của CÙNG giỏ và Profit(newCart) ≥ Profit(originalCart) sau ưu đãi. Thêm hai lớp an toàn đề xuất mặc định (có thể đổi bằng quyền Admin, phải lưu phiên bản): Profit(P) ≥ 50.000đ/đơn và Profit(P) ≥ 5% × P. Hàng lãi thấp/sale/preorder/đối tác chưa có trợ giá: loại khỏi mã. Không bù lỗ bởi giá niêm yết tự đẩy cao. Các ngưỡng này là cấu hình bảo vệ lợi nhuận đề xuất, phải được chủ shop phê duyệt trước khi phát hành công khai.

## 8. CÔNG THỨC VOUCHER CÓ TRẦN, ĐIỀU KIỆN, ĐIỂM

Với voucher phần trăm d và trần T: discount = MIN(d × eligiblePublicPrice, T, ngân sách khả dụng nếu giới hạn); voucher tiền cố định: discount = MIN(fixedAmount, eligiblePublicPrice). KHÔNG âm, không chia đơn giả. Mỗi giỏ chọn tối đa MỘT voucher chính; được thử cộng đúng MỘT quyền lợi hạng, gồm cả voucher đổi điểm nếu đủ điều kiện kiểm tra hai bước 80% và 75%. Giá tính điểm = tổng thanh toán ròng cho sản phẩm, không gồm ship/phí và không tính trên giá trước giảm. Nếu phí xử lý/ship được shop tài trợ, thêm vào C; phí do bên bán khác tài trợ cần hợp đồng quyết toán rõ. Kiểm tra lợi nhuận sau voucher và thưởng điểm trước khi chấp nhận, không chỉ kiểm tra tỷ lệ/đơn tối thiểu. Hiển thị số tiền thực tiết kiệm so với mức giá công khai có căn cứ.

## 9. BỘ TRƯỜNG BẮT BUỘC KHI TẠO VOUCHER MỚI

voucher_id/code; name; funding_party (SHOP/SELLER/SHARED); type (PERCENT/FIXED/SHIPPING/GIFT); value; max_discount_amount; minimum_order_amount; eligible_skus/categories; excluded_skus; target_member_tier; one_per_order=true; max_uses_per_customer; total_uses; start_at; expires_at; campaign_budget; redemption_point_cost (nếu đổi điểm); gift_real_cost (nếu có); fee_owner; minimum_net_profit; minimum_margin; max_profit_loss_ratio (20% single hoặc 22% genuine upsell); point_cost_reserve_version; buyback_tier_version; approval_by; published_terms_version; status; audit log. Quy trình: Admin tạo NHÁP → mô phỏng trên danh mục và giỏ đại diện → lọc SKU đủ lãi → tính điểm dự phòng và phí → so 10%/discount hạng → duyệt riêng ranh giới mốc, hoàn hàng và giao dịch cọc → khóa cấu hình và ngân sách → công bố trần, hiệu lực và điều kiện → theo dõi sử dụng, lợi nhuận thật, ngân sách → dừng chương trình khi ngưỡng hỏng. Mã không có ví dụ giỏ hợp lệ tốt hơn phương án mặc định không nên phát hành.

## 10. THANH TOÁN, ĐỐI TÁC VÀ HOÀN/HỦY

Đặt cọc: tính % trên TỔNG GIÁ SẢN PHẨM SAU voucher đã khóa và trước phí vận chuyển; cọc là một phần thanh toán, không doanh thu lần 2. Điểm chỉ cộng khi đơn COMPLETED, không khi cọc hay yêu cầu giữ hàng. Thanh toán đủ/trả COD: chống tính điểm hai lần; hoàn một phần thì thu hồi điểm theo phần ròng thực tế. Marketplace: giá vốn của shop không được suy ra từ giá thu mua sản phẩm do seller sở hữu; phí và trợ giá do các bên chịu phải được quyết toán riêng, không tự gánh voucher/điểm cho seller khi chưa có ngân sách hoặc thỏa thuận. Mặc định không áp dụng voucher shop và không cấp điểm cho phần payout seller/hoàn ký quỹ. Cầm cố: tiền giải ngân, hoàn vốn, lãi và phí cầm KHÔNG tích điểm hay dùng voucher mua hàng; ưu đãi lãi/phí nếu có là chương trình dịch vụ riêng và phải duyệt biên lợi nhuận/điều kiện pháp lý riêng. Hoàn/hủy: reverse voucher + điểm + phí + chiết khấu seller theo ledger, không tự đổi giá của đơn đã chốt; bút toán sửa là điều chỉnh có chứng cứ.

## 11. BỘ KIỂM THỬ BẮT BUỘC

T1 S500k→B400k; T2 S1tr→B800k; T3 S1,5tr→B1,25tr; T4 S2tr→B1,65tr; T5 S3tr→B2,55tr; T6 S5tr→B4,5tr; T7 S>5tr→ADMIN. T8 B=900k hàng không lỗi suy ngược S=1,15tr, không phải 1,1tr. T9 B thuộc vùng bậc giao nhau phải chọn S hợp lệ thấp nhất và ghi phương án khác. T10 Mã 10% hoặc mã 12% + ưu đãi hạng Kim Cương 2% được thử cộng trên R, chỉ thành công khi qua đủ hai bước kiểm tra lợi nhuận 80%/75%. T11 Voucher 25% có trần phải tính trần và Profit(P) thực. T12 Đơn 1tr sau voucher100k: FLOOR(900k/40k)=22 điểm. T13 Cọc chưa COMPLETED: 0 điểm; hoàn đơn sau tích: REVERSAL. T14 Thu mua/trade tiền shop trả: 0 điểm; trade bù tiền mua mới: chỉ phần tiền hàng thực khách trả. T15 Profit(P) thấp hơn 80%/78% hoặc thấp hơn min tuyệt đối/margin: mã bị chặn. T16 Mã điểm không được trừ điểm 2 lần, không đổi điểm nếu chưa đủ; tặng quà phải tính giá vốn. T17 Cùng đơn được hoàn một phần/ship trợ giá/COD: số tiền và ledger phản ánh đúng. T18 Chương trình hết hạn/hết ngân sách/SKU không đủ: không áp dụng; giá đơn đã chốt không đổi. T19 Giá công khai chưa xác thực: không tạo giá 'gạch ngang' từ S/0,9. T20 Trước khi mở mã 14–25%, bắt buộc giả lập nhiều mức giá và nhóm sản phẩm (đặc biệt mốc 500k/1tr/1,5tr/2tr/3tr/5tr).

## 12. TRÁCH NHIỆM TRIỂN KHAI

Một rule engine duy nhất phía backend quản lý buyback tiers, checkout discount, earned points, redemption, profit guard và snapshot phiên bản; frontend chỉ hiển thị kết quả API. Admin duyệt giá bán thực S, giá công khai R, phí và ngân sách; không tự áp dụng giá mô phỏng làm giá bán thật. Mọi kết quả theo SKU/biến thể và timestamp; log tính toán trước/sau hoàn đơn, kho, hình thức giao và phí seller. Tài liệu chính sách khách hàng chỉ công bố quyền lợi có thể sử dụng, còn ngưỡng lợi nhuận nội bộ chỉ ở Admin/BRD. Khi chính sách thay đổi cần cập nhật đồng thời tài liệu Thu mua, Voucher, Tích điểm, Bán hàng, Cọc, Vận chuyển và Marketplace, có test hồi quy.

# PHỤ LỤC 13 — THƯ VIỆN VOUCHER & VÍ DỤ GIỎ HÀNG (20/10/2026)

Bản tích hợp vào quy chế v5.0. Toàn bộ mã dưới đây là MÃ MẪU, đang ở trạng thái NHÁP, chưa phải voucher có hiệu lực trên website. Bảng công thức, trần giảm và 16 bài thử đặt tại tab 'Mẫu mã voucher v5' và 'Test voucher theo mốc v5' của https://docs.google.com/spreadsheets/d/1FgVB0PRzELJLy4YZlWIZ1bMpuwBuoyVryP4WX1R-whE/edit

## 13.1. ĐỌC ĐÚNG GIÁ, MỨC GIẢM VÀ ĐỐI TƯỢNG

B = giá thu vào/vốn hàng; S = giá bán thực mục tiêu sau mã chuẩn 10%; R = giá niêm yết thực tế đã xác minh và có thể giao dịch; P = tiền hàng khách trả sau một voucher. Chỉ trong bài test giả định R = ROUND(S/0,90), tuyệt đối không được dùng R giả định làm giá công khai hoặc giá gạch ngang.

Ngưỡng đơn tối thiểu được so với tổng R của các SKU đủ điều kiện trước mã (chính sách nội bộ đề xuất); số tiền giảm phần trăm = MIN(ROUND(R_eligible × tỷ_lệ), trần nếu có); giá khách trả P = R_eligible − tiền giảm. Hàng ngoài nhóm SKU không được đưa vào cơ sở giảm. Nếu voucher tiền cố định: số tiền giảm = MIN(giá trị voucher, trần, R_eligible). Nếu có seller/đối tác, phải cấu hình bên chi trả và điều kiện riêng.

Một đơn dùng MỘT voucher chính (thành viên/sự kiện/đổi điểm) VÀ có thể cộng thêm đúng MỘT ưu đãi hạng sau khi cả hai phép thử ≥80% và ≥75% đạt. Không cộng tỷ lệ của 2 voucher; voucher từ ví điểm không được cộng 10%; lợi ích quà tặng/miễn vận chuyển do shop tài trợ phải tính cả chi phí vào lợi nhuận. Chỉ cấp điểm trên tiền hàng sau giảm đã trả của đơn COMPLETED.

## 13.2. THƯ VIỆN MÃ ĐỀ XUẤT (TẤT CẢ Ở TRẠNG THÁI NHÁP)

MU-WELCOME08: 8% tối đa 100.000đ; đơn đủ điều kiện ≥300.000đ; khách mới, SKU chọn lọc; 1 lần.

MU-MEMBER10: 10% mã thành viên chuẩn; đơn đủ điều kiện ≥500.000đ; chỉ SKU shop duyệt; kiểm tra lợi nhuận SKU; không tự tăng giá R để tạo mã.

MU-KIT12: 12% tối đa 500.000đ; đơn ≥800.000đ; kit có SKU trong allowlist được duyệt lợi nhuận.

MU-CART14: 14% tối đa 280.000đ; đơn ≥1.200.000đ; kit đủ điều kiện; không mặc định áp dụng cho mọi sản phẩm.

MU-BUNDLE16: 16% tối đa 500.000đ; đơn ≥2.000.000đ; ít nhất 2 món; voucher đơn lẻ phải giữ ≥80% lợi nhuận chuẩn, nếu cộng hạng phải giữ ≥75% và lợi nhuận giỏ mới không thấp hơn giỏ gốc.

MU-EVENT18: 18% tối đa 650.000đ; đơn ≥2.500.000đ; chỉ SKU biên lợi nhuận cao, kiểm tra lợi nhuận.

MU-VIP20: 20% tối đa 800.000đ; đơn ≥3.000.000đ; khách đủ hạng và SKU biên lợi nhuận cao.

MU-VIP22: 22% tối đa 900.000đ; đơn ≥4.000.000đ; chỉ danh mục/hạng được Admin duyệt.

MU-FLASH25: 25% tối đa 1.000.000đ; đơn ≥5.000.000đ; ít nhất 2 món có biên lợi nhuận cao; không áp dụng đại trà hàng thu mua biên thấp.

MU-POINT50: giảm 50.000đ, cần 60 điểm, đơn ≥500.000đ; chỉ đổi khi khách có điểm và SKU đủ điều kiện; không cộng MEMBER10.

MU-POINT100: giảm 100.000đ, cần 110 điểm, đơn ≥1.000.000đ; không nên gợi ý nếu kém lợi hơn voucher sẵn có.

Các mã hạng cũ MU-TIER02/04/06/10/12/15 đã NGỪNG dùng cho đơn mới; thay bằng MU-RANK01/02/03/04/05/06 với +0,5%/+0,75%/+1%/+1,25%/+1,5%/+2%, trần 15k/25k/40k/50k/65k/100k, được cộng MỘT voucher chính khi kiểm tra độc lập ≥80% và tổ hợp ≥75%.

## 13.3. QUY TẮC PHÊ DUYỆT ĐỂ TỰ TẠO VOUCHER MỚI

Đầu vào bắt buộc: code duy nhất; loại PERCENT/FIXED/SHIPPING/GIFT; tỷ lệ; tiền cố định/trần; mức đơn tối thiểu; số món; danh sách SKU/biến thể được phép và bị loại; nhóm hàng (NEW/2ND/hàng thu mua/hàng đối tác); đối tượng/hạng; số điểm đổi; nguồn tài trợ; giới hạn theo khách/tổng số lượt; ngân sách; ngày bắt đầu và kết thúc; phí/chi phí quà; thời gian và phiên bản chính sách; người duyệt.

Trước khi phát hành: (1) xác minh giá niêm yết thật R; (2) tính giá vốn C gồm B và chi phí sửa/đóng gói, phí biến đổi, shop ship trợ cấp, quà; (3) tính P sau voucher, earned_points=FLOOR(P_eligible/40.000) và reserve=earned_points×1.120đ; (4) tính L10 và L_voucher theo quy chế v5.0; (5) đơn 1 món phải đạt L_voucher≥80%×L10; giỏ mua thêm thực ≥78%×L10 của cùng giỏ và L_newCart≥L_originalCart; (6) tạm áp dụng sàn tham khảo ≥50.000đ/đơn và biên ≥5% P nếu Admin phê duyệt; (7) kiểm tra tồn kho, trạng thái mã, ngân sách, hạn, số lượt, hạng, điểm, seller funding; (8) so các mã đang có và chọn mã tiết kiệm nhất cho khách trong danh sách hợp lệ; (9) đóng băng giá và quy tắc khi chốt đơn; (10) rollback điểm/voucher phù hợp khi hoàn/hủy.

Mã 10% thường có lợi hơn các ưu đãi hạng 2/4/6% và voucher đổi điểm tiền nhỏ; không hiển thị các mã này như lựa chọn tốt hơn nếu thực tế không phải vậy. Nếu R không hợp lệ, C chưa đầy đủ, phí chưa xác định, SKU chưa được gắn allowlist hoặc chưa có ngân sách: KHÔNG KÍCH HOẠT, chuyển Admin.

## 13.4. VÍ DỤ CHI TIẾT KHÁCH MUA THEO MỐC (R VÀ GIÁ SKU ĐỀU LÀ GIẢ ĐỊNH)

Ví dụ A — SNAA SC-004 Achilles; giá thu B=400.000đ; S=500.000đ; R giả định=555.556đ. MEMBER10 giảm 55.556đ, khách trả 500.000đ, được 12 điểm sau hoàn tất, dự phòng 13.440đ, lợi nhuận sau reserve 86.560đ. KIT12 không đủ điều kiện vì R < 800.000đ. Voucher 8% nếu đủ điều kiện làm khách trả 511.112đ, không tốt bằng 10%.

Ví dụ B — Motor Nuclear MNP-XH03 Ao Bing; B=800.000đ; S=1.000.000đ; R=1.111.111đ. MEMBER10 → khách trả 1.000.000đ, lời chuẩn 172.000đ đã dự phòng 25 điểm. KIT12 giảm 133.333đ → khách trả 977.778đ, nhận 24 điểm, dự phòng 26.880đ, lãi 150.898đ = 87,73% lãi chuẩn: ĐẠT ngưỡng một sản phẩm. Nếu có cả hai mã, gợi ý KIT12 vì khách trả thấp hơn 22.222đ và lãi an toàn.

Ví dụ C — Cangdao CD-02 White Tiger; B=1.250.000đ; S=1.500.000đ; R=1.666.667đ. KIT12 giảm 200.000đ → khách trả 1.466.667đ; lợi nhuận 176.347đ ≈ 84,55% lời chuẩn 208.560đ: ĐẠT. CART14 giảm 233.333đ → khách trả 1.433.334đ, lợi nhuận 144.134đ ≈69,11% lời chuẩn: CHẶN dù đơn đủ 1,2tr.

Ví dụ D — MOSHOW MCT-J03 Date Masamune; B=1.650.000đ; S=2.000.000đ; R=2.222.222đ. CART14 có trần 280.000đ → khách trả 1.942.222đ; 48 điểm, dự phòng 53.760đ, lời 238.462đ/294.000đ ≈81,11%: ĐẠT. Nếu khách cũng có MEMBER10 thì MEMBER10 thu 2.000.000đ; CART14 tiết kiệm thêm 57.778đ và vẫn bảo vệ lãi.

Ví dụ E — IN ERA+ FNR009 Fenrir; B=2.550.000đ; S=3.000.000đ; R=3.333.333đ. KIT12 giảm 400.000đ → khách trả 2.933.333đ, 73 điểm, lãi sau dự phòng 301.573đ, đạt 82,40% lợi nhuận chuẩn 366.000đ. EVENT18 giảm 600.000đ không thể áp dụng cho SKU kit thường (không thuộc nhóm high-margin); với cấu trúc vốn này còn làm lợi nhuận chỉ 107.173đ, cũng không đạt.

Ví dụ F — Motor Nuclear MNQ-XH05 Lu Bu; B=4.500.000đ; S=5.000.000đ; R=5.555.556đ. MEMBER10 → P=5.000.000đ, lời chuẩn 360.000đ sau dự phòng 125 điểm. KIT12 bị trần giảm 500.000đ → P=5.055.556đ, dù shop lãi nhiều hơn nhưng khách trả nhiều hơn MEMBER10: nên chọn MEMBER10. FLASH25 nếu giảm đủ trần 1.000.000đ trên một cấu hình giỏ vốn cao tương tự → P=4.555.556đ và lãi âm khoảng 71.004đ: CHẶN.

Ví dụ G — Giỏ 2 món có biên lời cao (KHÔNG phải giá SKU thực tế): vốn cộng lại 2.500.000đ, tổng S=5.400.000đ, R giả định=6.000.000đ. MEMBER10 → P=5.400.000đ, dự phòng 135 điểm, lợi nhuận 2.748.800đ. FLASH25 danh nghĩa giảm 1.500.000đ nhưng trần 1.000.000đ → P=5.000.000đ, 125 điểm, lợi nhuận 2.360.000đ =85,86% lợi nhuận chuẩn; qua ngưỡng 78% cùng giỏ. Tuy nhiên PHẢI đối chiếu thêm lợi nhuận tuyệt đối của giỏ ban đầu trước khi cho mở khóa mã và các phí thực tế.

Ví dụ H — Khách có 110 điểm muốn đổi MU-POINT100 ở giỏ R=1.111.111đ: khách trả 1.011.111đ sau giảm 100k. Nếu đồng thời sở hữu MEMBER10 hợp lệ, khách có thể trả 1.000.000đ mà không tốn 110 điểm. Không gợi ý mã điểm vì khách thiệt hơn; vẫn giữ mã điểm nếu khách chủ động chọn và chính sách cho phép.

## 13.5. MỐC ĐƯỢC DÙNG KHÔNG ĐỒNG NGHĨA MÃ ĐƯỢC CHẤP NHẬN

Mỗi SKU/biến thể Cangdao, Motor Nuclear, SNAA, IN ERA+, HEMOXIAN, MOSHOW chưa có chi phí thực tế và giá công khai đủ để tự cấp quyền voucher theo hãng. Bảng ví dụ chỉ là dữ liệu TEST. Hệ thống phải đối chiếu allowlist SKU, hàng NEW/2ND, tình trạng hỏng và dữ liệu vốn/chi phí thật, không được tự coi mọi sản phẩm của cùng hãng là đủ điều kiện. Đối với mã từ 14% trở lên, phải đặc biệt kiểm tra biên lợi nhuận sau dự phòng điểm; mã cao không chứng minh được an toàn sẽ bị chặn hoặc giới hạn SKU/trần sau khi Admin duyệt.

# PHỤ LỤC ĐỒNG BỘ GIÁ & ƯU ĐÃI v6.0 – 20/10/2026

Tài liệu triển khai mới: https://docs.google.com/document/d/1cMPWdjWiDorCnI3n9orsZN89KT4CUNUn6vjCeHItRNk/edit (không đọc được qua connector khi lưu trữ: "Requested entity was not found")

Bảng mã, 12 mã đổi điểm, 6 hạng và 36 test: https://docs.google.com/spreadsheets/d/1fjktZMnO-hfTLHOBwwHduVt9y6_U3XwnEnf9Vnoaxu0/edit

Quy tắc được ưu tiên khi tài liệu cũ mâu thuẫn; không sửa giao dịch đã chốt. Web hiển thị giá niêm yết thật R; áp voucher thành viên mặc định 10% về giá bán mục tiêu S=ROUND(0,90×R). Không được tạo giá gạch ngang ảo từ R=S/0,90 nếu chưa bán/niêm yết thật. Ngoại lệ cộng dồn DUY NHẤT: mã mặc định 10%, sau đó một quyền lợi hạng trên S theo Đồng/Bạc/Vàng/Bạch Kim/Lục Bảo/Kim Cương tương ứng 0,5%/0,75%/1%/1,25%/1,5%/2%, trần 15k/25k/40k/50k/65k/100k, cap động bằng tối đa 25% lợi nhuận chuẩn sau phí và dự phòng điểm. Tổng lợi nhuận sau cộng hạng phải ≥75% lợi nhuận chuẩn 10%; không tự duyệt đơn thiếu dữ liệu. Voucher sự kiện, đổi điểm, mã khuyến mãi thường là các phương án THAY THẾ toàn bộ combo 10%+hạng, không cộng vào combo; lời sau mã thường phải ≥80% lợi nhuận chuẩn. Không dùng ngưỡng 78% từ ví dụ voucher nhiều món cũ làm mức duyệt thông thường. Giữ sàn nội bộ đề xuất ≥50k/đơn và ≥5% P khi Admin phê duyệt; giỏ upsell còn phải có lợi nhuận mới ≥ giỏ gốc. Điểm tính FLOOR(tiền hàng thực trả sau mọi giảm/40.000), chỉ cấp sau COMPLETED, dự phòng 1.120đ/điểm; không cộng điểm trên thu mua/trade shop trả, phí ship, cọc chưa hoàn tất, payout đối tác và cầm cố. Đổi điểm lấy voucher chiếm slot voucher thường, không cộng BASE10 hay hạng; trừ điểm nguyên tử khi cấp thành công và không trừ hai lần. Backend phải kiểm tra SKU allowlist, NEW/2ND, ngân sách, hạng, hạn, phí, phí ship trợ cấp, doanh thu marketplace tài trợ, và khóa phiên bản điều kiện khi xác nhận đơn; không đổi quyền lợi đã chốt. Các tỷ lệ hạng 2–15% cũ KHÔNG còn là quyền lợi giảm giá độc lập khi áp dụng quy tắc v6 cho giao dịch mới.

# PHIÊN BẢN QUY TẮC ƯU TIÊN v6.1 — KIỂM CHỨNG VOUCHER VÀ GIỚI HẠN LỢI NHUẬN (20/10/2026)

Áp dụng cho các đơn mới, không sửa hồi tố quyền lợi đơn đã chốt. Tài liệu nguồn: https://docs.google.com/document/d/1cMPWdjWiDorCnI3n9orsZN89KT4CUNUn6vjCeHItRNk/edit ; bảng kiểm thử chi phí: https://docs.google.com/spreadsheets/d/1fjktZMnO-hfTLHOBwwHduVt9y6_U3XwnEnf9Vnoaxu0/edit#gid=20261035 . Đây là quy tắc ƯU TIÊN khi các phần cũ quy định hạng giảm độc lập 2–15%, không cộng dồn hạng, giới hạn lời 78% cho voucher thường hoặc có ví dụ tính giá mâu thuẫn.

R là giá niêm yết công khai THẬT trên web; mã thành viên tiêu chuẩn 10% đưa tiền hàng về S=ROUND(0,90×R). Chỉ DUY NHẤT một quyền hạng được cộng thêm trên S: Đồng 0,5% trần 15k từ 150 điểm; Bạc 0,75% trần25k từ 250; Vàng 1% trần40k từ500; Bạch Kim 1,25% trần50k từ1500; Lục Bảo 1,5% trần65k từ3500; Kim Cương 2% trần100k từ10000. Giảm thêm KHÔNG được mặc định trọn tỷ lệ: bonus thực = MIN(ROUND(S×rank_percent),rank_cap,FLOOR(MAX(0,0,25×L10)/(1−fee_rate))). Trong mọi trường hợp phải tính L_after từ S−bonus và kiểm tra L_after≥75%×L10, L_after≥50.000đ và L_after≥5%×(S−bonus). Nếu không đạt, CHẶN tính năng cộng hạng cho đơn/SKU, hiển thị quyền lợi phù hợp, không âm thầm sửa giá đã chốt. L10= S×(1−fee_rate)−toàn bộ giá vốn và chi phí shop gánh−FLOOR(S_eligible/40.000)×1.120đ; L_after tính tương tự từ số tiền thực sau mã. Nếu L10≤0 hoặc thiếu giá/cost/fee thì chuyển kiểm duyệt Admin.

Voucher thường, voucher sự kiện, voucher đổi điểm là các phương án THAY THẾ toàn bộ cặp giảm 10%+hạng, KHÔNG cộng thêm; phải giữ L_after≥80%×L10, ≥50k và ≥5% P. Khách chỉ tiêu điểm đổi voucher khi cấp thành công (atomic), không cộng điểm ngay lúc cọc; điểm mua hàng FLOOR(P_eligible/40000) chỉ cấp sau COMPLETED. Gói mã là NHÁP cho đến khi được phê duyệt SKU, điều kiện giá niêm yết thật, ngân sách, hạn dùng và quyền sở hữu mã. Bảng tình huống đã xác nhận: Kim Cương ở S=5tr,B=4,5tr, không thêm phí, yêu cầu 2%=100k nhưng cap còn 90k, giữ lời75,93%; nếu thêm 50k chi phí thì dù cap còn77,5k và giữ lời75,72%, trường hợp này vẫn bị chặn bởi sàn lợi nhuận≥5% doanh thu. Phí ship shop trợ cấp, phí giao dịch, hoa hồng đối tác phải cộng trước khi kiểm lãi; với giỏ upsell còn phải kiểm tra lời giỏ mới không thấp hơn giỏ gốc. Mọi tài liệu lịch sử mâu thuẫn được coi là tham khảo, không làm căn cứ triển khai; backend phải dùng chung rule engine và snapshot rule version/giá/giảm giá/điểm khi chốt checkout. Cấm áp dụng mã voucher mua hàng vào thu mua, giải ngân, phí cầm cố hay payout marketplace khi chưa có chính sách tài trợ riêng.

# QUY TẮC ƯU TIÊN v6.2 — MỌI VOUCHER + MỘT HẠNG (20/10/2026)

Đây là quy tắc mới ưu tiên thay thế các phần v5/v6/v6.1 nói mã thường không cộng với hạng. Chỉ sửa quy tắc/đặc tả voucher, không thay đổi các quy định nghiệp vụ khác hoặc giá đơn đã chốt.

Một khách có một voucher chính đủ điều kiện (voucher 8–25%, thành viên 10%, mã tiền cố định, mã đổi điểm) có thể cộng thêm đúng một ưu đãi hạng: Đồng +0,5% (trần 15k), Bạc +0,75% (25k), Vàng +1% (40k), Bạch Kim +1,25% (50k), Lục Bảo +1,5% (65k), Kim Cương +2% (100k). Mã chính và hạng dùng CÙNG GIÁ NIÊM YẾT THẬT R làm cơ sở tính phần trăm, không tính tuần tự; ví dụ 12%+2%=14% danh nghĩa. Giảm thực = MIN(voucher%×R_eligible, voucher_cap) + MIN(rank%×R_eligible, rank_cap), giới hạn tổng không cao hơn R_eligible. Mỗi khoản phải được làm tròn nhất quán và công bố trần; không tự cắt giảm %/trần sau khi khách xác nhận.

Lợi nhuận chuẩn L10 = Profit(P10), P10 = ROUND(90%×R), Profit(P) = P×(1−phí biến đổi)−toàn bộ vốn và chi phí shop chịu−chi phí quà−FLOOR(tiền hàng hợp lệ thực trả/40.000)×1.120đ. L10 phải dương, giá niêm yết R phải thực tế hợp lệ. Giữ sàn đề xuất đã thông qua: ít nhất 50.000đ/đơn và ít nhất 5% tiền hàng thực trả.

BƯỚC 1: TÍNH VOUCHER RIÊNG. Pplain = R−Dvoucher; Lplain=Profit(Pplain). Chỉ hợp lệ khi Lplain≥80%×L10 VÀ Lplain≥50k VÀ Lplain≥5%×Pplain, đồng thời mã còn hiệu lực, khách sở hữu/đủ điểm, SKU trong allowlist, đủ min order/quantity/quota/budget và nguồn tài trợ.

BƯỚC 2: NẾU BƯỚC 1 ĐẠT, THỬ CỘNG HẠNG. Pstack=max(0,R−Dvoucher−Drank); Lstack=Profit(Pstack). Chỉ hợp lệ khi Lstack≥75%×L10 VÀ Lstack≥50k VÀ Lstack≥5%×Pstack. Không đạt bước 2 thì KHÔNG cộng hạng và có thể áp voucher riêng nếu đạt bước 1. Không cho phép bỏ qua bước 1 vì bước 2 đạt. Không cộng đồng thời hai mã chính hoặc hai hạng. Nếu SKU/lợi nhuận thay đổi phải tính lại trước khi chốt và công bố rõ kết quả, không âm thầm giảm ưu đãi.

Ví dụ kiểm thử: R=1.666.667đ, B=1.250.000đ, không thêm phí; P10=1.500.000đ; L10=208.560đ. Mã KIT12 giảm 200.000đ → Pplain=1.466.667đ, điểm 36, Lplain=176.347đ =84,55% L10: ĐẠT ≥80%. Thêm hạng Kim Cương 2% theo R giảm 33.333đ → Pstack=1.433.334đ, điểm 35, Lstack=144.134đ=69,11% L10: CHẶN cộng hạng, giữ quyền dùng KIT12 riêng. Đây là test bắt buộc cho mọi bậc hạng, từng mốc giá và mã đang mở.

Backend trả VOUCHER_INVALID / VOUCHER_ONLY_VALID / STACK_VALID, có reason (INSUFFICIENT_PROFIT_80 / INSUFFICIENT_PROFIT_75 / MIN_ABSOLUTE_PROFIT / MIN_MARGIN / SKU_INELIGIBLE / POINTS_INSUFFICIENT / EXPIRED / BUDGET_EXCEEDED). Tích điểm FLOOR(tiền hàng thực trả/40.000) chỉ sau đơn COMPLETED; chưa thu điểm lúc cọc. Không áp dụng mã mua hàng vào dịch vụ cầm cố hoặc khoản shop trả khách thu mua. Chốt đơn phải khóa số tiền, giá, vouchers, hạng và rule_version=v6.2. Mã chưa duyệt/không có vốn, phí, R thật thì không tự áp dụng.
