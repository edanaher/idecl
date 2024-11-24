from flask import Flask, abort, redirect, request, send_file, session, Response, stream_with_context
from flask_login import login_required, current_user
from sqlalchemy import text
import json
import os

from app import app

from db import engine


with engine.connect() as conn:
    count = conn.execute(text("SELECT COUNT(*) FROM users")).first()[0]
    if count == 0:
        conn.execute(text("INSERT INTO users (email) VALUES (:email)"), [{"email": e} for e in os.environ.get("USERS").split(",")])
        conn.commit()


@login_required
@app.route("/projects/<pid>/save", methods=["POST"])
def save_project(pid):
    data = request.json
    with engine.connect() as conn:
        # TODO: turn permissions back on with RBAC
        #row = conn.execute(text("SELECT * FROM projects WHERE owner=:uid AND projects.id=:pid"), [{"pid": pid, "uid": current_user.id }]).first()
        #if not row:
        #    abort(401)
        print("data is", repr(data));
        conn.execute(text("DELETE FROM files WHERE project_id=:pid"), [{"pid": pid}])
        conn.execute(text("INSERT INTO files (project_id, file_id, name, contents) VALUES (:pid, :file_id, :name, :contents) ON CONFLICT DO UPDATE SET contents=:contents, name=:name"), [{"pid": pid, "file_id": k, "name": data[k]["name"], "contents": data[k]["contents"]} for k in data])
        conn.commit()

    return "Success"

@login_required
@app.route("/projects/<pid>/load", methods=["GET"])
def load_project(pid):
    uid = current_user.id
    with engine.connect() as conn:
        # TODO: turn permissions back on with RBAC
        #row = conn.execute(text("SELECT * FROM projects WHERE owner=:uid AND projects.id=:pid"), [{"pid": pid, "uid": uid}]).first()
        #if not row:
        #    abort(401)
        rows = conn.execute(text("SELECT file_id, name, contents FROM files WHERE project_id=:pid"), [{"pid": pid}]).all()

    return json.dumps({r.file_id: {"name": r.name, "contents": r.contents} for r in rows})
