from flask import session
from flask_login import login_required, current_user
from sqlalchemy import text

from app import app
from db import engine

@login_required
@app.route("/projects")
def projects():
    user = current_user
    with engine.connect() as conn:
        projects = conn.execute(text("SELECT projects.id, projects.name FROM projects JOIN users ON owner=users.id WHERE email=:email"), [{"email": "edanaher@gmail.com"}]).all()
    projecthtml = [f'<li><a href="/projects/{row.id}">{row.name}</a></li>' for row in projects]
    return "<html><ul>" + "".join(projecthtml) + "</ul></html>"

