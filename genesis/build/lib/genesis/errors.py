"""Application error types. Every error carries a translation key and params."""


class GenesisError(Exception):
    """Base error. ``key`` is a translation key; ``params`` fill its placeholders."""

    status = 400

    def __init__(self, key, **params):
        super().__init__(key)
        self.key = key
        self.params = params


class ValidationError(GenesisError):
    status = 422


class AccountingError(ValidationError):
    """Raised when an accounting rule (balance, period lock, posting rule) is broken."""


class PermissionDenied(GenesisError):
    status = 403


class AuthenticationError(GenesisError):
    status = 401


class NotFound(GenesisError):
    status = 404


class MethodNotAllowed(GenesisError):
    status = 405


class Conflict(GenesisError):
    status = 409
