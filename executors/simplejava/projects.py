from flask import redirect, render_template, send_file, session
from flask_login import login_required, current_user
from sqlalchemy import text

from app import app
from db import engine

@login_required
@app.route("/projects")
def projects():
    with engine.connect() as conn:
        projects = conn.execute(text("SELECT projects.id, projects.name FROM projects JOIN users ON owner=users.id WHERE email=:email"), [{"email": current_user.id}]).all()
    projecthtml = [f'<li><a href="/projects/{row.id}">{row.name}</a></li>' for row in projects]
    return "<html><ul>" + "".join(projecthtml) + "</ul></html>"

@app.route("/projects/<pid>")
def project(pid):
    with engine.connect() as conn:
        row  = conn.execute(text("SELECT projects.name FROM projects JOIN users ON owner=users.id WHERE email=:email AND projects.id=:pid"), [{"email": current_user.id, "pid": pid}]).first()

    if row == None:
        return redirect("/projects")
    return render_template("editor.html", project_name=row.name)
