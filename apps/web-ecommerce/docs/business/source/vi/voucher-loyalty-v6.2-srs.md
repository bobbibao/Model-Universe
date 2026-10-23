<!-- Archived from Google Drive folder "Voucher & Loyalty v6.2 – BRD, SRS và Quy tắc triển khai"
     (17T-YNzDtFLUJDEH1s1oxNg-3pPPuNYRt), document "02 – SRS Đặc tả chức năng, API, Dữ liệu và Quy trình v6.2"
     (id 16hMLwQAwOaiUPp8tL2regQynIdha0R0dkgoED056oIw, last modified 2026-10-20). Read 2026-10-22 through the Drive
     connector (text export, markdown escapes removed). The original mixes Vietnamese and English; kept as written. -->

# SRS — MODEL UNIVERSE VOUCHER & LOYALTY ENGINE v6.2

Tình trạng: Đặc tả thiết kế cần triển khai, không hàm ý code đang hoạt động.
Tham chiếu BRD: https://docs.google.com/document/d/1f2AVTrtDNZe6eG0S4u71Iz-R2RlvfVTfRELqhRn5RBc/edit
Nguyên tắc: mọi phép tính tại backend; VNĐ số nguyên, chống tràn và làm tròn nhất quán; không tin giá/điểm/voucher từ client.

## 1. MỤC TIÊU CHỨC NĂNG

Một rule engine thống nhất định giá R thật, mã giảm chính, quyền giảm hạng, chi phí thực và điểm thưởng. API cho frontend nhận danh sách mã có trạng thái: (i) không hợp lệ (ii) dùng riêng hợp lệ (iii) được cộng một hạng. Checkout revalidate tất cả, khóa snapshot ngay khi xác nhận. Voucher riêng phải giữ ≥80% lợi nhuận chuẩn MEMBER10, tổ hợp voucher+hạng phải giữ ≥75%, cả hai đạt lãi tối thiểu 50k và 5% tiền hàng (có thể cấu hình có duyệt).

## 2. DỮ LIỆU NGUỒN VÀ MÔ HÌNH

products, product_variants(id,brand,model,condition,status,owner_type,stock), approved_public_prices(sku_id,regular_price_vnd,valid_from,valid_to,proof,status,approved_by,version), sku_cost_profiles(sku_id,buyback_or_purchase_cost,repair_cost,handling,packaging,shipping_subsidy,fixed_fee,expected_returns,fee_rate,source_version,approved_by), buyback_price_tiers, voucher_templates(id,code,type,percent,fixed_amount,discount_cap,min_order,min_quantity,start_at,end_at,total_limit,user_limit,budget,status,funding_party,public_terms_version,rule_version), voucher_eligible_skus, voucher_excluded_skus, customer_vouchers(id,user_id,voucher_template_id,issued_at,expires_at,state), loyalty_rank_policy(rank,min_lifetime_points,additive_percent,cap_vnd), loyalty_accounts(user_id,lifetime_points,available_points,pending_points,reserved_points), loyalty_ledger(id,user_id,order_id,type,delta,balance_after,idempotency_key), point_redemption_catalog, point_redemptions, checkout_quotes(id,user_id,cart_hash,selected_voucher,rank,base_prices,discounts,payable,profit_evaluation,points_pending,rule_version,expires_at), checkout_promotions, order_price_snapshots, profit_evaluations, campaign_budgets, promotion_audit_logs. Mọi bảng định giá/điểm có version+timestamp và chính sách restore.

Không lưu secrets/chi phí Admin trong payload khách. Seller/marketplace chỉ đủ điều kiện khi có funding contract và giá vốn kinh tế chính xác cho shop; không suy chi phí seller sở hữu bằng giá thu mua shop.

## 3. TRẠNG THÁI & KIỂU MÃ

VoucherTemplate: DRAFT→REVIEW→APPROVED→SCHEDULED→ACTIVE→PAUSED→EXPIRED/ARCHIVED. CustomerVoucher: ISSUED→RESERVED→REDEEMED/RELEASED→EXPIRED/REVOKED. Không coi mẫu mã trên Sheets là đang phát hành.

discount_type: PERCENT | FIXED | GIFT | SHIPPING. Chỉ mã giảm tiền PERCENT/FIXED mặc định nằm trong voucher chính; gift/shipping có ngân sách, chi phí thực và quy tắc riêng, không được lách giới hạn bằng ghi 0 chi phí. One primary voucher per order; one eligible rank discount; no duplicate stacking.

Funding: SHOP|SELLER|SHARED, phải tính phần chi phí/giao nhận/đối soát tài trợ theo hợp đồng.

Loyalty rank codes: MU-RANK01 (Đồng ≥150;0.5%;cap15k); RANK02 (Bạc ≥250;0.75%;25k); RANK03 (Vàng ≥500;1%;40k); RANK04 (Bạch Kim ≥1500;1.25%;50k); RANK05 (Lục Bảo ≥3500;1.5%;65k); RANK06 (Kim Cương ≥10000;2%;100k). Đây là đề xuất v6.2, không sử dụng mức giảm hạng độc lập 2–15% của bản cũ.

## 4. PRECISION VÀ GIẢ ĐỊNH PHÉP TOÁN

Tất cả monetary values là integer VNĐ; percent lưu basis points (10%=1000 bps, 0.75%=75 bps), không dùng float của JavaScript tiền.

ROUND_HALF_UP nonnegative. discountPrimary = MIN(round_half_up(R_eligible×bps/10000), cap nếu cap có, eligible subtotal), fixed tương tự. RankBonus=MIN(round_half_up(R_rank_eligible×rank_bps/10000), rank_cap, remaining eligible subtotal). R_rank_eligible là phần giá danh mục được cả mã và quyền hạng chấp nhận, không phải tùy tiện trên SKU bị loại. Khi voucher và rank được phép cùng một tập SKU, 12%+2% tính trên cùng R tương ứng 14% danh nghĩa (trừ caps). Nếu tập SKU khác nhau, discount phải phân bổ theo từng dòng SKU đúng quyền hưởng, không quảng cáo một tỷ lệ tổng sai.

PaidProductSubtotal = total_regular_public_prices − primary_discount − rank_discount (hoặc −primary_discount khi không cộng); min0. Shipping/fees khách trả hiển thị và thanh toán riêng, kiểm tra profit chi phí shop chịu.

Profit(P) = P×(1−fee_rate) − C − giftCost − floor(eligible_paid_products/40000)×1120. Điểm dự phòng tỷ giá cấu hình, không trả tiền mặt/điểm. L10=Profit(round_half_up(0.9×total_regular_public_prices)) trên cùng giỏ, loại các SKU không đủ điều kiện nếu chính sách giá có ngoại lệ. Nếu L10<=0 hay thiếu dữ liệu thì BLOCK. ProfitPlain≥max(0.8×L10,50000,0.05×Pplain); ProfitStack≥max(0.75×L10,50000,0.05×Pstack).

Không tự giảm rank cap sau khi khách chọn để tránh lỗ. API phải trả rõ voucher đơn dùng được nhưng rank không kết hợp được. Trước user confirm có thể đề xuất phương án khác, không sửa giá sau chốt.

## 5. THUẬT TOÁN PREVIEW

Input auth user, cart SKU/qty, address/location shipping fee, payment method. Server load actual sku stock, approved R, cost profile, fee, user points/rank/entitlement, voucher list and campaign state. Build cart hash, calculate baseline L10. For each owned/accessible voucher: validate date, quota, budget, min order, SKU, number of items, funding, point entitlement. Compute Dv, Pplain, Lplain; if plain check fails, reason INSUFFICIENT_PROFIT_80 etc and no rank attempt. If passes and user has rank entitlement, compute Dr on eligible R, Pstack and Lstack; if passes, status STACK_VALID; else VOUCHER_ONLY_VALID with rank rejection reason. Sort all valid options by final payable and tie-break by less points spent, earlier expiry, lower campaign budget (configurable). Return signed quote id, TTL, expiration and breakdown; no sensitive profit fields for customer.

For deposit/COD, compute deposit only from final product subtotal after approved discounts, not original R. Shipping line explicit; reconciliation uses order snapshot, not recomputed voucher on order fulfillment.

## 6. ADMIN API ĐẶC TẢ

POST /admin/pricing/buyback-quote: input S/condition/defect count, output B/candidate tier/review flags.
POST /admin/pricing/calculate-published-price: input target S and price proof, outputs proposed R and validation; R is NOT automatically approved by algebra.
POST /admin/vouchers/simulate: input voucher template, sku cart scenarios, rank, all costs, output keep_ratio plain/stack, failed guard, eligible sku and budget forecast.
POST /admin/vouchers: DRAFT voucher creation, requires audit and version.
PATCH /admin/vouchers/:id: update draft/review, prohibit silent mutate active/used terms.
POST /admin/vouchers/:id/approve: separate approver authority, proof of profitability.
POST /admin/vouchers/:id/pause: freeze new use without altering paid orders.
GET /admin/promotions/report: usage, budget, cost of points, profit loss, rate of rejected ranks, refund/chargeback.
PUT /admin/loyalty/rank-policy: versioned update thresholds and caps, approval required.
POST /admin/loyalty/points-adjust: compensating ledger only with reason and actor.

## 7. CUSTOMER API ĐẶC TẢ

GET /me/loyalty: rank, lifetime, available, pending, rank progress, limits, points expiry if any.
GET /me/vouchers: owned vouchers, status, expiry, spend requirements, and rank eligibility summaries (not promised for all SKU).
GET /promotions/eligible?cartId: available and blocked coupon options with public reasons.
POST /checkout/preview: cart snapshot, optionally selected voucher, returns quoteId, R breakdown, primary discount, rank discount, product payable, fee/shipping, payment/deposit, prospective points, statuses.
POST /checkout/select-voucher: voucherId + quote/cart, returns re-evaluated signed quote.
POST /checkout/confirm: signed quote id, idempotency key, payment details; atomic reserve stock/voucher/budget, store snapshot, reject changed quote unless customer reconfirms.
POST /me/points/redeem: points + reward_catalog_id, atomic debit/issue customer voucher; no double-debit on use.
POST /orders/:id/cancel /refund (authorized): compute compensating voucher/points ledger and payment refund accounting; ensure not retroactively modifying original posted snapshot.
Request schemas must validate IDs, ownership, risk scoring, idempotency, rate limits, permission checks, dates/timezone Asia/Ho_Chi_Minh.

## 8. BUSINESS RULE IDs

BR-001 Price R must be approved, active, genuinely available, not constructed fake compare-at.
BR-002 MEMBER10 baseline pricing from R, no artificial price increase to fund discount.
BR-003 Buyback table selection by S (not B), exceptions require Admin review.
BR-004 One primary voucher, optional one rank; rate of both based on R eligible; no two voucher templates.
BR-005 Plain voucher >=80% L10 plus min50k and >=5% revenue.
BR-006 Stack voucher+rank must pass BR-005 first and then >=75% L10 plus same floors.
BR-007 Fail stack -> plain voucher offered if plain valid; fail plain -> both blocked.
BR-008 No silent capping rank below publicly declared rank cap; adjust campaign ahead of issuance or mark SKU stack-ineligible.
BR-009 Point earn floor(PaidEligible/40000) after COMPLETED; no double earning.
BR-010 Point redeem atomic; no duplicate spend; rank lifetime points unchanged.
BR-011 Voucher validity based on SKU, min order, quota, budget, ownership, expiry, rank, funding, payment type.
BR-012 Deposit calculation after all chosen discounts; COD consistent with prepaid portion and shipping.
BR-013 Refund/return adjustments append ledger, reversals and funding; no deleting history.
BR-014 Cart upsell profit must also not be below original cart profit, not just keep ratio.
BR-015 Seller-owned inventory not covered by shop-funded voucher/loyalty without financial approval.
BR-016 No customer exposure of cost profile/profit internals; Admin only.
BR-017 Rule and price snapshot frozen after order confirmation.
BR-018 Fail-closed on unknown fees/costs/missing SKU approvals and suspect public R.

## 9. UI CUSTOMER

Product tile/PDP: show R, member 10% if customer eligible, badge eligible vouchers only if tested for SKU, no false save% or artificial compare-at.
Cart: show all owned vouchers, states VOUCHER_INVALID, VOUCHER_ONLY_VALID, STACK_VALID; separate display 'Mã giảm ...' and 'Ưu đãi hạng ...' and total savings. Explain 'Ưu đãi hạng không áp dụng cùng mã này cho sản phẩm/giỏ hiện tại' with no profit leakage; alternative compatible recommendations.
Checkout: revalidate quote and display quote expiry, shipping, COD, deposit, points pending, effective % total; don't allow manually stacking a hidden second voucher.
My Wallet: current points, rank progression, available/locked vouchers, redemption conditions and audit for refunds.
Admin: full financial view, simulator all six price tiers / rank tiers and high vouchers, alerts when cost changed.

## 10. TÍNH TOÁN TRANSACTION VÀ NHẤT QUÁN

voucher redemption + inventory reserve + budget spend + order create + quote snapshot under transaction or saga with retries and compensating actions. Stripe/MoMo/VNPay/COD/webhook idempotency across retries, one point-credit per completed order. Concurrency checks for per-user and global use quotas and budget. Expired quote requires reprice/reconfirm.

Payment adjustments record line-item allocations for eligible/excluded SKUs. Refund partially reverses points based on retained paid eligible products, resolves voucher entitlement refund according to policy and ledger, payment gateway refunded sum. Returned item cannot create negative paid total.

## 11. AUDIT, SECURITY, TEST AND NON-FUNCTIONAL

Log every quote, reason code, price proof version, cost version, voucher/user/rank snapshots, point ledger, who approved, recalculation reasons, refund. Only authorized Admin accesses cost/margin; encrypted identifiers where appropriate. Rate-limit coupon preview/redeem, prevent enumeration and timing disclosure of profit.

Targets proposal (not measured SLA): price preview p95 under 500ms on normal cart after caching required cost/rules, transactional checkout with durable concurrency, deterministic rounding. Reconcile nightly totals of redeemed vouchers, reserve, points liability, refunds, promotions. Monitoring for negative profit orders, failing guards, double points, budget overruns and unapproved price versions.

Test via contract tests and integration/e2e: every voucher rate and 6 ranks × 6 reference prices, fees 0/2/3%, repair costs, eligible/ineligible SKU, expired/budget edge, partial refund, duplicate webhook, COD failure, trade, marketplace and quote races.

## 12. IMPLEMENTATION ORDER

Phase A: Data migration/backfill product R and cost profile; currency integer, versioned rule; freeze v6.2 specs.
Phase B: Backend profit engine with unit test on 80/75, point reserve, cent-safe fixed precision and vouchers.
Phase C: Voucher wallet, redeem atomic, rank entitlement, preview and checkout snapshot.
Phase D: Admin simulator/approval, UI product/cart, logistics/COD and refunds.
Phase E: Load/concurrency, QA UAT with product owners, monitoring, controlled rollout/rollback by campaign or SKU.
Do not activate the proposed voucher catalog until approval, SKU allowlists, price proof and real fee data exist.
