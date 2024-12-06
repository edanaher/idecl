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
        print("data is", type(data), repr(data));
        hidden = False
        inherited = False
        readonly = False
        if "attrs" in data:
            print(attrs)
            if "h" in data["attrs"]:
                hidden = True
            if "i" in data["attrs"]:
                inherited = True
            if "r" in data["attrs"]:
                readonly = True

        conn.execute(text("DELETE FROM files WHERE project_id=:pid"), [{"pid": pid}])
        conn.execute(text("INSERT INTO files (project_id, file_id, name, contents, hidden, inherited, readonly) VALUES (:pid, :file_id, :name, :contents, :hidden, :inherited, :readonly) ON CONFLICT DO UPDATE SET contents=:contents, name=:name"), [{"pid": pid, "file_id": k, "name": data[k]["name"], "contents": data[k]["contents"], "hidden": "h" in data[k].get("attrs", ""), "inherited": "i" in data[k].get("attrs", ""), "readonly": "r" in data[k].get("attrs", "")} for k in data if k != "parent"])
        conn.commit()

    return "Success"

def attrsToString(row):
    result = ""
    if row.hidden:
        result += "h"
    if row.inherited:
        result += "i"
    if row.readonly:
        result += "r"
    return result

@login_required
@app.route("/projects/<pid>/load", methods=["GET"])
def load_project(pid):
    uid = current_user.id
    with engine.connect() as conn:
        # TODO: turn permissions back on with RBAC
        #row = conn.execute(text("SELECT * FROM projects WHERE owner=:uid AND projects.id=:pid"), [{"pid": pid, "uid": uid}]).first()
        #if not row:
        #    abort(401)
        rows = conn.execute(text("SELECT file_id, name, contents, hidden, inherited, readonly FROM files WHERE project_id=:pid"), [{"pid": pid}]).all()
        if (len(rows) == 0):
            return "{}"

        parent = conn.execute(text("SELECT parent_id FROM projects WHERE id=:pid"), [{"pid": pid}]).first()

    return json.dumps({"files": {r.file_id: {"name": r.name, "contents": r.contents, "attrs": attrsToString(r)} for r in rows}, "parent": parent.parent_id})
