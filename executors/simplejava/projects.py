from datetime import datetime
import os
import shutil
import subprocess
import time

from flask import abort, redirect, render_template, request, send_file, session
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
    if len(classrooms) == 1 and not has_permission(P.ADDCLASSROOM):
        return redirect(f"/classrooms/{classrooms[0].id}/projects")
    return render_template("classrooms.html", classrooms=classrooms, loggedinas=current_user, canaddclassroom=has_permission(P.ADDCLASSROOM), canmanageusers=has_permission(P.LISTUSERS))

@app.route("/classrooms", methods=["POST"])
@requires_permission(P.ADDCLASSROOM)
def newclassroom():
    formdata = request.form
    with engine.connect() as conn:
        classroom = conn.execute(text("INSERT INTO classrooms (name) VALUES (:name) RETURNING id"), [{"name": formdata["name"]}]).first()
        conn.execute(text("INSERT INTO users_roles (user_id, role_id, classroom_id) VALUES (:user, (SELECT id FROM roles WHERE name='teacher'), :classroom)"), [{"classroom": classroom.id, "user": current_user.euid}])
        conn.commit()
    return str(classroom.id)

@app.route("/classrooms/<classroom>/projects")
@requires_permission(P.GETCLASSROOM, "classroom")
def projects(classroom):
    with engine.connect() as conn:
        classroom_row = conn.execute(text("SELECT id, name FROM classrooms WHERE id=:classroom"), [{"classroom": classroom}]).first()
        projects = conn.execute(text("""
            SELECT massed_projects.id, massed_projects.parent_id, massed_projects.name, massed_projects.cloned_as_assignment,
                   users.email, users.name AS username,
                   GROUP_CONCAT(cancloneassignment AND (cloned_as_assignment IS NULL)) AS cancloneassignment,
                   GROUP_CONCAT(canview) AS canview,
                   GROUP_CONCAT(DISTINCT display_tags.name) AS tags
            FROM (
                SELECT projects.id, projects.parent_id, projects.name, projects.owner,
                       GROUP_CONCAT(rp_cloneassignment.id) AND (already_cloned.id IS NULL) AS cancloneassignment,
                       projects.cloned_as_assignment,
                       GROUP_CONCAT(rp_view.id) AS canview
                FROM projects
                LEFT JOIN users_roles ON ((projects.id = users_roles.project_id OR users_roles.project_id IS NULL)
                                          AND (users_roles.classroom_id IS NULL or users_roles.classroom_id=:classroom))
                LEFT JOIN roles_permissions ON (users_roles.role_id = roles_permissions.role_id)
                LEFT JOIN projects_tags ON (roles_permissions.tag_id = projects_tags.tag_id AND projects_tags.project_id=projects.id)
                LEFT JOIN classrooms_tags ON (roles_permissions.tag_id = projects_tags.tag_id AND classrooms_tags.classroom_id=:classroom)
                LEFT JOIN roles_permissions AS rp_cloneassignment ON (users_roles.role_id = rp_cloneassignment.role_id AND rp_cloneassignment.permission_id=:perm_cloneassignment)
                LEFT JOIN roles_permissions AS rp_view ON (users_roles.role_id = rp_view.role_id AND rp_view.permission_id=:perm_view)
                LEFT JOIN projects AS already_cloned ON (already_cloned.parent_id=projects.id AND already_cloned.owner=:user AND already_cloned.cloned_as_assignment=TRUE)
                WHERE projects.classroom_id=:classroom
                AND users_roles.user_id=:user
                AND roles_permissions.permission_id=:perm
                AND (roles_permissions.tag_id IS NULL
                     OR classrooms_tags.id IS NOT NULL
                     OR projects_tags.id IS NOT NULL)
                GROUP BY projects.id
                UNION
                SELECT projects.id, projects.parent_id, projects.name, projects.owner, NULL, cloned_as_assignment, TRUE FROM projects WHERE owner=:user AND projects.classroom_id=:classroom
            ) AS massed_projects
            LEFT JOIN projects_tags AS display_pt ON display_pt.project_id=massed_projects.id
            LEFT JOIN tags AS display_tags ON display_pt.tag_id=display_tags.id
            LEFT JOIN users ON users.id = massed_projects.owner
            GROUP BY massed_projects.id
            ORDER BY COALESCE(
                        CASE WHEN massed_projects.cloned_as_assignment
                        THEN massed_projects.parent_id
                        ELSE NULL END,
                     massed_projects.id) ASC, username ASC, massed_projects.id ASC
            ;
        """), [{"classroom": classroom, "perm": P.LISTPROJECT.value, "user": current_user.euid, "perm_cloneassignment": P.CLONEPROJECTASASSIGNMENT.value, "perm_view": P.VIEWPROJECT.value}]).all()
    return render_template("projects.html", classroom=classroom_row, projects=projects, canmanageusers=has_permission(P.LISTUSERS), canaddproject=has_permission(P.ADDPROJECT), candeleteproject=has_permission(P.DELETEPROJECT))

@app.route("/classrooms/<classroom>/projects", methods=["POST"])
@requires_permission(P.ADDPROJECT, "classroom")
def newproject(classroom):
    formdata = request.form
    with engine.connect() as conn:
        # TODO: check permissions on classroom
        if "parent" in formdata:
            project = conn.execute(text("INSERT INTO projects (name, classroom_id, owner, parent_id) VALUES (:name, :classroom, :uid, :parent_id) RETURNING id"), [{"uid": current_user.euid, "classroom": classroom, "name": formdata["name"], "parent_id": int(formdata["parent"])}]).first()
        else:
            project = conn.execute(text("INSERT INTO projects (name, classroom_id, owner) VALUES (:name, :classroom, :uid) RETURNING id"), [{"uid": current_user.euid, "classroom": classroom, "name": formdata["name"]}]).first()
        conn.commit()
    return str(project.id)

@app.route("/projects/<pid>")
@requires_permission(P.VIEWPROJECT, "project")
def project(pid):
    # TODO: check permissions on classroom
    with engine.connect() as conn:
        row  = conn.execute(text("""
            SELECT projects.name, projects.cloned_as_assignment, projects.parent_id,
                classrooms.name AS classroom, classrooms.id AS classroom_id,
                tags.id AS tag_id,
                submitted.id AS submitted_id,
                submitted_pt.created AS submitted_created
            FROM projects
            JOIN classrooms ON classrooms.id=projects.classroom_id
            LEFT JOIN projects_tags ON projects_tags.project_id=projects.id
            LEFT JOIN tags ON projects_tags.tag_id=tags.id AND tags.name='published'
            LEFT JOIN projects_tags AS submitted_pt ON submitted_pt.project_id=projects.id
            LEFT JOIN tags AS submitted ON submitted_pt.tag_id=submitted.id AND submitted.name = 'submitted'
            WHERE projects.id=:pid AND (tags.name='published' OR tags.name IS NULL)
        """), [{"pid": pid}]).first()
        siblings = None
        if row.cloned_as_assignment and has_permission(P.COMPAREPROJECT, row.classroom_id, row.parent_id):
            siblings = conn.execute(text("""
                SELECT COALESCE(users.name, users.email, projects.name) AS name, projects.id
                FROM projects
                JOIN users ON projects.owner = users.id
                WHERE projects.parent_id=:pid
            """), [{"pid": row.parent_id}]).all()

    if row == None:
        return redirect(f"/classrooms/{classroom}/projects")
    return render_template("editor.html",
            classroom_name=row.classroom,
            project_id=int(pid),
            project_name=row.name,
            classroom_id=row.classroom_id,
            # TODO: Cloning a student's project would be nice for experimenting.  Enable it later once behavior is clearer.
            # TODO: these permissions should also check on the project.
            canclone=has_permission(P.ADDPROJECT, row.classroom_id) and not row.cloned_as_assignment,
            canpublish=has_permission(P.ADDPROJECTTAG, row.classroom_id) and not row.cloned_as_assignment,
            canunpublish=has_permission(P.DELETEPROJECTTAG, row.classroom_id) and not row.cloned_as_assignment,
            cansubmit=row.cloned_as_assignment, submitted=not not row.submitted_id, submitted_at = row.submitted_created,
            cancompare=has_permission(P.COMPAREPROJECT, row.classroom_id, pid) and not not row.tag_id,
            published=not not row.tag_id,
            siblings=siblings)

COMPARE_ROOT = "/app/compare"

@app.route("/projects/<pid>/compare")
@requires_permission(P.COMPAREPROJECT, "project")
def compare_project(pid):
    comparedir = f"{COMPARE_ROOT}/{pid}"
    try:
        shutil.rmtree(comparedir)
    except FileNotFoundError:
        pass
    os.makedirs(comparedir)
    with engine.connect() as conn:
        base_files  = conn.execute(text("""
            SELECT
                files.name AS file_name, files.contents
            FROM projects
            JOIN files ON files.project_id = projects.id
            WHERE projects.id=:pid
        """), [{"pid": pid}]).all()
        rows  = conn.execute(text("""
            SELECT
                projects.name, users.email, users.name AS user_name,
                files.name AS file_name, files.contents
            FROM projects
            JOIN users ON projects.owner=users.id
            JOIN files ON files.project_id = projects.id
            WHERE projects.parent_id=:pid AND projects.cloned_as_assignment = TRUE
            AND files.hidden = FALSE AND files.inherited = FALSE AND files.readonly = FALSE;
        """), [{"pid": pid}]).all()
    try:
        os.mkdir(comparedir + "/base")
    except FileExistsError:
        pass
    for row in base_files:
        try:
            os.mkdir(comparedir + "/base/" + os.path.dirname(row.file_name))
        except FileExistsError:
            pass
        with open(comparedir + "/" + "base" + "/" + row.file_name, "w") as f:
            f.write(row.contents)
    for row in rows:
        try:
            os.mkdir(comparedir + "/" + row.email)
        except FileExistsError:
            pass
        with open(comparedir + "/" + row.email + "/" + row.file_name, "w") as f:
            f.write(row.contents)

    subprocess.run(["compare50", "*", "-d", "base", "-p", "structure", "text", "exact", "nocomments", "misspellings"], cwd=comparedir)

    if os.path.isfile(comparedir + "/results/index.html"):
        return redirect(f"/projects/{pid}/compare/results/index.html")

    return "No similarites found"

@app.route("/projects/<pid>/compare/results/<path>")
@requires_permission(P.COMPAREPROJECT, "project")
def compare_project_results(pid, path):
    file = f"{COMPARE_ROOT}/{pid}/results/{path}"
    if os.path.isfile(file):
        with open(file) as f:
            return f.read()
    return 404, "Comparison not found"

@app.route("/projects/<pid>/assignment", methods = ["POST"])
@requires_permission(P.CLONEPROJECTASASSIGNMENT, "project")
def clone_project_as_assignment(pid):
    with engine.connect() as conn:
        alreadycloned = conn.execute(text("SELECT * FROM projects WHERE owner=:uid AND parent_id=:pid AND cloned_as_assignment=:t"), [{"uid": current_user.euid, "pid": int(pid), "t": True}]).first()
        if alreadycloned:
            abort(400, "User alread cloned project")

        projectrow = conn.execute(text("SELECT name, classroom_id FROM projects WHERE id=:pid"), [{"pid": int(pid)}]).first()
        newname = projectrow.name + " - " + current_user.get_eemail()
        clone_id = conn.execute(text("INSERT INTO projects (name, classroom_id, owner, parent_id, cloned_as_assignment) VALUES (:name, :classroom, :uid, :parent_id, :t) RETURNING id"), [{"uid": current_user.euid, "classroom": projectrow.classroom_id, "name": newname, "parent_id": int(pid), "t": True}]).first().id

        clone_files = conn.execute(text("SELECT files.id, files.name, files.contents, files.file_id FROM files LEFT JOIN files AS elim_templates ON (files.project_id = elim_templates.project_id AND 'template/' || files.name = elim_templates.name) WHERE files.project_id=:pid AND elim_templates.id IS NULL"), [{"pid": int(pid)}]).all()
        for fileinfo in clone_files:
            filename = fileinfo.name
            hidden = False
            inherited = False
            readonly = True
            if filename.startswith("Test") or filename.endswith("Test.java") or filename.endswith("Tests.java"):
                hidden = True
                inherited = True
            if filename.endswith(".md"):
                inherited = True
            if filename.startswith("template/"):
                filename = filename.removeprefix("template/")
                readonly = False
            conn.execute(text("INSERT INTO files (project_id, file_id, name, contents, hidden, inherited, readonly, parent_file_id) VALUES (:pid, :file_id, :name, :contents, :hidden, :inherited, :readonly, :parent_file)"), [{"pid": clone_id, "file_id": fileinfo.file_id, "name": filename, "contents": fileinfo.contents, "hidden": hidden, "inherited": inherited, "readonly": readonly, "parent_file": fileinfo.id if inherited else None}])


        conn.commit()
    return "Success"

@app.route("/projects/<pid>/tags/<tid>", methods = ["PUT"])
@requires_permission(P.ADDPROJECTTAG, "project")
def add_project_tag(pid, tid):
    with engine.connect() as conn:
        row  = conn.execute(text("INSERT INTO projects_tags (project_id, tag_id, created) VALUES (:pid, :tid, :now)"), [{"pid": pid, "tid": tid, "now": int(time.time())}])
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

@app.route("/projects/<pid>/submissions")
@requires_permission(P.COMPAREPROJECT, "project")
def assignment_results(pid):
    with engine.connect() as conn:
        project_row = conn.execute(text("SELECT name, id FROM projects WHERE id=:pid"), [{"pid": pid}]).first()
        classroom_row = conn.execute(text("SELECT classrooms.id, classrooms.name FROM classrooms JOIN projects ON projects.classroom_id=classrooms.id WHERE projects.id=:pid"), [{"pid": pid}]).first()
        # TODO: handle timezones properly instead of hardcoding -0500
        rows = conn.execute(text("""
            SELECT projects.name, projects.id,
                   test_results.success, test_results.total, test_results.created,
                   users.email, users.name AS username,
                   SUM(LENGTH(files.contents) - LENGTH(REPLACE(contents, X'0A', ''))) AS lines,
                   COALESCE(GROUP_CONCAT(
                        tags.name || ' at ' || COALESCE(DATETIME(projects_tags.created - 3600*5, 'unixepoch'), 'UNKNOWN')),
                      "") AS tags
            FROM projects
            LEFT JOIN (SELECT project_id, success, total, created, RANK() OVER (PARTITION BY project_id ORDER BY created DESC) as rank FROM project_test_results) AS test_results ON projects.id = test_results.project_id
            LEFT JOIN users ON projects.owner == users.id
            LEFT JOIN files ON files.project_id = projects.id AND NOT files.hidden AND NOT files.readonly AND NOT files.inherited
            LEFT JOIN projects_tags ON projects.id = projects_tags.project_id
            LEFT JOIN tags ON projects_tags.tag_id = tags.id
            WHERE (rank=1 OR rank IS NULL) AND parent_id=:pid AND cloned_as_assignment=TRUE
            GROUP BY projects.id
            ORDER BY COALESCE(users.name, users.email);
        """), [{"pid": pid}]).all()

    return render_template("assignment_results.html", classroom_id=classroom_row.id, classroom_name=classroom_row.name, project_id=pid, project_name=project_row.name, loggedinas=current_user, canmanageusers=has_permission(P.LISTUSERS), results=rows)
