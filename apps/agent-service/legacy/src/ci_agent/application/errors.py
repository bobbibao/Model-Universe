"""Application-level errors. Interfaces translate them to HTTP status codes."""


class ApplicationError(Exception):
    pass


class NotFoundError(ApplicationError):
    pass


class UnauthorizedError(ApplicationError):
    pass


class ConflictError(ApplicationError):
    pass


class ImprovementBusy(ConflictError):
    """Another run in this process is advancing the same improvement right now; the caller skips it."""


class ValidationFailed(ApplicationError):
    pass
