"""Add detail column for permissions

Revision ID: 24aba5776eb2
Revises: 533e2439a022
Create Date: 2025-02-24 21:15:48.492188

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '24aba5776eb2'
down_revision: Union[str, None] = '533e2439a022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('roles_permissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('detail', sa.Integer(), nullable=True))

    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('roles_permissions', schema=None) as batch_op:
        batch_op.drop_column('detail')

    # ### end Alembic commands ###
