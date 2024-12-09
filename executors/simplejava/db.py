from sqlalchemy import create_engine, MetaData, Table, Column, Boolean, Integer, String, BLOB, CheckConstraint, ForeignKey, UniqueConstraint
import os

engine = create_engine("sqlite+pysqlite:///" + os.environ.get("HOME") + "/idecl.db")
metadata_obj = MetaData()

classrooms_table = Table(
    "classrooms",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("name", String, unique=True, nullable=False)
)

users_roles_table = Table(
    "users_roles",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", name="fk_users_roles_user_id"), nullable=False),
    Column("classroom_id", Integer, ForeignKey("classrooms.id", name="fk_users_roles_classroom_id"), nullable=True),
    Column("project_id", Integer, ForeignKey("classrooms.id", name="fk_users_roles_classroom_id"), nullable=True),
    Column("role_id", Integer, ForeignKey("roles.id", name="fk_users_roles_role_id"), nullable=False),
    UniqueConstraint("user_id", "classroom_id", "project_id", "role_id", name="uniq_users_roles_user_classroom_project_role"),
    CheckConstraint("classroom_id IS NULL OR project_id IS NULL", name="check_user_roles_classroom_nand_project")
)

roles_table = Table(
    "roles",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("name", String, unique=True, nullable=False)
)

user_table = Table(
    "users",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("email", String, unique=True, nullable=False),
    Column("name", String),
    Column("deactivated", String)
)

projects_table = Table(
    "projects",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("classroom_id", Integer, ForeignKey("classrooms.id", name="fk_projects_classroom_if"), nullable=False),
    Column("owner", Integer, ForeignKey("users.id", name="fk_projects_owner"), nullable=False),
    Column("name", String),
    Column("parent_id", Integer, ForeignKey("projects.id", name="fk_projects_parent_id")),
    UniqueConstraint("classroom_id", "name", name="uniq_project_classroom_name")
)

files_table = Table(
    "files",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id", name="fk_files_project_id"), nullable=False),
    Column("file_id", Integer, nullable=True), # TODO: make not nullable after migration.
    Column("name", String),
    Column("contents", BLOB),
    Column("parent_file_id", Integer, ForeignKey("files.id", name="fk_files_parent_file_id")),
    Column("readonly", Boolean),
    Column("inherited", Boolean),
    Column("hidden", Boolean),
    UniqueConstraint("project_id", "name", name="uniq_file_project_name"),
    UniqueConstraint("project_id", "file_id", name="uniq_file_project_file_id")
)
