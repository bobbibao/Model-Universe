"""Application-level errors. Interfaces translate them to HTTP status codes."""


class ApplicationError(Exception):
    pass


class NotFoundError(ApplicationError):
    pass


class UnauthorizedError(ApplicationError):
    pass


class ConflictError(ApplicationError):
    pass


class ValidationFailed(ApplicationError):
    pass
