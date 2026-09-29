// CI Console data, as returned by /api/admin/ci/* (mapped from the agent service by CiConsoleService).
// Free-form dictionaries from the agent are lists of { name, value } so that their original keys survive the
// client's camelCase conversion (option params are sent back unchanged as decision overrides).

export type CiImprovementStatus =
  | 'detected'
  | 'investigating'
  | 'awaiting_human'
  | 'approved'
  | 'planned'
  | 'acting'
  | 'act_failed'
  | 'acted'
  | 'measuring'
  | 'rejected'
  | 'expired'
  | 'dismissed'
  | 'learning'
  | 'closed';

export type CiImprovementGroup = 'pending' | 'active' | 'closed';

export type CiParam = { name: string; value: unknown };

export type CiOption = {
  optionId: string;
  strategy: string;
  title: string;
  params: CiParam[];
  estRecoveryValue: number;
  estCost: number;
  estWasteReduction: number;
  risk: string;
};

export type CiImprovementSummary = {
  id: string;
  status: CiImprovementStatus;
  phase: string;
  signalKind: string;
  summary: string;
  severity: string;
  createdAt: string;
  updatedAt: string;
  options: CiOption[];
  questionId: string | null;
};

export type CiQuestion = {
  id: string;
  prompt: string;
  context: string;
  status: 'open' | 'answered' | 'expired';
  attempt: number;
  createdAt: string;
  expiresAt: string;
  recommendedOptionId: string | null;
};

export type CiAnswer = {
  questionId: string;
  decision: 'approve' | 'reject' | 'clarify';
  answeredBy: string;
  channel: string;
  answeredAt: string;
  optionId: string | null;
  note: string | null;
};

export type CiKpiDelta = {
  name: string;
  baseline: number;
  current: number;
  deltaPct: number;
  improved: boolean;
  improvementPct: number;
};

export type CiImprovementDetail = CiImprovementSummary & {
  subjectSkus: string[];
  metrics: CiParam[];
  finding: {
    summary: string;
    causes: { description: string; confidence: number }[];
    sopRefs: string[];
    similarCaseIds: string[];
    actionable: boolean;
    confidence: number;
  } | null;
  question: CiQuestion | null;
  answers: CiAnswer[];
  history: { status: CiImprovementStatus; at: string; note: string }[];
  plan: {
    strategy: string;
    planHash: string;
    estimatedCost: number;
    evaluateAfterDays: number;
    actions: { type: string; params: CiParam[]; description: string }[];
  } | null;
  actionRecords: { step: number; type: string; status: string; detail: string; executedAt: string | null }[];
  measureDueAt: string | null;
  measurement: { verdict: string; summary: string; measuredAt: string; deltas: CiKpiDelta[] } | null;
  caseId: string | null;
};

export type CiDecisionPayload = {
  decision: 'approve' | 'reject' | 'clarify';
  optionId?: string;
  // Keyed by the option's original parameter names; only numeric parameters can be overridden in the UI.
  overrides?: Record<string, number>;
  note?: string;
};

export type CiRunReport = { detected: number; expired: number; advanced: number; errors: number };

export type CiNotification = {
  id: number;
  notificationId: string;
  improvementId: string;
  kind: string;
  title: string;
  body: string;
  severity: string;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
};

export type CiNotificationList = { items: CiNotification[]; unread: number };

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

export type CiVerdict = 'success' | 'inconclusive' | 'negative';

// One measured, closed improvement on the KPI impact page.
export type CiImpactItem = {
  improvementId: string;
  signalKind: string;
  signalSummary: string;
  strategy: string | null;
  autoApproved: boolean;
  measuredAt: string;
  verdict: CiVerdict;
  summary: string;
  deltas: CiKpiDelta[];
};

// How a case ended: approved and measured, approved but the action failed, or never acted on.
export type CiCaseOutcome = 'approved' | 'failed' | 'rejected' | 'expired' | 'dismissed';

export type CiCase = {
  id: string;
  improvementId: string;
  signalKind: string;
  situation: string;
  optionsConsidered: string[];
  decision: string;
  outcome: CiCaseOutcome;
  strategy: string | null;
  outcomeVerdict: CiVerdict | null;
  // KPI name -> improvement % (positive = better); entries keep the agent's KPI names.
  kpiSummary: CiParam[];
  lessons: string[];
  createdAt: string;
};
