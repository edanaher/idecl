from flask import Flask, abort, redirect, request, send_file, session, Response, stream_with_context
from flask_login import login_required
from sqlalchemy import text
import os

from app import app

from db import engine


with engine.connect() as conn:
    count = conn.execute(text("SELECT COUNT(*) FROM users")).first()
    if count == 0:
        conn.execute(text("INSERT INTO users (email) VALUES (:email)"), [{"email": e} for e in os.environ.get("USERS").split(",")])
        conn.execute(text("INSERT INTO projects (owner, name) VALUES (:user_id, 'default')"), [{"user_id": n + 1} for n in range(0, len(os.environ.get("USERS").split(",")))])
        conn.commit()


@login_required
@app.route("/projects/<pid>/save", methods=["POST"])
def save_project(pid):
    formdata = request.form
    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM projects JOIN users ON owner=users.id WHERE email=:email AND projects.id=:pid"), [{"pid": pid, "email": "edanaher@gmail.com"}]).first()
        if not row:
            abort(401)
        conn.execute(text("INSERT INTO files (project_id, name, contents) VALUES (:pid, :name, :contents) ON CONFLICT DO UPDATE SET contents=:contents"), [{"pid": pid, "name": k, "contents": formdata[k]} for k in formdata])
        conn.commit()

    return "Success"
