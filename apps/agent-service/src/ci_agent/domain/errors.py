"""Domain-level errors. The domain raises these; outer layers translate them."""


class DomainError(Exception):
    """Base class for business-rule violations."""


class InvalidTransition(DomainError):
    """A lifecycle transition that the state machine does not allow."""


class IntegrityError(DomainError):
    """Approved content was changed after approval."""


class RuleViolation(DomainError):
    """A business rule or guardrail was violated."""
