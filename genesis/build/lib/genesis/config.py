"""Static configuration values and default locations."""

import os
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent

# Company databases, the registry and backups. Override with --data-dir or GENESIS_DATA_DIR.
DATA_DIR = Path(os.environ.get("GENESIS_DATA_DIR") or (Path.cwd() / "data"))
WEB_ROOT = PACKAGE_DIR / "web"
REGISTRY_FILENAME = "genesis_registry.db"
COMPANIES_SUBDIR = "companies"
DEFAULT_BACKUP_SUBDIR = "backups"

# Quantities are stored as integers scaled by 10^4 (four decimal places).
QTY_SCALE = 10_000
QTY_DECIMALS = 4
# Percentages and tax rates are stored as basis points (10000 = 100%).
BPS = 10_000

SESSION_TTL_SECONDS = 8 * 60 * 60
MIN_PASSWORD_LENGTH = 8
PBKDF2_ITERATIONS = 310_000

SUPPORTED_LANGUAGES = ("en", "fr", "rw")
DEFAULT_LANGUAGE = "en"

SCHEMA_VERSION = 1
