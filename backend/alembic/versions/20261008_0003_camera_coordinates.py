"""camera coordinates: per-camera mounting point, seed locations snapped to roads

Adds cameras.latitude/longitude (NULL = the location's point). Seeded demo
locations whose coordinates still equal the original approximate values are
moved onto real road nodes (OpenStreetMap), and their cameras get mounting
points: the first camera (by code) at the junction, the second ~35 m along
the main road. Rows edited by an administrator are left untouched.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-08 21:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (old point, road point, second mounting point)
SNAPPED: tuple[tuple[tuple[float, float], tuple[float, float], tuple[float, float]], ...] = (
    ((41.3160, 69.2790), (41.316688, 69.280849), (41.316378, 69.280779)),
    ((41.3640, 69.2870), (41.364547, 69.287173), (41.364273, 69.287378)),
    ((41.3420, 69.2850), (41.339736, 69.285529), (41.340047, 69.285587)),
    ((41.3260, 69.3290), (41.326208, 69.329102), (41.326152, 69.328690)),
    ((41.3200, 69.3300), (41.314766, 69.328560), (41.314637, 69.328941)),
    ((41.3460, 69.3600), (41.342947, 69.365114), (41.343142, 69.364786)),
    ((41.2990, 69.2700), (41.298762, 69.273186), (41.298517, 69.273449)),
    ((41.2960, 69.2800), (41.294966, 69.283241), (41.294765, 69.282918)),
    ((41.2920, 69.2880), (41.292643, 69.287594), (41.292845, 69.287915)),
    ((41.2850, 69.2550), (41.285299, 69.253756), (41.285542, 69.254023)),
    ((41.2770, 69.2500), (41.278864, 69.249149), (41.278756, 69.248756)),
    ((41.2750, 69.2040), (41.274755, 69.204515), (41.274961, 69.204199)),
    ((41.2930, 69.2230), (41.292431, 69.222919), (41.292226, 69.223237)),
    ((41.2860, 69.2250), (41.291630, 69.223810), (41.291428, 69.224132)),
    ((41.3260, 69.2360), (41.322408, 69.236440), (41.322327, 69.236842)),
    ((41.3150, 69.2500), (41.311451, 69.253278), (41.311468, 69.252860)),
    ((41.3165, 69.2675), (41.315937, 69.270374), (41.315640, 69.270239)),
    ((41.3450, 69.2110), (41.345070, 69.207056), (41.345245, 69.206710)),
    ((41.3550, 69.2200), (41.355450, 69.219423), (41.355613, 69.219065)),
    ((41.3410, 69.2280), (41.340274, 69.228559), (41.340121, 69.228193)),
    ((41.2950, 69.1800), (41.291914, 69.179054), (41.291760, 69.179176)),
    ((41.2880, 69.1720), (41.287996, 69.172006), (41.287701, 69.171862)),
    ((41.2890, 69.3550), (41.290911, 69.357700), (41.290657, 69.357946)),
    ((41.2900, 69.3300), (41.293754, 69.336258), (41.293515, 69.336508)),
    ((41.2270, 69.2190), (41.226962, 69.219665), (41.227247, 69.219487)),
    ((41.2180, 69.2350), (41.217378, 69.234140), (41.217101, 69.234340)),
    ((41.2090, 69.3340), (41.209056, 69.333582), (41.209369, 69.333624)),
    ((41.2200, 69.3200), (41.223988, 69.319943), (41.224204, 69.320227)),
    ((41.2050, 69.1900), (41.206494, 69.191925), (41.206236, 69.192164)),
    ((41.2350, 69.1700), (41.235872, 69.164736), (41.236092, 69.165034)),
)


def _near(lat: str, lng: str) -> str:
    # Float parameters arrive as inexact decimals, so compare within a micro-degree.
    return f'abs(latitude - :{lat}) < 0.000001 AND abs(longitude - :{lng}) < 0.000001'


def upgrade() -> None:
    op.add_column('cameras', sa.Column('latitude', sa.Numeric(precision=9, scale=6), nullable=True))
    op.add_column('cameras', sa.Column('longitude', sa.Numeric(precision=9, scale=6), nullable=True))

    bind = op.get_bind()
    for (old_lat, old_lng), (lat, lng), (alt_lat, alt_lng) in SNAPPED:
        location_ids = bind.execute(
            sa.text(
                'UPDATE locations SET latitude = :lat, longitude = :lng '
                f'WHERE {_near("old_lat", "old_lng")} RETURNING id'
            ),
            {'lat': lat, 'lng': lng, 'old_lat': old_lat, 'old_lng': old_lng},
        ).scalars().all()
        for location_id in location_ids:
            camera_ids = bind.execute(
                sa.text(
                    'SELECT id FROM cameras WHERE location_id = :id AND latitude IS NULL '
                    'ORDER BY code LIMIT 2'
                ),
                {'id': location_id},
            ).scalars().all()
            for camera_id, (cam_lat, cam_lng) in zip(camera_ids, ((lat, lng), (alt_lat, alt_lng)), strict=False):
                bind.execute(
                    sa.text('UPDATE cameras SET latitude = :lat, longitude = :lng WHERE id = :id'),
                    {'lat': cam_lat, 'lng': cam_lng, 'id': camera_id},
                )


def downgrade() -> None:
    bind = op.get_bind()
    for (old_lat, old_lng), (lat, lng), _ in SNAPPED:
        bind.execute(
            sa.text(
                'UPDATE locations SET latitude = :old_lat, longitude = :old_lng '
                f'WHERE {_near("lat", "lng")}'
            ),
            {'lat': lat, 'lng': lng, 'old_lat': old_lat, 'old_lng': old_lng},
        )
    op.drop_column('cameras', 'longitude')
    op.drop_column('cameras', 'latitude')
