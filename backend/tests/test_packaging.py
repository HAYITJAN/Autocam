from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_REQUIREMENTS = BACKEND_DIR.parent / "requirements.txt"


def _requirements(path: Path) -> list[str]:
    lines = (line.strip() for line in path.read_text(encoding="utf-8").splitlines())
    return [line for line in lines if line and not line.startswith("#")]


@pytest.mark.skipif(not ROOT_REQUIREMENTS.exists(), reason="repository root not available")
def test_vercel_requirements_match_backend() -> None:
    assert _requirements(ROOT_REQUIREMENTS) == _requirements(BACKEND_DIR / "requirements.txt")
