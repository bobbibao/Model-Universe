// The agent console's view of the Agent Server (apps/agent-service src/shop_agent/graphs/improvement.py).
// Field names are the agent's (snake_case): the browser reads thread state through the SDK, unmapped.

export type ImprovementStage = 'new' | 'investigating' | 'reviewing' | 'acting' | 'measuring' | 'learning' | 'closed';

export type ImprovementOutcome =
  'measured' | 'rejected' | 'expired' | 'failed' | 'blocked' | 'no_viable_option' | 'shadow' | 'do_nothing';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type RiskTier = 'protective' | 'low' | 'medium' | 'high' | 'blocked';
export type Verdict = 'success' | 'inconclusive' | 'negative' | 'positive';
export type DecisionType = 'approve' | 'edit' | 'reject' | 'respond';

export type ReviewAction = {
  action_id: string;
  type: string;
  endpoint: string;
  body: Record<string, unknown>;
  idempotency_key: string;
  description: string;
  editable_fields: string[];
};

export type OptionEstimate = {
  recovery_vnd: number;
  cost_vnd: number;
  waste_reduction_vnd: number;
  net_vnd: number;
  risk: 'low' | 'medium' | 'high';
  assumptions: string[];
};

// A growth option's estimate: ranges from the lever priors (p10 / p50 / p90), whole VND.
export type GrowthEstimate = {
  lever: string;
  revenue_vnd: { p10: number; p50: number; p90: number };
  profit_vnd: { p10: number; p50: number; p90: number };
  spend_vnd: number;
  discount_cost_vnd: number;
  confidence: number;
  assumptions: string[];
};

// The deterministic brand lint and the brand judge's scores, for options that publish copy.
export type BrandReview = {
  lint?: string[];
  scores?: { criterion: string; score: number; note: string }[];
  passed?: boolean;
};

export type ReviewOption = {
  option_id: string;
  strategy: string;
  title: string;
  rationale: string;
  params: Record<string, unknown>;
  estimate: OptionEstimate | GrowthEstimate | Record<string, never>;
  tier: RiskTier;
  total_vnd?: number; // ad spend plus discount exposure (what a high-tier approver types)
  needs_human?: boolean;
  brand?: BrandReview;
  actions: ReviewAction[];
};

export type Cause = { text: string; confidence: number };

// The interrupt payload of a proposal review.
export type ReviewPayload = {
  type: 'proposal_review';
  thread_id: string;
  kind: string;
  title: string;
  severity: Severity;
  summary: string;
  causes: Cause[];
  sop_refs: string[];
  options: ReviewOption[];
  recommended_option_id: string;
  allowed_decisions: DecisionType[];
  edit_rule: string;
  expires_at: string | null;
  error: string | null;
};

// What the console sends to resume a review; the gateway adds the approver and the approval grant.
export type ReviewDecision = {
  type: DecisionType;
  option_id?: string;
  args?: Record<string, unknown>;
  note?: string;
  confirm_total_vnd?: number; // high tier: the total typed by the approver
};

export type Opportunity = {
  kind: string;
  fingerprint: string;
  severity: Severity;
  title: string;
  summary: string;
  evidence: Record<string, number | string>;
  skus: string[];
  detected_at: string;
};

export type ActionStep = {
  action_id: string;
  type: string;
  endpoint: string;
  idempotency_key: string;
  ok: boolean;
  status_code: number | null;
  error_code: string | null;
  detail: string;
  ref: string | null;
  reverted: boolean;
};

export type KpiDelta = {
  name: string;
  baseline: number;
  current: number;
  delta_pct: number;
  improved: boolean;
  improvement_pct: number;
};

export type Measurement = { verdict: Verdict; summary: string; measured_at: string; deltas: KpiDelta[] };

export type ImprovementValues = {
  stage?: ImprovementStage;
  opportunity?: Opportunity;
  proposal?: { summary: string; causes: Cause[]; sop_refs: string[]; recommended_option_id: string };
  options?: (ReviewOption & { violations: string[]; route: string })[];
  recommended_option_id?: string;
  review_expires_at?: string;
  decision?: {
    type: string;
    option_id?: string;
    args?: Record<string, unknown>;
    note?: string;
    approver?: string;
    mode?: string;
  };
  approved?: ReviewAction[];
  steps?: ActionStep[];
  followup_due_at?: string;
  measurement?: Measurement;
  outcome?: ImprovementOutcome;
  lessons?: string[];
  responses?: string[];
  tools_used?: string[];
};

export type ImprovementThread = {
  thread_id: string;
  status: 'idle' | 'busy' | 'interrupted' | 'error';
  created_at: string;
  updated_at: string;
  metadata: { kind?: string; title?: string; severity?: Severity; fingerprint?: string };
  values: ImprovementValues;
};

export type AgentCase = {
  key: string;
  kind: string;
  text: string;
  outcome: string | null;
  verdict: Verdict | null;
  strategy: string | null;
  lessons: string[];
  closedAt: string;
};

export type AgentTaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';

export type AgentTask = {
  id: number;
  title: string;
  assigneeRole: string;
  description: string | null;
  dueAt: string | null;
  status: AgentTaskStatus;
  createdAt: string;
};

// The copilot (`assistant`): a chat or a daily briefing (the cron's run, kept so it can be read).
export type CopilotThread = {
  threadId: string;
  updatedAt: string;
  briefing: boolean;
  waiting: boolean; // a tool call waits for a decision
};

// What the copilot paused for: langchain's HumanInTheLoopMiddleware request, one entry per tool call.
export type ToolApprovalRequest = {
  action_requests: { name: string; args: Record<string, unknown>; description?: string }[];
  review_configs: { action_name: string; allowed_decisions: string[] }[];
};

// The admin's choice for one paused tool call; the web gateway rebuilds it and signs the grant.
export type ToolDecision =
  { type: 'approve' } | { type: 'edit'; args: Record<string, unknown> } | { type: 'reject'; note?: string };
