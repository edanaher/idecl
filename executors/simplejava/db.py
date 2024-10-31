from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, BLOB, ForeignKey, UniqueConstraint
import os

engine = create_engine("sqlite+pysqlite:///" + os.environ.get("HOME") + "/idecl.db")
metadata_obj = MetaData()

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
    Column("owner", Integer, ForeignKey("users.id"), nullable=False),
    Column("name", String),
    UniqueConstraint("owner", "name", name="uniq_project_owner_name")
)

files_table = Table(
    "files",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id"), nullable=False),
    Column("name", String),
    Column("contents", BLOB),
    UniqueConstraint("project_id", "name", name="uniq_file_project_name")
)
