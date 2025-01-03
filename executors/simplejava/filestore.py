from flask import Flask, abort, redirect, request, send_file, session, Response, stream_with_context
from flask_login import login_required, current_user
from sqlalchemy import text
import json
import os

from app import app
from permissions import Permissions as P, has_permission, requires_permission

from db import engine


@app.route("/projects/<pid>/save", methods=["POST"])
@requires_permission(P.EDITPROJECT, "project")
def save_project(pid):
    data = request.json
    with engine.connect() as conn:
        filedata = data["files"]

        conn.execute(text("DELETE FROM files WHERE project_id=:pid AND NOT hidden AND file_id NOT IN (" + ",".join(filedata.keys()) + ")"), [{"pid": pid}])
        conn.execute(text("INSERT INTO files (project_id, file_id, name, contents, hidden, inherited, readonly) VALUES (:pid, :file_id, :name, :contents, :hidden, :inherited, :readonly) ON CONFLICT DO UPDATE SET contents=:contents, name=:name"),
                [{"pid": pid, "file_id": k, "name": filedata[k]["name"], "contents": filedata[k]["contents"],
                  "hidden": "h" in filedata[k].get("attrs", ""),
                  "inherited": "i" in filedata[k].get("attrs", ""),
                  "readonly": "r" in filedata[k].get("attrs", "")} for k in filedata])
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

@app.route("/projects/<pid>/load", methods=["GET"])
@requires_permission(P.VIEWPROJECT, "project")
def load_project(pid):
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT file_id, name, contents, hidden, inherited, readonly FROM files WHERE project_id=:pid AND hidden = FALSE"), [{"pid": pid}]).all()
        if (len(rows) == 0):
            return "{}"

        parent = conn.execute(text("SELECT parent_id FROM projects WHERE id=:pid"), [{"pid": pid}]).first()

    return json.dumps({"files": {r.file_id: {"name": r.name, "contents": r.contents, "attrs": attrsToString(r)} for r in rows}, "parent": parent.parent_id})
