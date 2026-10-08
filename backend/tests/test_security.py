import pytest

from app.core.security import BCRYPT_MAX_BYTES, hash_password, verify_password

FAST_ROUNDS = 4


def test_hash_and_verify_roundtrip() -> None:
    hashed = hash_password("Correct-Horse-Battery-1", rounds=FAST_ROUNDS)

    assert hashed.startswith("$2")
    assert hashed != "Correct-Horse-Battery-1"
    assert verify_password("Correct-Horse-Battery-1", hashed)
    assert not verify_password("correct-horse-battery-1", hashed)


def test_hashes_are_salted() -> None:
    assert hash_password("same-password-123", rounds=FAST_ROUNDS) != hash_password(
        "same-password-123", rounds=FAST_ROUNDS
    )


def test_unicode_password_roundtrip() -> None:
    hashed = hash_password("Parol‘ — xavfsiz №1", rounds=FAST_ROUNDS)
    assert verify_password("Parol‘ — xavfsiz №1", hashed)


@pytest.mark.parametrize("password", ["", "x" * (BCRYPT_MAX_BYTES + 1)])
def test_hash_rejects_empty_and_too_long(password: str) -> None:
    with pytest.raises(ValueError, match="Password"):
        hash_password(password, rounds=FAST_ROUNDS)


def test_verify_rejects_too_long_and_malformed_hash() -> None:
    hashed = hash_password("valid-password-1", rounds=FAST_ROUNDS)

    assert not verify_password("x" * (BCRYPT_MAX_BYTES + 1), hashed)
    assert not verify_password("", hashed)
    assert not verify_password("valid-password-1", "not-a-bcrypt-hash")
