'use client';

import Link from '@/i18n/navigation';
import StoreLayout from '@/components/Layouts/StoreLayout';
import AssistantConversation from '@/components/CustomerAssistant/AssistantConversation';
import { useCustomerAssistant } from '@/shared/client/providers/CustomerAssistantProvider';

export default function AssistantPage() {
  const { epoch, setPrompt, setResearch } = useCustomerAssistant();
  return (
    <StoreLayout>
      <div className="agent-workspace customer-agent">
        <aside className="agent-workspace-intro">
          <span className="agent-eyebrow">MUA SẮM CÙNG AGENT</span>
          <h1>
            Một người bạn.
            <br /> Nhiều cách giúp.
          </h1>
          <p>Tìm đúng sản phẩm, hiểu rõ lựa chọn và làm mọi thứ thuận tiện hơn.</p>
          <div className="agent-workspace-features">
            <div>
              <span>01</span>
              <strong>Tìm theo nhu cầu của bạn</strong>
              <p>Kể về mục đích sử dụng, ngân sách và điều bạn ưu tiên.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Hiểu trước khi chọn</strong>
              <p>So sánh thông số và đánh giá, có nguồn từ cửa hàng.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Thực hiện ngay trong chat</strong>
              <p>Giỏ hàng, thanh toán, yêu thích và hỗ trợ sau mua.</p>
            </div>
          </div>
          <button
            className="agent-primary"
            onClick={() => {
              setResearch(true);
              setPrompt('Giúp tôi chọn và so sánh sản phẩm phù hợp. Hãy hỏi nhu cầu và ngân sách của tôi trước.');
            }}
          >
            Bắt đầu nghiên cứu ↗
          </button>
          <Link className="agent-text-button" href="/shop">
            Khám phá sản phẩm →
          </Link>
        </aside>
        <section className="agent-workspace-chat" aria-label="Trợ lý Agent">
          <header className="agent-panel-header">
            <div className="agent-avatar" aria-hidden="true">
              ✦
            </div>
            <div>
              <h2>Agent</h2>
              <p>Trợ lý của bạn, ngay trong cửa hàng</p>
            </div>
            <span className="agent-store-badge">Trong phạm vi cửa hàng</span>
          </header>
          <AssistantConversation full key={epoch} />
        </section>
      </div>
    </StoreLayout>
  );
}
