"""Copy owner column to tag

Revision ID: aa21e01c87cc
Revises: b297700d83a8
Create Date: 2025-02-05 17:17:55.683122

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa21e01c87cc'
down_revision: Union[str, None] = 'b297700d83a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("INSERT OR IGNORE INTO projects_tags (project_id, tag_id, created, value) SELECT id, (SELECT id FROM tags WHERE name='owner'), strftime('%s', 'now'), owner FROM projects"))


def downgrade() -> None:
    pass
