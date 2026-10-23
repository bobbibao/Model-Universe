<!-- Archived from Google Drive folder "Voucher & Loyalty v6.2 – BRD, SRS và Quy tắc triển khai"
     (17T-YNzDtFLUJDEH1s1oxNg-3pPPuNYRt), document "03 – Quy tắc tính giá, Chính sách voucher và Bộ kiểm thử nghiệm thu
     v6.2" (id 1FkwzjvN1zlDwpq13P0WN1MdvzOHIW1VZ4Y3kyaUT5bs, last modified 2026-10-20). Read 2026-10-22 through the
     Drive connector (text export, markdown escapes removed). The R values are test assumptions, not real prices. -->

# MODEL UNIVERSE — BỘ QUY TẮC VOUCHER & KIỂM THỬ NGHIỆM THU v6.2

Ngày 20/10/2026. Tài liệu kỹ thuật và nghiệp vụ áp dụng cho giao dịch mới. Những giá R dưới đây là GIẢ ĐỊNH TEST, không phải bảng giá công khai thật.
BRD: https://docs.google.com/document/d/1f2AVTrtDNZe6eG0S4u71Iz-R2RlvfVTfRELqhRn5RBc/edit
SRS: https://docs.google.com/document/d/16hMLwQAwOaiUPp8tL2regQynIdha0R0dkgoED056oIw/edit

## 1. NGUỒN SỰ THẬT VÀ QUY TẮC CỐT LÕI

Chọn một voucher chính (10% thành viên, mã sự kiện, mã tiền cố định, mã đổi điểm) và có thể cộng đúng một quyền lợi hạng. Voucher riêng được dùng khi lợi nhuận sau mã giữ tối thiểu 80% lợi nhuận chuẩn. Chỉ khi bước này đạt mới xét voucher+hạng; tổ hợp chỉ hợp lệ khi giữ tối thiểu 75% lợi nhuận chuẩn. Cả hai phải lời ≥50.000đ/đơn và lãi ≥5% trên tiền hàng khách thực trả. Phải đủ mã còn hiệu lực, SKU, quyền sở hữu, điểm, ngày, ngân sách, số món, đơn tối thiểu, tồn kho, giá/cost được duyệt, bên tài trợ. Không lách bằng tự động thay giá web, sửa trần công khai hoặc hạ phần trăm hạng sau khi khách đã xác nhận.

L10=Profit(P10), P10=ROUND(0,90×R), Profit(P)=P×(1−f)−C−giftCost−FLOOR(P_eligible/40.000)×1.120đ, với R giá web có thật, C gồm giá vốn và chi phí shop thực chịu, f phí giao dịch. Mọi phép toán dùng VND integer, tỷ lệ basis points và làm tròn half-up. P không âm. Nếu L10≤0 => mã chặn.

Dprimary=MIN(ROUND(R_eligible×rate_primary),cap_primary nếu có), hoặc MIN(fixed_amount,R_eligible). Drank=MIN(ROUND(R_rank_eligible×rate_rank),cap_rank). Nếu primary/rank cùng R eligible, cộng trực tiếp: 12%+2%=14% danh nghĩa. Pplain=R−Dprimary; Pstack=MAX(0,R−Dprimary−Drank). Không nhân tuần tự 12% trước rồi 2% số còn lại. Nếu các SKU được giảm khác nhau, phân bổ khoản giảm theo SKU và xác định R_eligible cụ thể. Không áp đồng thời hai mã chính/hạng.

STEP1 PassPrimary = (Lplain≥0,80L10) AND (Lplain≥50k) AND (Lplain≥0,05Pplain) AND coupon eligibility. STEP2 PassStack = PassPrimary AND (Lstack≥0,75L10) AND (Lstack≥50k) AND (Lstack≥0,05Pstack) AND rank entitlement. Nếu Step1 fail => cả voucher/chồng hạng fail; nếu Step1 pass Step2 fail => voucher riêng usable; nếu cả hai pass => stack usable. Kết quả backend phải là VOUCHER_INVALID / VOUCHER_ONLY_VALID / STACK_VALID.

Tích điểm: FLOOr(P_eligible_final/40000) sau hoàn tất, không cộng khi cọc/ship/COD đang giao, không cộng trên tiền shop chi trả mua hàng/trade/cầm cố, seller payout; dự phòng 1120đ/điểm ở mỗi lần so lợi nhuận.

## 2. BẢNG GIÁ THU MUA ĐÃ THỐNG NHẤT

S≤500.000đ trừ100.000đ; >500k–1tr trừ200k; >1tr–1,5tr trừ250k; >1,5tr–2tr trừ350k; >2tr–3tr trừ450k; >3tr–5tr trừ500k; >5tr Admin thẩm định. Lỗi thường −50.000đ/lỗi. S mục tiêu và R niêm yết không thể thay thế nhau; S có thể dùng để minh họa giá sau mã 10%, R = ROUND(S/0,9) chỉ là giá giả định test trừ khi Admin đã xác minh giá thật.

Mốc B/S test: 400k/500k;800k/1tr;1,25tr/1,5tr;1,65tr/2tr;2,55tr/3tr;4,5tr/5tr.

## 3. BẢNG HẠNG THÀNH VIÊN

Đồng: lifetime≥150, +0,5%, trần15.000đ, MU-RANK01.
Bạc: lifetime≥250, +0,75%, trần25.000đ, MU-RANK02.
Vàng: lifetime≥500, +1%, trần40.000đ, MU-RANK03.
Bạch Kim: lifetime≥1.500, +1,25%, trần50.000đ, MU-RANK04.
Lục Bảo: lifetime≥3.500, +1,5%, trần65.000đ, MU-RANK05.
Kim Cương: lifetime≥10.000, +2%, trần100.000đ, MU-RANK06.

Hạng lấy từ điểm xét hạng, không phải ví điểm khả dụng; hoàn hàng có thể đảo điểm và điều chỉnh rank ledger có chính sách. Các mã MU-TIER02/04/06/10/12/15 cũ ngưng áp cho giao dịch mới theo quy tắc v6.2. Hạng có thể cộng với một voucher chính, kể cả mã đổi điểm nếu SKU và giới hạn profit được duyệt; không mặc định mọi mã đều xếp chồng được.

## 4. THƯ VIỆN VOUCHER ĐỀ XUẤT (DRAFT, KHÔNG KÍCH HOẠT)

MU-WELCOME08: 8%, trần100k, đơn≥300k, khách mới/SKU được chọn.
MU-MEMBER10: 10%, đơn≥500k theo chính sách member, trên SKU được duyệt.
MU-KIT12: 12%, trần500k, đơn≥800k.
MU-CART14: 14%, trần280k, đơn≥1,2tr.
MU-BUNDLE16: 16%, trần500k, đơn≥2tr, ít nhất 2 món.
MU-EVENT18: 18%, trần650k, đơn≥2,5tr, sản phẩm biên lợi nhuận cao.
MU-VIP20: 20%, trần800k, đơn≥3tr, high-margin đủ hạng/chính sách.
MU-VIP22: 22%, trần900k, đơn≥4tr, high-margin.
MU-FLASH25: 25%, trần1tr, đơn≥5tr, ít nhất 2 món, chỉ SKU high-margin có hợp đồng/budget.

Các mã từ 14% thường dễ vượt mức giảm cho hàng thu mua biên thấp. Chỉ có thể cấp khi mô phỏng Step1 và Step2 theo từng SKU. Mã phần trăm vẫn phải công bố trần, không quảng cáo hiệu lực toàn hãng nếu chỉ một số SKU đạt.

## 5. BẢNG VOUCHER ĐỔI ĐIỂM (DRAFT)

60 điểm→giảm50.000đ, đơn≥500k;110→100.000đ, đơn≥1tr;160→150.000đ, đơn≥1,5tr;210→200.000đ, đơn≥2tr;500→500.000đ, đơn≥5tr;900→1.000.000đ, đơn≥10tr.

50 điểm→voucher 2% trần100k;100→3% trần150k;200→5% trần250k;350→7% trần300k;500→10% trần500k;800→12% trần700k. Bảng này chỉ là đề xuất đã được ghi ở tài liệu cũ, chưa mặc định mở cho khách.

Mã điểm vẫn là voucher chính: khách chỉ đổi được khi đủ available_points; giữ nguyên quyền hạng khi đổi; cấp voucher và trừ điểm trong một giao dịch DB atomic; không trừ lần hai khi sử dụng. Không cố tình gợi ý dùng điểm nếu khách có MEMBER10 hoặc mã khác rẻ hơn; phải kiểm tra 80% dùng riêng và 75% sau stack.

Điểm phát sinh mới chỉ từ tiền hàng ròng sau mã (không tính vận chuyển), không dựa trên R trước khuyến mãi.

## 6. CÁC BÀI TEST CƠ SỞ

TC01 S=500k B=400k R≈555.556đ; MEMBER10→500k, điểm12, L10=86.560đ (không phí khác).
TC02 S=1tr B=800k R≈1.111.111đ; MEMBER10→1tr, điểm25, L10=172.000đ.
TC03 S=1,5tr B=1,25tr R≈1.666.667đ; MEMBER10→1,5tr, điểm37, L10=208.560đ.
TC04 S=2tr B=1,65tr R≈2.222.222đ; MEMBER10→2tr, điểm50, L10=294.000đ.
TC05 S=3tr B=2,55tr R≈3.333.333đ; MEMBER10→3tr, điểm75, L10=366.000đ.
TC06 S=5tr B=4,5tr R≈5.555.556đ; MEMBER10→5tr, điểm125, L10=360.000đ.
TC07 KIT12 tại R=1.666.667đ, B=1,25tr: mã riêng giảm200k, P=1.466.667đ, điểm36, lời176.347đ, tỷ lệ84,55% L10 => PASS 80%.
TC08 KIT12 + Kim Cương ở cùng giỏ: bonus rank ROUND(2%×R)=33.333đ, Pstack=1.433.334đ, điểm35, lời144.134đ, tỷ lệ69,11% => CHẶN STACK nhưng vẫn cho voucher 12% riêng.
TC09 KIT12 ở R≈1.111.111đ, B=800k: riêng P≈977.778đ lời150.898đ, tỷ lệ87,73% L10 => PASS. Rank Kim Cương cộng thêm ≈22.222đ trên R, sau đó phải tính lại toàn bộ Profit; CHẶN nếu lợi nhuận dưới 75% hoặc sàn tuyệt đối/5%.
TC10 Mã 14% tại R=1.666.667đ, B=1,25tr: mã riêng trả≈1.433.334đ, lời144.134đ=69,11% L10 => CHẶN riêng và combo.
TC11 Mã 14% tại R=2.222.222đ, B=1,65tr, trần280k: Pplain=1.942.222đ, điểm48, lời238.462đ, tỷ lệ81,11% L10 => PASS riêng; rank thêm phải test tiếp ngưỡng75%.
TC12 Mã 12% tại R=3.333.333đ, B=2,55tr: Pplain≈2.933.333đ, điểm73, lời301.573đ, tỷ lệ82,40% => PASS riêng.
TC13 Mã 12% tại R=5.555.556đ, trần500k: giá khách trả5.055.556đ > MEMBER10 trả5tr, không gợi ý nếu khách đã có mã10%.
TC14 FLASH25 giỏ giá R≈5.555.556đ, vốn4,5tr, trần1tr: tiền khách trả4.555.556đ, lãi âm≈71.004đ, CHẶN.
TC15 FLASH25 giỏ high-margin, R=6tr, vốn2,5tr, trần1tr: Pplain=5tr, điểm125, lời2.360.000đ; L10=2.748.800đ, ratio≈85,86% => PASS riêng, nhưng vẫn cần đáp ứng min items/SKU/quota. Nếu có hạng, test stack 75% và lợi nhuận giỏ gốc.
TC16 Nếu khách có voucher đổi điểm 100k trên R=1.111.111đ, số điểm trong ví≥110, dùng voucher riêng P=1.011.111đ; nếu có MEMBER10 P=1tr miễn phí, hiển thị lựa chọn tốt hơn trước khi khuyên tiêu điểm.
TC17 Nếu khách thiếu điểm đổi mã, trả INSUFFICIENT_POINTS, không trừ điểm, không xếp hạng.
TC18 Voucher hết hạn, hết lượt, vượt budget hoặc SKU cấm: không cấp quyền dùng, không hiển thị là hợp lệ dù profit pass.
TC19 R chưa xác thực giá công khai: fail-closed, không tự sinh R=S/0,9 làm so sánh giảm giá ảo.
TC20 Đồng/ Bạc /Vàng/ Bạch Kim/ Lục Bảo/ Kim Cương phải test trên các mốc 500k,1tr,1,5tr,2tr,3tr,5tr và nhiều rate 8/10/12/14/16/18/20/22/25, bao gồm doanh thu biên thấp, phí 0/2/3%, sửa chữa ≥50k và giá hiệu lực thay đổi.
TC21 Mã riêng PASS, stack FAIL → API VOUCHER_ONLY_VALID, rank rejected reason INSUFFICIENT_PROFIT_75.
TC22 Mã riêng FAIL → API VOUCHER_INVALID, không tính stack để lách qua test80%.
TC23 Mã riêng PASS, stack PASS → STACK_VALID, tổng tiền giảm = Dprimary + Drank theo cùng giá R eligible (đúng caps, rounding).
TC24 Hai voucher chính / hai hạng cùng đơn → reject duplicate stacking.
TC25 Cọc mua hàng lấy % trên tiền hàng sau mã hợp lệ; cọc chưa phát sinh điểm; COD không cộng phí giao hai lần.
TC26 Đơn COMPLETED cấp FLOOR(PaidEligible/40000) điểm đúng một lần; duplicate webhook không cộng thêm.
TC27 Hoàn một phần hoặc toàn phần điều chỉnh điểm, voucher, quota/budget và thanh toán bằng transaction compensating, không xóa giao dịch lịch sử.
TC28 Trade/thu mua/cầm cố/payout marketplace không cấp điểm từ tiền shop trả khách; seller voucher cần tài trợ riêng.
TC29 Vốn/chi phí shop tăng khiến ProfitPlain hoặc ProfitStack thủng ngưỡng: trạng thái đổi trước khi chốt, cần khách xác nhận quote mới; đơn đã trả tiền giữ nguyên snapshot.
TC30 Giỏ upsell chỉ mở giảm tốt hơn nếu sau voucher vẫn giữ ngưỡng theo nhánh và lợi nhuận tuyệt đối giỏ mới không thấp hơn giỏ ban đầu.

## 7. QUY TẮC QA TỰ ĐỘNG VÀ UAT

Kiểm thử bảng chéo: 6 mốc bán × 6 hạng × 9 voucher chính = 324 tổ hợp tối thiểu, chưa tính nhiều kiểu trần, phí, chi phí, số món, trạng thái và mã đổi điểm. Với mỗi tổ hợp tính plain trước rồi stack; đảm bảo không có trạng thái STACK_VALID khi VOUCHER_ONLY_VALID/PlainEligible false. Test doanh thu 0, giá cao >5tr, số âm, rounding ở ranh giới 39.999/40.000 điểm, phí >0, 2 SKU với eligibility không đồng đều.

Giữ dữ liệu fixture SKU giả định riêng khỏi bảng SKU thật. Mọi phép tính dựa trên price/cost versions; full audit logs và idempotency. Nhấn mạnh ngưỡng 75% là tỷ lệ GIỮ LỜI, không phải tỷ suất lãi 75%/giá trị đơn.

Bảng đối soát trước go-live: ví dụ voucher12% và rank2% với R=1.666.667đ phải trả≈1.433.334đ, nhưng tổ hợp phải chặn; không được tự động hạ rank 2% thành phần trăm khác trong cùng mã sau khi khách đã xác nhận.

## 8. QUY TẮC CÔNG BỐ CHO KHÁCH

Mọi mã hiển thị rõ tên và tỷ lệ, trần giảm, hàng áp dụng, min order, số món, thời gian, lượt, ngân sách/khi hết quyền, quyền hạng có thể cộng trên một voucher đủ điều kiện. Không hứa được cộng với tất cả mã/hàng. Không lộ chi phí, công thức L10 và tỷ lệ lợi nhuận. Nếu stack không đạt, hiển thị voucher vẫn dùng riêng và thông báo quyền giảm theo hạng không khả dụng với giỏ hiện tại; có thể gợi ý SKU khác, không tự thêm sản phẩm vào giỏ.

Các ví dụ mang tính minh họa và không thay thế thỏa thuận giá ở đơn hàng đã thanh toán.
