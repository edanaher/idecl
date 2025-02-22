"""Add client_errors table

Revision ID: 41340ba3622c
Revises: 47721c54b493
Create Date: 2025-01-29 21:36:45.930300

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '41340ba3622c'
down_revision: Union[str, None] = '47721c54b493'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('client_errors',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('project_id', sa.Integer(), nullable=True),
    sa.Column('user_agent', sa.Integer(), nullable=True),
    sa.Column('error', sa.String(), nullable=True),
    sa.Column('stacktrace', sa.String(), nullable=True),
    sa.Column('data', sa.String(), nullable=True),
    sa.Column('created', sa.Integer(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('client_errors')
    # ### end Alembic commands ###
