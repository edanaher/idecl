from flask import redirect, render_template, request, send_file, session
from flask_login import login_required, current_user
from sqlalchemy import text

from app import app
from db import engine
from permissions import requires_permission, has_permission, Permissions as P

@app.route("/classrooms")
@login_required
def classrooms():
    with engine.connect() as conn:
        # TODO: Is the distinct really necessary?  The problem is a user can have multiple roles with access to a classroom.
        classrooms = conn.execute(text("SELECT DISTINCT(classrooms.id), classrooms.name FROM classrooms JOIN users_roles ON (classrooms.id=users_roles.classroom_id OR users_roles.classroom_id IS NULL) JOIN roles_permissions USING (role_id) WHERE permission_id=:perm AND user_id=:uid"), [{"uid": current_user.euid, "perm": P.GETCLASSROOM.value}]).all()
    return render_template("classrooms.html", classrooms=classrooms, loggedinas=current_user, canaddclassroom=has_permission(P.ADDCLASSROOM), canmanageusers=has_permission(P.LISTUSERS))

@app.route("/classrooms", methods=["POST"])
@requires_permission(P.ADDCLASSROOM)
def newclassroom():
    formdata = request.form
    with engine.connect() as conn:
        classroom = conn.execute(text("INSERT INTO classrooms (name) VALUES (:name) RETURNING id"), [{"name": formdata["name"]}]).first()
        conn.execute(text("INSERT INTO users_roles (user_id, role_id, classroom_id) VALUES (:user, (SELECT id FROM roles WHERE name='teacher'), :classroom)"), [{"classroom": classroom.id, "user": current_user.id}])
        conn.commit()
    return str(classroom.id)

@app.route("/classrooms/<classroom>/projects")
@requires_permission(P.GETCLASSROOM, "classroom")
def projects(classroom):
    with engine.connect() as conn:
        projects = conn.execute(text("""
            SELECT DISTINCT(projects.id), projects.name FROM projects
            LEFT JOIN users_roles ON ((projects.id = users_roles.project_id OR users_roles.project_id IS NULL)
                                      AND (users_roles.classroom_id IS NULL or users_roles.classroom_id=:classroom))
            LEFT JOIN roles_permissions ON (users_roles.role_id = roles_permissions.role_id)
            LEFT JOIN projects_tags ON (roles_permissions.tag_id = projects_tags.tag_id AND projects_tags.project_id=projects.id)
            LEFT JOIN classrooms_tags ON (roles_permissions.tag_id = projects_tags.tag_id AND classrooms_tags.classroom_id=:classroom)
            WHERE projects.classroom_id=:classroom
            AND users_roles.user_id=:user
            AND roles_permissions.permission_id=:perm
            AND (roles_permissions.tag_id IS NULL
                 OR classrooms_tags.id IS NOT NULL
                 OR projects_tags.id IS NOT NULL);
        """), [{"classroom": classroom, "perm": P.LISTPROJECT.value, "user": current_user.id}]).all()
    return render_template("projects.html", projects=projects, canmanageusers=has_permission(P.LISTUSERS), canaddproject=has_permission(P.ADDPROJECT), candeleteproject=has_permission(P.DELETEPROJECT))

@app.route("/classrooms/<classroom>/projects", methods=["POST"])
@requires_permission(P.ADDPROJECT, "classroom")
def newproject(classroom):
    formdata = request.form
    with engine.connect() as conn:
        # TODO: check permissions on classroom
        if "parent" in formdata:
            project = conn.execute(text("INSERT INTO projects (name, classroom_id, owner, parent_id) VALUES (:name, :classroom, :uid, :parent_id) RETURNING id"), [{"uid": current_user.id, "classroom": classroom, "name": formdata["name"], "parent_id": int(formdata["parent"])}]).first()
        else:
            project = conn.execute(text("INSERT INTO projects (name, classroom_id, owner) VALUES (:name, :classroom, :uid) RETURNING id"), [{"uid": current_user.id, "classroom": classroom, "name": formdata["name"]}]).first()
        conn.commit()
    return str(project.id)


@app.route("/projects/<pid>")
@requires_permission(P.VIEWPROJECT, "project")
def project(pid):
    # TODO: check permissions on classroom
    with engine.connect() as conn:
        row  = conn.execute(text("SELECT projects.name, classrooms.name AS classroom, classrooms.id AS classroom_id, tags.id AS tag_id FROM projects JOIN classrooms ON classrooms.id=projects.classroom_id LEFT JOIN projects_tags ON projects_tags.project_id=projects.id LEFT JOIN tags ON projects_tags.tag_id=tags.id WHERE projects.id=:pid AND (tags.name='published' OR tags.name IS NULL)"), [{"pid": pid}]).first()
    if row == None:
        return redirect(f"/classrooms/{classroom}/projects")
    return render_template("editor.html", classroom_name=row.classroom, project_name=row.name, classroom_id = row.classroom_id, canpublish=has_permission(P.ADDPROJECTTAG), canunpublish=has_permission(P.DELETEPROJECTTAG), published=not not row.tag_id )

@app.route("/projects/<pid>/tags/<tid>", methods = ["PUT"])
@requires_permission(P.ADDPROJECTTAG, "project")
def add_project_tag(pid, tid):
    with engine.connect() as conn:
        row  = conn.execute(text("INSERT INTO projects_tags (project_id, tag_id) VALUES (:pid, :tid)"), [{"pid": pid, "tid": tid}])
        conn.commit()
    return "Success"

@app.route("/projects/<pid>/tags/<tid>", methods = ["DELETE"])
@requires_permission(P.ADDPROJECTTAG, "project")
def delete_project_tag(pid, tid):
    with engine.connect() as conn:
        row  = conn.execute(text("DELETE FROM projects_tags WHERE project_id=:pid AND tag_id=:tid"), [{"pid": pid, "tid": tid}])
        conn.commit()
    return "Success"

@app.route("/projects/<pid>", methods = ["DELETE"])
@requires_permission(P.DELETEPROJECT, "project")
def delete_project(pid):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM files WHERE project_id=:pid"), [{"pid": pid}])
        conn.execute(text("DELETE FROM projects WHERE id=:pid"), [{"pid": pid}])
        conn.commit()

    return "Success";
