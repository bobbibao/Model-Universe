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

// Unit of a KPI; baseline and current of a 'vnd' KPI are amounts in VND.
export type CiKpiUnit = 'vnd' | 'percent' | 'days' | 'number';

export type CiKpiDelta = {
  name: string;
  unit: CiKpiUnit;
  baseline: number;
  current: number;
  deltaPct: number;
  improved: boolean;
  improvementPct: number;
};

/** A cause written by the LLM reasoner ('ai') or by the agent's rules ('rules'). */
export type CiCause = { description: string; confidence: number; source: 'ai' | 'rules' };

export type CiImprovementDetail = CiImprovementSummary & {
  subjectSkus: string[];
  metrics: CiParam[];
  finding: {
    summary: string;
    causes: CiCause[];
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

export type CiRunTrigger = 'manual' | 'scheduler';

/** A run in progress: `done` of `total` improvements advanced so far (`total` is null until detection ends). */
export type CiRunProgress = { trigger: CiRunTrigger; startedAt: string; done: number; total: number | null };

export type CiLastRun = {
  trigger: CiRunTrigger;
  startedAt: string;
  finishedAt: string;
  seconds: number;
  error: string | null;
  detected?: number;
  advanced?: number;
  errors?: number;
};

export type CiRunStatus = {
  running: CiRunProgress | null;
  lastRun: CiLastRun | null;
  scheduler: { enabled: boolean; intervalSeconds?: number; nextRunAt?: string };
  /** Demo-only agent settings (DEMO_MEASURE_AFTER_MINUTES); never set in production. */
  demo: { measureAfterMinutes: number | null };
};

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
