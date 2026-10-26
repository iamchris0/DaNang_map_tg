import time
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qsl, urlencode

import jwt
import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.core.security import (
    InitDataError,
    create_access_token,
    decode_access_token,
    verify_init_data,
)
from tests.conftest import TEST_BOT_TOKEN
from tests.factories import sign_init_data

USER = {
    "id": 42,
    "first_name": "Linh",
    "last_name": "Tran",
    "username": "linh",
    "language_code": "ru",
}
DAY = 86_400


def _reason(init_data: str, bot_token: str = TEST_BOT_TOKEN) -> str:
    with pytest.raises(InitDataError) as exc_info:
        verify_init_data(init_data, bot_token, DAY)
    return exc_info.value.reason


def test_valid_init_data() -> None:
    result = verify_init_data(
        sign_init_data(TEST_BOT_TOKEN, USER, start_param="abc-123"), TEST_BOT_TOKEN, DAY
    )
    assert result.user.id == 42
    assert result.user.username == "linh"
    assert result.user.display_name == "Linh Tran"
    assert result.user.language_code == "ru"
    assert result.start_param == "abc-123"


def test_signature_field_is_part_of_check_string() -> None:
    # Bot API 8.0+ also sends `signature`; it must be covered by the hash, not stripped.
    init_data = sign_init_data(TEST_BOT_TOKEN, USER, signature="ed25519sig")
    assert verify_init_data(init_data, TEST_BOT_TOKEN, DAY).user.id == 42


def test_tampered_field_rejected() -> None:
    fields = dict(parse_qsl(sign_init_data(TEST_BOT_TOKEN, USER)))
    fields["user"] = fields["user"].replace('"id":42', '"id":1001')
    assert _reason(urlencode(fields)) == "invalid_signature"


def test_wrong_bot_token_rejected() -> None:
    other = "987654321:another-bots-token-abcdefghijklmnopq"
    assert _reason(sign_init_data(other, USER)) == "invalid_signature"


def test_missing_hash_rejected() -> None:
    fields = dict(parse_qsl(sign_init_data(TEST_BOT_TOKEN, USER)))
    del fields["hash"]
    assert _reason(urlencode(fields)) == "missing_hash"


def test_expired_rejected() -> None:
    old = int(time.time()) - DAY - 60
    assert _reason(sign_init_data(TEST_BOT_TOKEN, USER, auth_date=old)) == "expired"


def test_future_auth_date_rejected() -> None:
    future = int(time.time()) + 3600
    assert _reason(sign_init_data(TEST_BOT_TOKEN, USER, auth_date=future)) == "invalid_auth_date"


def test_small_clock_skew_tolerated() -> None:
    soon = int(time.time()) + 30
    assert verify_init_data(
        sign_init_data(TEST_BOT_TOKEN, USER, auth_date=soon), TEST_BOT_TOKEN, DAY
    )


def test_missing_user_rejected() -> None:
    assert _reason(sign_init_data(TEST_BOT_TOKEN, None)) == "missing_user"


@pytest.mark.parametrize("raw", ["no-equals-sign", "hash=a&hash=b"])
def test_malformed_rejected(raw: str) -> None:
    assert _reason(raw) == "malformed"


def test_empty_rejected() -> None:
    assert _reason("") == "missing_hash"


def test_unconfigured_bot_token_rejects_everything() -> None:
    assert _reason(sign_init_data("", USER), bot_token="") == "bot_token_not_configured"


def _settings(**kwargs: object) -> Settings:
    return Settings(
        _env_file=None,
        session_secret=SecretStr("s" * 40),
        **kwargs,  # type: ignore[arg-type]
    )


def test_access_token_roundtrip() -> None:
    settings = _settings()
    user_id = uuid.uuid4()
    token = create_access_token(settings, user_id)
    assert decode_access_token(settings, token.token) == user_id
    assert token.expires_at > datetime.now(UTC)


def test_access_token_wrong_secret() -> None:
    token = create_access_token(_settings(), uuid.uuid4())
    other = Settings(_env_file=None, session_secret=SecretStr("x" * 40))
    assert decode_access_token(other, token.token) is None


def test_access_token_expired() -> None:
    settings = _settings()
    past = datetime.now(UTC) - timedelta(hours=1)
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "iat": past,
            "exp": past + timedelta(minutes=1),
            "typ": "access",
        },
        "s" * 40,
        algorithm="HS256",
    )
    assert decode_access_token(settings, token) is None


@pytest.mark.parametrize(
    "payload",
    [
        {"sub": "not-a-uuid", "typ": "access"},
        {"sub": str(uuid.uuid4()), "typ": "refresh"},
        {"typ": "access"},
    ],
)
def test_access_token_bad_claims(payload: dict[str, str]) -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {**payload, "iat": now, "exp": now + timedelta(hours=1)}, "s" * 40, algorithm="HS256"
    )
    assert decode_access_token(_settings(), token) is None


def test_none_algorithm_rejected() -> None:
    token = jwt.encode({"sub": str(uuid.uuid4()), "typ": "access"}, None, algorithm="none")
    assert decode_access_token(_settings(), token) is None
