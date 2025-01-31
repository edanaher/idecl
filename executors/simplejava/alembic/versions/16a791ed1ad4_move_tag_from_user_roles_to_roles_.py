"""move tag from user_roles to roles_permissions

Revision ID: 16a791ed1ad4
Revises: 8fd87c322e6b
Create Date: 2024-12-14 14:07:27.475894

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '16a791ed1ad4'
down_revision: Union[str, None] = '8fd87c322e6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('roles_permissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tag_id', sa.Integer(), nullable=True))
        batch_op.drop_constraint('uniq_roles_permissions_role_id_permission_id', type_='unique')
        batch_op.create_unique_constraint('uniq_roles_permissions_role_id_permission_id_tag_id', ['role_id', 'permission_id', 'tag_id'])
        batch_op.create_foreign_key('fk_users_roles_tag_id', 'tags', ['tag_id'], ['id'])

    with op.batch_alter_table('users_roles', schema=None) as batch_op:
        batch_op.drop_constraint('uniq_users_roles_user_classroom_project_role_tag', type_='unique')
        batch_op.create_unique_constraint('uniq_users_roles_user_classroom_project_role', ['user_id', 'classroom_id', 'project_id', 'role_id'])
        batch_op.drop_constraint('fk_users_roles_tag_id', type_='foreignkey')
        batch_op.drop_column('tag_id')

    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('users_roles', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tag_id', sa.INTEGER(), nullable=True))
        batch_op.create_foreign_key('fk_users_roles_tag_id', 'tags', ['tag_id'], ['id'])
        batch_op.drop_constraint('uniq_users_roles_user_classroom_project_role', type_='unique')
        batch_op.create_unique_constraint('uniq_users_roles_user_classroom_project_role_tag', ['user_id', 'classroom_id', 'project_id', 'role_id', 'tag_id'])

    with op.batch_alter_table('roles_permissions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_roles_tag_id', type_='foreignkey')
        batch_op.drop_constraint('uniq_roles_permissions_role_id_permission_id_tag_id', type_='unique')
        batch_op.create_unique_constraint('uniq_roles_permissions_role_id_permission_id', ['role_id', 'permission_id'])
        batch_op.drop_column('tag_id')

    # ### end Alembic commands ###
