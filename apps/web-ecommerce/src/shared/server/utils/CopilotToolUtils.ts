// The copilot's write tools (apps/agent-service src/shop_agent/tools/writes.py): a tool's name is its Agent API action
// type, and a call becomes the request below, pinned by packages/contracts/test-vectors/copilot/write-tools.json. The
// gateway builds the request from the call a person approves or edits and signs the grant over it; the copilot page
// renders it with the action's renderer. No copilot tool is ever high tier (no category discount, no new ad), so a
// copilot approval never needs the step-up.

export interface CopilotTool {
  endpoint: string; // `{ref}` is filled from the call's `ref` argument
  pathParam?: 'ref';
  editable: string[]; // what a person may change
  protective: boolean; // never waits for a person and carries no grant
}

export const COPILOT_TOOLS: Record<string, CopilotTool> = {
  apply_discount: { endpoint: 'pricing/discounts', editable: ['percent', 'duration_days'], protective: false },
  adjust_inventory: { endpoint: 'inventory/adjustments', editable: [], protective: false },
  switch_channel: { endpoint: 'channels/switch', editable: [], protective: false },
  create_task: { endpoint: 'tasks', editable: ['title', 'description', 'due_in_days'], protective: false },
  update_sop_checklist: { endpoint: 'sop/checklists', editable: ['add_items'], protective: false },
  create_coupon: {
    endpoint: 'promotions/coupons',
    editable: ['title', 'percent', 'duration_days', 'min_order_vnd', 'usage_limit'],
    protective: false,
  },
  end_promotion: { endpoint: 'promotions/{ref}/end', pathParam: 'ref', editable: [], protective: true },
  create_post: { endpoint: 'marketing/posts', editable: ['message', 'scheduled_at'], protective: false },
  activate_ad: { endpoint: 'marketing/ads/{ref}/activate', pathParam: 'ref', editable: [], protective: false },
  pause_ad: { endpoint: 'marketing/ads/{ref}/pause', pathParam: 'ref', editable: [], protective: true },
  set_ad_budget: {
    endpoint: 'marketing/ads/{ref}/budget',
    pathParam: 'ref',
    editable: ['daily_budget_vnd'],
    protective: false,
  },
};

export interface CopilotRequest {
  endpoint: string;
  body: Record<string, unknown>;
}

// The request of a write tool call: the path parameter fills the endpoint, the other non-null arguments are the body.
export const copilotRequest = (tool: string, args: Record<string, unknown>): CopilotRequest | null => {
  const definition = COPILOT_TOOLS[tool];
  if (!definition) return null;
  const { pathParam } = definition;
  const body = Object.fromEntries(
    Object.entries(args).filter(([key, value]) => key !== pathParam && value !== null && value !== undefined),
  );
  const endpoint = pathParam
    ? definition.endpoint.replace(`{${pathParam}}`, String(args[pathParam] ?? ''))
    : definition.endpoint;
  return { endpoint, body };
};
