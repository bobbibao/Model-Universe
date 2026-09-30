import type { ReviewAction } from '@/shared/types/agent';
import { INVENTORY_STATUS_LABELS, roleLabel } from './agentLabels';

// Action renderers: one per Agent API action type, so a person reads what will run, not JSON. A type without a
// renderer falls back to its description and body (new capabilities show up without a console change).
type Renderer = (body: Record<string, unknown>) => React.ReactNode;

const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

const RENDERERS: Record<string, Renderer> = {
  apply_discount: (body) => (
    <>
      Giảm <strong>{String(body.percent)}%</strong> trong <strong>{String(body.duration_days)} ngày</strong> cho{' '}
      {list(body.skus).length} mã: <span className="break-all text-body">{list(body.skus).join(', ')}</span>
    </>
  ),
  switch_channel: (body) => (
    <>
      Chuyển {list(body.skus).length} mã sang kênh <strong>{String(body.to_channel)}</strong>:{' '}
      <span className="break-all text-body">{list(body.skus).join(', ')}</span>
    </>
  ),
  adjust_inventory: (body) => (
    <>
      {String(body.sku)}: <strong>{INVENTORY_STATUS_LABELS[String(body.new_status)] || String(body.new_status)}</strong>
      {body.reason ? <span className="text-body"> ({String(body.reason)})</span> : null}
    </>
  ),
  create_task: (body) => (
    <>
      Giao việc cho <strong>{roleLabel(String(body.assignee_role))}</strong>: {String(body.title)}
      {body.due_in_days != null ? <span className="text-body"> (hạn {String(body.due_in_days)} ngày)</span> : null}
      {body.description ? <span className="block text-sm text-body">{String(body.description)}</span> : null}
    </>
  ),
  update_sop_checklist: (body) => (
    <>
      Bổ sung vào {String(body.sop_id)}: {list(body.add_items).join('; ')}
    </>
  ),
};

const ActionView = ({ action }: { action: ReviewAction }) => {
  const render = RENDERERS[action.type];
  return (
    <li className="text-sm">
      {render ? (
        render(action.body)
      ) : (
        <>
          {action.description || action.type}{' '}
          <code className="break-all text-xs text-body">{JSON.stringify(action.body)}</code>
        </>
      )}
    </li>
  );
};

export default ActionView;
