# LLM simulator cho development

Simulator chạy trên máy, không gọi model trả phí. API dùng Bearer API key, Chat Completions, streaming SSE,
function/tool calls, JSON structured output và embeddings. Các graph và công cụ thật của ứng dụng vẫn chạy;
simulator thay lớp LLM. Không cần cài thêm dependency hoặc tải chat model.

## Chạy và chuyển model

Từ `apps/agent-service`, mở một terminal:

```powershell
uv run shop-agent llm-simulator
```

Trong `apps/agent-service/.env`:

```dotenv
LLM_PROFILE=simulator
LLM_SIMULATOR_BASE_URL=http://127.0.0.1:4010/v1
LLM_SIMULATOR_API_KEY=simulator-dev-key
```

Đổi key nếu muốn; server và Agent phải dùng cùng `LLM_SIMULATOR_API_KEY`. Key này độc lập với
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` và `GOOGLE_API_KEY`. Server mặc định chỉ listen `127.0.0.1:4010`.
Nếu đổi cổng bằng `--port`, cập nhật `LLM_SIMULATOR_BASE_URL` cho khớp.

Khởi động lại Agent Server đang dùng (`aegra dev` / `aegra serve` hoặc `uv run shop-agent dev`).
Với LangGraph dev, có thể chọn cho riêng lần chạy mà không sửa `.env`:

```powershell
uv run shop-agent dev --profile simulator
```

Chuyển sang model thật: đổi `LLM_PROFILE=openai` (hoặc `anthropic`, `google`, `local`), cấu hình key thật,
rồi khởi động lại Agent Server. `config/llm/<profile>.yaml` chứa model của từng vai trò; có thể dùng
`LLM_MODEL_PLANNER=openai:<model>` và các biến `WRITER`, `JUDGE`, `WORKER` để chọn model của provider.
Các override `LLM_MODEL_*` được ưu tiên hơn profile: bỏ các override cũ nếu muốn chuyển toàn bộ vai trò.
Profile simulator từ chối override chat sang provider khác, báo rõ biến cần bỏ để tránh gọi model thật ngoài ý muốn.
Simulator không tự fallback sang provider trả phí. Profile, CLI simulator và override dev bị từ chối ở production.

### Knowledge base đang có dữ liệu

Profile simulator mặc định dùng hashing embeddings 1024 chiều qua API simulator. Các vector này khác vector
`bge-m3`; kiểm tra `kb_meta` hiện có sẽ từ chối trộn model.

Nếu đang dùng knowledge DB đã ingest bằng profile `local`, giữ nguyên embeddings khi chuyển chat:

```dotenv
LLM_EMBEDDING_PROFILE=local
```

Khi đó cần tiếp tục chạy Ollama với `bge-m3`; chat vẫn hoàn toàn dùng simulator. Để dev không cần Ollama,
dùng **database knowledge dành riêng cho simulator**, ingest vào đó với `LLM_EMBEDDING_PROFILE` bỏ trống.
Giữ nguyên `SHOP_READ_DSN` để đọc dữ liệu shop. Không reindex knowledge DB dùng chung chỉ để đổi chế độ dev.
Profile thật hiện có cũng dùng embeddings `bge-m3` theo cấu hình repo.

## Độ phủ hiện tại

| Phạm vi | Kịch bản |
| --- | --- |
| Khách mua hàng | Tìm theo sản phẩm/giới tính/ngân sách, bộ lọc, chi tiết và đánh giá, nghiên cứu/so sánh trong shop |
| Giỏ và thanh toán | Thêm/sửa/xóa/xóa hết giỏ, chọn size/số lượng, quote giá, coupon, checkout và thông tin giao hàng |
| Tài khoản | Yêu thích, lịch sử/chi tiết đơn, hủy đơn đang xử lý, trả hàng theo điều kiện và mã mục thật |
| Hỗ trợ | Nháp liên hệ, nháp đánh giá từ trải nghiệm khách cung cấp, cập nhật hồ sơ, điều hướng, đăng nhập/đăng ký/đổi mật khẩu/đăng xuất |
| Marketing admin | Facebook post, Meta headline/primary text, Google headlines/descriptions/keywords, TikTok ad text |
| Copilot admin | Đọc doanh thu/KPI/tồn kho/xu hướng/chính sách; analyst, customer_voice, copywriter; gọi mọi tool đã bind bằng JSON |
| Improvement/growth | Toàn bộ `KINDS`: điều tra, đọc số liệu, đề xuất từ menu thật, brand judge, bài học; tái dùng các script hiện có |
| Giao thức/lỗi | Auth sai, schema, tool chưa bind, kịch bản hết bước/không có, nhiều phiên song song, SSE, 429, 503, chậm, JSON lỗi |

11 loại store reads và 15 customer actions hiện tại đều có kịch bản. Test so khớp trực tiếp các enum/schema và
`KINDS` trong repo để phát hiện khi tính năng mới chưa được thêm. Các thao tác ghi vẫn đi qua xác nhận khách
hoặc phê duyệt admin, validation, quyền truy cập và idempotency của ứng dụng.

Ví dụ câu hỏi khách: `Tìm giày nam dưới 500k`, `Nghiên cứu chuyên sâu áo Cotton`,
`Thêm sản phẩm #73 size M vào giỏ`, `Hủy đơn #42`, `Trả hàng đơn #42 vì sai size`,
`Viết đánh giá sản phẩm #73, 4 sao, trải nghiệm: áo vừa đẹp`.
ID sản phẩm/đơn/mục phải tồn tại và được đọc từ shop; simulator không tự seed dữ liệu.

Ví dụ copilot: `Doanh thu 7 ngày qua?`, `Tổng hợp lý do trả hàng`, `So sánh giá đối thủ`,
`Tạo mã giảm giá AI-DEV123 10% trong 7 ngày`, `Đăng bài ref: dev-post; nội dung: Khám phá cửa hàng`.
Thông số ghi chưa đủ sẽ được hỏi lại. Để gọi chính xác bất kỳ tool nào, nhập JSON vào copilot:

```json
{"tool":"create_post","args":{"ref":"dev-post","message":"Khám phá cửa hàng","link_path":"/shop"}}
```

Chỉ tool được bind cho vai trò đó mới có thể được gọi. Gọi tool trong simulator vẫn thực thi tool thật sau
phê duyệt của ứng dụng; dữ liệu nền có thể là shop dev thật hoặc `SHOP_ADAPTER=fake` nếu chạy graph trong process.
Monitor và collect không gọi LLM: chúng tiếp tục dùng logic/dữ liệu nguồn hiện có.

## Thêm kịch bản bằng YAML

Built-ins: `src/shop_agent/testing/simulator/scenarios/shop.yaml`. Các script operational/test cũ nằm trong
`src/shop_agent/testing/scripts/*.yaml`. Thêm thư mục riêng trong `.env`:

```dotenv
LLM_SIMULATOR_SCENARIOS_DIR=./data/llm-scenarios
```

Hoặc chạy `uv run shop-agent llm-simulator --scenarios-dir ./data/llm-scenarios`.
YAML trong thư mục riêng được ưu tiên trước built-ins; cùng `id` sẽ thay built-in.
File YAML tự reload khi thay đổi, không cần khởi động lại server.

```yaml
scenarios:
  - id: dev.weekly-revenue
    scope: copilot
    match: ["bao cao doanh thu tuan|doanh thu 7 ngay"]
    examples: ["Báo cáo doanh thu tuần"]
    steps:
      - tool_calls:
          - name: get_sales_summary
            args: {days: 7}
      - call: shop_agent.testing.script_fns:echo_tool_result

  - id: dev.customer-empty
    scope: customer
    match: ["san pham khong ton tai"]
    repeat_last: true
    steps:
      - structured:
          answer: "Chưa tìm thấy sản phẩm này. Bạn đổi từ khóa nhé."
          reads: []
          actions: []
          productIds: []
```

`match` là regex trên chữ thường tiếng Việt **đã bỏ dấu** (`đ` → `d`). First match wins. `scope` là
`customer`, `marketing`, `copilot`, `any`; nhận diện qua schema `Decision`/`MarketingCopy`, còn lại là copilot.
`script_key` có thể khớp chính xác metadata graph (ví dụ `customer-assistant` hoặc `improvement.brand_judge`).
`covers` ghi các capability của kịch bản và `examples` ghi câu thử.

Mỗi step chọn một trong `content`, `structured`, `tool_calls`, `call`, `error`.
`call: package.module:function` dành cho hàm Python tin cậy, nhận `messages`, `metadata`, `tools` và trả
`AIMessage` hoặc step mapping; dùng khi phải đọc ID/số liệu thực tế từ ngữ cảnh.
Có thể thêm `delay_ms: 1500` (0–30000). `error: {status: 429, message: Rate limit}` tạo lỗi API.

Step tính theo số assistant messages sau user message cuối, nên hội thoại mới không dùng chung bộ đếm.
`repeat_last: true` chạy lại step cuối; mặc định hết bước sẽ lỗi rõ ràng. Script operational cũ giữ nguyên
ngữ nghĩa replay và chọn subagent bằng `lc_agent_name`.

Xem danh sách:

```powershell
uv run shop-agent llm-simulator --list
```

API: `GET /v1/simulator/scenarios` (cần Bearer key). Mỗi completion JSON trả thêm
`simulator.scenario`, `simulator.step`, `usage_is_estimated`; token usage là ước lượng, giá profile bằng 0.

Chọn kịch bản cố định qua LangChain:

```python
reply = llm.chat_model("planner").invoke("test", {"metadata": {"scenario": "fault.rate-limit"}})
```

Hoặc qua OpenAI Chat Completions body: `"simulator": {"scenario": "fault.unavailable"}`
(OpenAI SDK dùng `extra_body={"simulator": {"scenario": "..."}}`). Built-in lỗi:
`fault.rate-limit`, `fault.unavailable`, `fault.slow`, `fault.invalid-json`.

## Kiểm tra

```powershell
uv run pytest tests/unit/llm/test_simulator.py -q
uv run shop-agent doctor --profile simulator --live
uv run shop-agent simulate loop --profile simulator --auto-approve --assert
```

Hai lệnh sau cần simulator đang chạy. Test tự mở API trên cổng ngẫu nhiên, không dùng key thật, DB hay model trả phí.
Simulator quyết định bằng kịch bản và regex; đây là kiểm thử chức năng/giao thức, không đánh giá khả năng suy luận
của model thật. Câu chưa khớp được hỏi lại; thêm YAML để kiểm thử biến thể mới. `--strict` hoặc
`LLM_SIMULATOR_STRICT=true` làm câu chưa khớp lỗi 422 (copilot generic vẫn hỗ trợ tool JSON).
API hỗ trợ text Chat Completions, `n=1`, function tools, `json_schema`, embeddings dạng text và float/base64.
Responses API, ảnh, audio và token-array embeddings chưa được hỗ trợ.
