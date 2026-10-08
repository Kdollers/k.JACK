"""Per-request context: the open company database, the signed-in user and permissions."""

from .auth import permissions_for
from .errors import PermissionDenied
from . import audit
from .config import DEFAULT_LANGUAGE


class Context:
    def __init__(self, app, company_slug, db, user):
        self.app = app
        self.company_slug = company_slug
        self.db = db
        self.user = user
        self.permissions = permissions_for(user["role"])
        self.lang = user.get("language") or DEFAULT_LANGUAGE

    @property
    def user_id(self):
        return self.user["id"]

    @property
    def username(self):
        return self.user["username"]

    def require(self, permission):
        if permission not in self.permissions:
            raise PermissionDenied("permission_denied", permission=permission)

    def has(self, permission):
        return permission in self.permissions

    def audit(self, action, module, record_type=None, record_id=None,
              old_value=None, new_value=None, details=None):
        return audit.record(
            self.db,
            user_id=self.user_id,
            username=self.username,
            action=action,
            module=module,
            record_type=record_type,
            record_id=record_id,
            old_value=old_value,
            new_value=new_value,
            details=details,
        )
