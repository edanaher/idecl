from enum import Enum, unique
from functools import wraps
from flask import abort
from flask_login import current_user
from sqlalchemy import text

from db import engine

@unique
class Permissions(Enum):
    GETCLASSROOM = 1
    ADDCLASSROOM = 7
    LISTPROJECT = 2
    ADDPROJECT = 3
    DELETEPROJECT = 4
    VIEWPROJECT = 5
    EDITPROJECT = 15
    SUDO = 6
    LISTUSERS = 8
    ADDUSER = 9
    DEACTIVATEUSER = 10
    REACTIVATEUSER = 11
    VIEWUSER = 12
    ADDUSERROLE = 13
    DELETEUSERROLE = 14


STUDENT_PERMISSIONS = [
    Permissions.GETCLASSROOM,
    Permissions.LISTPROJECT,
    Permissions.VIEWPROJECT
]

with engine.connect() as conn:
    conn.execute(text("INSERT INTO roles_permissions (role_id, permission_id) VALUES ((SELECT id FROM roles WHERE name='teacher'), :permission) ON CONFLICT DO NOTHING"), [{"permission": p.value} for _, p in Permissions.__members__.items()])
    conn.execute(text("INSERT INTO roles_permissions (role_id, permission_id) VALUES ((SELECT id FROM roles WHERE name='student'), :permission) ON CONFLICT DO NOTHING"), [{"permission": p.value} for p in STUDENT_PERMISSIONS])
    conn.commit()


def has_permission(perm, classroom_id = None, project_id = None):
    with engine.connect() as conn:
        classroom_constraint = "users_roles.classroom_id = " + str(classroom_id) if classroom_id else "FALSE"
        project_constraint = "users_roles.project_id = " + project_id if project_id else "FALSE"
        valid = conn.execute(text(f"SELECT roles_permissions.id FROM roles_permissions JOIN users_roles USING (role_id) WHERE user_id=:uid AND permission_id = :perm AND (users_roles.classroom_id IS NULL OR {classroom_constraint}) AND (users_roles.project_id IS NULL OR {project_constraint})"), [{"uid": current_user.euid, "perm": perm.value, }]).first()
    return valid is not None

def requires_permission(perm, checktype = None):
    def inner(func):
        @wraps(func)
        def decorate_view(*args, **kwargs):
            if not current_user.is_authenticated:
                return current_app.login_manager.unauthorized()

            classroom = None
            project = None
            if checktype == "classroom":
                if "classroom" in kwargs:
                    classroom = kwargs["classroom"]
                if "pid" in kwargs:
                    with engine.connect() as conn:
                        classroom = conn.execute(text("SELECT classroom_id FROM projects WHERE id=:pid"), [{"pid": kwargs["pid"]}]).first().classroom_id

            if checktype == "project":
                if "pid" in kwargs:
                    project = kwargs["pid"]
                    with engine.connect() as conn:
                        classroom = conn.execute(text("SELECT classroom_id FROM projects WHERE id=:pid"), [{"pid": kwargs["pid"]}]).first().classroom_id

            if not has_permission(perm, classroom, project):
                abort(401, "You are not authorized to view this page.")
            return func(*args, **kwargs)

        return decorate_view
    return inner

