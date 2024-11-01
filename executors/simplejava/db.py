from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, BLOB, ForeignKey, UniqueConstraint
import os

engine = create_engine("sqlite+pysqlite:///" + os.environ.get("HOME") + "/idecl.db")
metadata_obj = MetaData()

classrooms_table = Table(
    "classrooms",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("name", String, unique=True, nullable=False)
)

classrooms_users_join_table = Table(
    "classrooms_users",
    metadata_obj,
    Column("classroom_id", Integer, ForeignKey("classrooms.id", name="fk_classroom_users_classroom_id"), nullable=False),
    Column("user_id", Integer, ForeignKey("users.id", name="fk_classrooms_users_user_id"), nullable=False),
    UniqueConstraint("classroom_id", "user_id", name="uniq_classrooms_users")
)

user_table = Table(
    "users",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("email", String, unique=True, nullable=False),
    Column("name", String)
)

projects_table = Table(
    "projects",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("classroom_id", Integer, ForeignKey("classrooms.id", name="fk_projects_classroom_if"), nullable=False),
    Column("owner", Integer, ForeignKey("users.id", name="fk_projects_owner"), nullable=False),
    Column("name", String),
    UniqueConstraint("classroom_id", "name", name="uniq_project_classroom_name")
)

files_table = Table(
    "files",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id", name="fk_files_project_id"), nullable=False),
    Column("name", String),
    Column("contents", BLOB),
    UniqueConstraint("project_id", "name", name="uniq_file_project_name")
)
