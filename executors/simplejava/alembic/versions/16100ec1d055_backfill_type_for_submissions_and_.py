"""Backfill type for submissions and projects

Revision ID: 16100ec1d055
Revises: 98fad63597ce
Create Date: 2025-02-26 17:04:30.848442

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '16100ec1d055'
down_revision: Union[str, None] = '98fad63597ce'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        INSERT INTO projects_tags
           (project_id, tag_id, value, created)
        SELECT projects.id,
               (SELECT id FROM tags WHERE name='type'),
               'submission',
               unixepoch('now')
        FROM projects LEFT JOIN projects_tags ON
                projects.id = projects_tags.project_id
            AND projects_tags.tag_id = (SELECT id FROM tags WHERE name='type')
        WHERE projects_tags.id IS NULL
          AND cloned_as_assignment=TRUE
    """))
    op.execute(sa.text("""
        INSERT INTO projects_tags
           (project_id, tag_id, value, created)
        SELECT projects.id,
               (SELECT id FROM tags WHERE name='type'),
               'assignment',
               unixepoch('now')
        FROM projects LEFT JOIN projects_tags ON
                projects.id = projects_tags.project_id
            AND projects_tags.tag_id = (SELECT id FROM tags WHERE name='type')
        WHERE projects_tags.id IS NULL
    """))
    pass


def downgrade() -> None:
    pass
