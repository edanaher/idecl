from enum import Enum, unique
from functools import wraps
from flask import abort, current_app
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
    # This is hacky... possibly CLONEPROJECT with a parameter indicating type
    # of clone once generalized cloning is available?
    # Response: Yep - this will be an action.
    CLONEPROJECTASASSIGNMENT = 18
    COMPAREPROJECT = 19

    LISTUSERS = 8
    VIEWUSER = 12
    ADDUSER = 9
    DEACTIVATEUSER = 10
    REACTIVATEUSER = 11
    ADDUSERROLE = 13
    DELETEUSERROLE = 14
    SUDO = 6

    ADDPROJECTTAG = 16
    DELETEPROJECTTAG = 17

    ACTION = 20


STUDENT_PERMISSIONS = [
    (Permissions.GETCLASSROOM, None, None),
    (Permissions.LISTPROJECT, "published", None),
    (Permissions.CLONEPROJECTASASSIGNMENT, "published", None),
    (Permissions.LISTPROJECT, "owner", "${user.id}"),
    (Permissions.VIEWPROJECT, "owner", "${user.id}"),
    (Permissions.EDITPROJECT, "owner", "${user.id}"),
    (Permissions.ADDPROJECTTAG, "owner", "${user.id}"),
    (Permissions.DELETEPROJECTTAG, "owner", "${user.id}")
]

STUDENT_ACTIONS = [
   (0, None, None),
]


with engine.connect() as conn:
    conn.execute(text("DELETE FROM roles_permissions"))
    conn.execute(text("INSERT INTO roles_permissions (role_id, permission_id) VALUES ((SELECT id FROM roles WHERE name='teacher'), :permission) ON CONFLICT DO NOTHING"), [{"permission": p.value} for _, p in Permissions.__members__.items() if p != Permissions.ACTION])
    conn.execute(text("INSERT INTO roles_permissions (role_id, permission_id, detail) VALUES ((SELECT id FROM roles WHERE name='teacher'), :permission, :action) ON CONFLICT DO NOTHING"), [{"permission": Permissions.ACTION.value, "action": a} for a in range(3)])
    conn.execute(text("INSERT INTO roles_permissions (role_id, permission_id, tag_id, tag_value) VALUES ((SELECT id FROM roles WHERE name='student'), :permission, (SELECT id FROM tags WHERE name=:tag), :tag_value) ON CONFLICT DO NOTHING"), [{"permission": p.value, "tag": t, "tag_value": tv} for (p, t, tv) in STUDENT_PERMISSIONS])
    conn.execute(text("INSERT INTO roles_permissions (role_id, permission_id, detail) VALUES ((SELECT id FROM roles WHERE name='student'), :permission, :action) ON CONFLICT DO NOTHING"), [{"permission": Permissions.ACTION.value, "action": a} for a in [0]])
    conn.commit()

# TODO: Right now, a tag on a role means the project or class in question has
# to have the tag.  Should it be more precise?  And what about requiring
# multiple tags?
def has_permission(perm, classroom_id = None, project_id = None, detail = None):
    with engine.connect() as conn:
        classroom_constraint = "users_roles.classroom_id = " + str(classroom_id) if classroom_id else "FALSE"
        project_constraint = "users_roles.project_id = " + str(project_id) if project_id else "FALSE"

        print(f"Checking {classroom_id}, {project_id}, {detail}", flush=True)
        valid = conn.execute(text("""
            select *
            from users_roles
            join roles_permissions on users_roles.role_id = roles_permissions.role_id
                                   and (users_roles.classroom_id is null or users_roles.classroom_id = :classroom)
                                   and (users_roles.project_id is null or users_roles.project_id = :project)
                                   and (roles_permissions.detail is null or roles_permissions.detail = :detail)
            left join projects_tags on (roles_permissions.tag_id = projects_tags.tag_id and projects_tags.project_id=:project)
                                    and (roles_permissions.tag_value is null or replace(roles_permissions.tag_value, '${user.id}', :uid) = projects_tags.value)
            left join classrooms_tags on (roles_permissions.tag_id = classrooms_tags.tag_id and classrooms_tags.classroom_id=:classroom)
                                    and (roles_permissions.tag_value is null or replace(roles_permissions.tag_value, '${user.id}', :uid) = classrooms_tags.value)
            WHERE users_roles.user_id=:uid AND permission_id = :perm
            AND (roles_permissions.tag_id IS NULL OR
                 classrooms_tags.id IS NOT NULL OR
                 projects_tags.id IS NOT NULL)
        """), [{"uid": current_user.euid, "perm": perm.value, "classroom":classroom_id, "project":project_id, "detail": detail}]).first()
    print("Valid is ", repr(valid), flush=True)
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

            action = None
            if perm == Permissions.ACTION:
                if "aid" in kwargs:
                    action = kwargs["aid"]

            if not has_permission(perm, classroom, project, action):
                abort(401, "You are not authorized to view this page.")
            return func(*args, **kwargs)

        return decorate_view
    return inner

