"""violation events: vehicle country, type description, duplicate folding

Adds the columns needed by the event-centric violations module:
vehicles.country, violation_types.description, violations.duplicate_count
(repeated AI reports of one event are folded into the original row) and the
index used by the duplicate lookup.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-08 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('vehicles', sa.Column('country', sa.String(length=2), server_default='UZ', nullable=False))
    op.add_column('violation_types', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('violations', sa.Column('duplicate_count', sa.Integer(), server_default='0', nullable=False))
    op.create_check_constraint(op.f('ck_violations_duplicate_count_positive'), 'violations', 'duplicate_count >= 0')
    op.create_index(
        'ix_violations_dedup',
        'violations',
        ['camera_id', 'violation_type_id', 'plate_number', sa.literal_column('occurred_at DESC')],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_violations_dedup', table_name='violations')
    op.drop_constraint(op.f('ck_violations_duplicate_count_positive'), 'violations', type_='check')
    op.drop_column('violations', 'duplicate_count')
    op.drop_column('violation_types', 'description')
    op.drop_column('vehicles', 'country')
