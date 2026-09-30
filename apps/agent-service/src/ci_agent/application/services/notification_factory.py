"""Builds channel-agnostic notifications. Channel adapters render them for Telegram, Zalo, email, web."""
from __future__ import annotations

from datetime import timedelta

from ci_agent.application.ports.system import (
    ClockPort,
    IdGeneratorPort,
    TokenSignerPort,
)
from ci_agent.domain.models.human import AnswerDecision, Directive, Question
from ci_agent.domain.models.improvement import Improvement
from ci_agent.domain.models.money import MoneyFormat
from ci_agent.domain.models.notification import (
    Notification,
    NotificationAction,
    NotificationKind,
    Recipient,
)
from ci_agent.domain.models.signal import SEVERITY_RANK, Severity


def _at_least_medium(severity: Severity) -> Severity:
    return severity if SEVERITY_RANK[severity] >= SEVERITY_RANK[Severity.MEDIUM] else Severity.MEDIUM


class NotificationFactory:
    def __init__(self, clock: ClockPort, ids: IdGeneratorPort, signer: TokenSignerPort,
                 link_ttl_hours: int = 72, money: MoneyFormat | None = None) -> None:
        self._clock, self._ids, self._signer, self._ttl = clock, ids, signer, link_ttl_hours
        self._money = money or MoneyFormat()

    # ---------------------------------------------------------------- helpers
    def _base(self, kind: NotificationKind, imp: Improvement, recipient: Recipient, title: str, body: str,
              severity: Severity, **extra) -> Notification:
        return Notification(id=self._ids.new_id(), kind=kind, improvement_id=imp.id,
                            recipient_id=recipient.user_id, title=title, body=body, severity=severity,
                            created_at=self._clock.now(), link_path=f"/ci/improvements/{imp.id}", **extra)

    def _token(self, question_id: str, recipient: Recipient) -> str:
        expires = int((self._clock.now() + timedelta(hours=self._ttl)).timestamp())
        return self._signer.sign(f"{question_id}|{recipient.user_id}|{expires}")

    # ------------------------------------------------------------- notifications
    def question(self, imp: Improvement, question: Question, recipient: Recipient) -> Notification:
        lines = [imp.signal.summary, "", question.context, "", question.prompt, ""]
        for n, opt in enumerate(question.options, start=1):
            mark = " (recommended)" if opt.option_id == question.recommended_option_id else ""
            lines.append(f"{n}. {opt.title}{mark} - est. recovery {self._money.text(opt.est_recovery_value, ',.0f')}, "
                         f"cost {self._money.text(opt.est_cost, ',.0f')}, risk {opt.risk}")
        lines.append(f"\nPlease answer before {question.expires_at:%Y-%m-%d %H:%M} UTC.")
        actions = [NotificationAction(f"{question.id}:{o.option_id}", f"Approve: {o.title}",
                                      AnswerDecision.APPROVE, o.option_id) for o in question.options]
        actions.append(NotificationAction(f"{question.id}:reject", "Reject", AnswerDecision.REJECT))
        actions.append(NotificationAction(f"{question.id}:clarify", "Need more analysis", AnswerDecision.CLARIFY))
        return self._base(NotificationKind.QUESTION, imp, recipient, f"Decision needed: {imp.signal.kind}",
                          "\n".join(lines), _at_least_medium(imp.signal.severity), actions=tuple(actions),
                          question_id=question.id, link_token=self._token(question.id, recipient))

    def auto_approved(self, imp: Improvement, directive: Directive, recipient: Recipient) -> Notification:
        return self._base(NotificationKind.AUTO_APPROVED, imp, recipient,
                          f"Auto-approved low-risk action: {directive.strategy}",
                          f"{imp.signal.summary}\nThe agent approved '{directive.strategy}' under the "
                          f"low-risk autonomy policy. Parameters: {directive.params}.", Severity.MEDIUM)

    def action_executed(self, imp: Improvement, recipient: Recipient) -> Notification:
        steps = "\n".join(f"- {r.type}: {r.status.value}" for r in imp.action_records)
        return self._base(NotificationKind.ACTION_EXECUTED, imp, recipient,
                          f"Action executed: {imp.plan.strategy if imp.plan else ''}",
                          f"{imp.signal.summary}\n{steps}\nResults will be measured on "
                          f"{imp.measure_due_at:%Y-%m-%d}.", Severity.MEDIUM)

    def action_failed(self, imp: Improvement, recipient: Recipient, error: str) -> Notification:
        return self._base(NotificationKind.ACTION_FAILED, imp, recipient, "Action failed and was rolled back",
                          f"{imp.signal.summary}\nError: {error}\nAttempt {imp.action_attempts}. If attempts remain, "
                          "the agent retries on its next run.", Severity.HIGH)

    def measurement_ready(self, imp: Improvement, recipient: Recipient) -> Notification:
        m = imp.measurement
        return self._base(NotificationKind.MEASUREMENT_READY, imp, recipient,
                          f"Measured result: {m.verdict.value if m else 'n/a'}",
                          f"{imp.signal.summary}\n{m.summary if m else ''}", Severity.MEDIUM)

    def question_expired(self, imp: Improvement, recipient: Recipient) -> Notification:
        return self._base(NotificationKind.QUESTION_EXPIRED, imp, recipient, "Decision request expired",
                          f"{imp.signal.summary}\nNo answer was received in time; the agent closed the request.",
                          Severity.MEDIUM)

    def case_learned(self, imp: Improvement, recipient: Recipient) -> Notification:
        return self._base(NotificationKind.CASE_LEARNED, imp, recipient, "New case added to the knowledge base",
                          f"{imp.signal.summary}\nCase {imp.case_id} stored.", Severity.LOW)
