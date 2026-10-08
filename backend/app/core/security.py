import bcrypt

# bcrypt only uses the first 72 bytes of input; longer passwords are rejected outright
# instead of being silently truncated.
BCRYPT_MAX_BYTES = 72
DEFAULT_BCRYPT_ROUNDS = 12


def hash_password(password: str, *, rounds: int = DEFAULT_BCRYPT_ROUNDS) -> str:
    encoded = password.encode("utf-8")
    if not encoded:
        raise ValueError("Password must not be empty")
    if len(encoded) > BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")
    return bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=rounds)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    encoded = password.encode("utf-8")
    if not encoded or len(encoded) > BCRYPT_MAX_BYTES:
        return False
    try:
        return bcrypt.checkpw(encoded, password_hash.encode("ascii"))
    except ValueError:
        return False
