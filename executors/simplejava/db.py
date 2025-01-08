from sqlalchemy import create_engine, MetaData, Table, Column, Boolean, Integer, String, BLOB, CheckConstraint, ForeignKey, UniqueConstraint
import os

engine = create_engine("sqlite+pysqlite:///" + os.environ.get("HOME") + "/idecl.db")
def _pragmas_on_connect(dbapi_con, con_record):
    dbapi_con.execute('pragma foreign_keys=ON')
    dbapi_con.execute('pragma journal_mode=WAL')

from sqlalchemy import event
event.listen(engine, 'connect', _pragmas_on_connect)

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
    Column("project_id", Integer, ForeignKey("projects.id", name="fk_users_roles_project_id"), nullable=True),
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

roles_permissions = Table(
    "roles_permissions",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", name="fk_roles_permissions_role_id"), nullable=False),
    Column("permission_id", Integer, nullable=False), # Implicit "table" in app
    Column("tag_id", Integer, ForeignKey("tags.id", name="fk_users_roles_tag_id"), nullable=True),
    UniqueConstraint("role_id", "permission_id", "tag_id", name="uniq_roles_permissions_role_id_permission_id_tag_id")
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
    Column("cloned_as_assignment", Boolean), # TODO: There should be a cleaner and more generic way to handle this.
    UniqueConstraint("classroom_id", "name", name="uniq_project_classroom_name")
)

tags_table = Table(
    "tags",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("name", String, nullable=False),
    UniqueConstraint("name", name="uniq_tags_name")
)

classrooms_tags = Table(
    "classrooms_tags",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("classroom_id", Integer, ForeignKey("classrooms.id", name="fk_classrooms_tags_classroom_id"), nullable=False),
    Column("tag_id", Integer, ForeignKey("tags.id", name="fk_classrooms_tags_tag_id"), nullable=False),
    UniqueConstraint("classroom_id", "tag_id", name="uniq_classroomclassroomss_tago_classroom_id_tag_id")
)

projects_tags = Table(
    "projects_tags",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id", name="fk_projects_tags_project_id"), nullable=False),
    Column("tag_id", Integer, ForeignKey("tags.id", name="fk_projects_tags_tag_id"), nullable=False),
    UniqueConstraint("project_id", "tag_id", name="uniq_projects_tags_project_id_tag_id")
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

cached_classes = Table(
    "cached_classes",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("sha256", String),
    Column("tarball", BLOB),
    UniqueConstraint("sha256", name="uniq_cached_classes_sha256"),
)

comments = Table(
    "comments",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer),
    Column("contents", String),
    Column("created", Integer),
)
