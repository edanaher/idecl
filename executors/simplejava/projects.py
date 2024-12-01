from flask import redirect, render_template, request, send_file, session
from flask_login import login_required, current_user
from sqlalchemy import text

from app import app
from db import engine

@app.route("/classrooms")
@login_required
def classrooms():
    with engine.connect() as conn:
        # TODO: add user management for classrooms.  Probably when students/RBAC show up.
        #classrooms = conn.execute(text("SELECT classrooms.id, classrooms.name FROM classrooms JOIN classrooms_users ON classroom_id=classrooms.id WHERE user_id=:uid"), [{"uid": current_user.id}]).all()
        classrooms = conn.execute(text("SELECT classrooms.id, classrooms.name FROM classrooms"), [{"uid": current_user.id}]).all()
    return render_template("classrooms.html", classrooms=classrooms)

@app.route("/classrooms", methods=["POST"])
@login_required
def newclassroom():
    formdata = request.form
    with engine.connect() as conn:
        classroom = conn.execute(text("INSERT INTO classrooms (name) VALUES (:name) RETURNING id"), [{"name": formdata["name"]}]).first()
        conn.execute(text("INSERT INTO classrooms_users (classroom_id, user_id) VALUES (:classroom, :user)"), [{"classroom": classroom.id, "user": current_user.id}])
        conn.commit()
    return str(classroom.id)

@app.route("/classrooms/<classroom>/projects")
@login_required
def projects(classroom):
    with engine.connect() as conn:
        projects = conn.execute(text("SELECT projects.id, projects.name FROM projects WHERE classroom_id=:classroom"), [{"classroom": classroom}]).all()
    return render_template("projects.html", projects=projects)

@app.route("/classrooms/<classroom>/projects", methods=["POST"])
@login_required
def newproject(classroom):
    formdata = request.form
    with engine.connect() as conn:
        # TODO: check permissions on classroom
        project = conn.execute(text("INSERT INTO projects (name, classroom_id, owner) VALUES (:name, :classroom, :uid) RETURNING id"), [{"uid": current_user.id, "classroom": classroom, "name": formdata["name"]}]).first()
        conn.commit()
    return str(project.id)


@app.route("/projects/<pid>")
@login_required
def project(pid):
    # TODO: check permissions on classroom
    with engine.connect() as conn:
        row  = conn.execute(text("SELECT projects.name, classrooms.name AS classroom, classrooms.id AS classroom_id FROM projects JOIN classrooms ON classrooms.id=projects.classroom_id WHERE projects.id=:pid"), [{"pid": pid}]).first()

    if row == None:
        return redirect(f"/classrooms/{classroom}/projects")
    return render_template("editor.html", classroom_name=row.classroom, project_name=row.name, classroom_id = row.classroom_id)

@app.route("/projects/<pid>", methods = ["DELETE"])
@login_required
def delete_project(pid):
    # TODO: check permissions on classroom
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM projects WHERE id=:pid"), [{"pid": pid}])
        conn.execute(text("DELETE FROM files WHERE project_id=:pid"), [{"pid": pid}])
        conn.commit()

    return "Success";
