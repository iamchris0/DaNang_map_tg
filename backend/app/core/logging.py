import logging
import re

_REDACTIONS = [
    # Telegram bot tokens: "<digits>:<35 url-safe chars>"
    (re.compile(r"\b\d{6,}:[A-Za-z0-9_-]{30,}\b"), "<bot-token>"),
    # Bearer tokens in headers
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+"), r"\1<redacted>"),
    # Signed Telegram initData query strings
    (re.compile(r"(hash=)[0-9a-f]{64}"), r"\1<redacted>"),
]


class RedactingFilter(logging.Filter):
    """Scrubs secrets from log records before they are emitted."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        redacted = message
        for pattern, replacement in _REDACTIONS:
            redacted = pattern.sub(replacement, redacted)
        if redacted != message:
            record.msg = redacted
            record.args = None
        return True


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    handler.addFilter(RedactingFilter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
