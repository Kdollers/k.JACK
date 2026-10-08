"""Append-only audit trail. Rows are protected by database triggers."""

import json

from .timeutil import now_iso


def record(db, *, user_id, username, action, module, record_type=None, record_id=None,
           old_value=None, new_value=None, details=None):
    def encode(value):
        if value is None:
            return None
        return json.dumps(value, sort_keys=True, default=str, ensure_ascii=False)

    return db.insert("audit_log", {
        "created_at": now_iso(),
        "user_id": user_id,
        "username": username,
        "action": action,
        "module": module,
        "record_type": record_type,
        "record_id": None if record_id is None else str(record_id),
        "old_value": encode(old_value),
        "new_value": encode(new_value),
        "details": details,
    })
