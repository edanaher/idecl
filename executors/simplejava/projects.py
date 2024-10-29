from flask import redirect, render_template, request, send_file, session
from flask_login import login_required, current_user
from sqlalchemy import text

from app import app
from db import engine

@login_required
@app.route("/projects")
def projects():
    with engine.connect() as conn:
        projects = conn.execute(text("SELECT projects.id, projects.name FROM projects JOIN users ON owner=users.id WHERE email=:email"), [{"email": current_user.id}]).all()
    return render_template("projects.html", projects=projects)

@login_required
@app.route("/projects", methods=["POST"])
def newproject():
    formdata = request.form
    with engine.connect() as conn:
        project = conn.execute(text("INSERT INTO projects (name, owner) VALUES (:name, (SELECT id FROM users WHERE email=:email)) RETURNING id"), [{"email": current_user.id, "name": formdata["name"]}]).first()
        conn.commit()
    return str(project.id)


@app.route("/projects/<pid>")
def project(pid):
    with engine.connect() as conn:
        row  = conn.execute(text("SELECT projects.name FROM projects JOIN users ON owner=users.id WHERE email=:email AND projects.id=:pid"), [{"email": current_user.id, "pid": pid}]).first()

    if row == None:
        return redirect("/projects")
    return render_template("editor.html", project_name=row.name)
