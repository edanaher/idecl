from flask import Flask, abort, redirect, request, send_file, session, Response, stream_with_context
from flask_login import login_required, current_user
from sqlalchemy import text
import json
import os

from app import app
from permissions import Permissions as P, has_permission, requires_permission

from db import engine

@app.route("/projects/<pid>/history", methods=["POST"])
@requires_permission(P.EDITPROJECT, "project")
def update_project_history(pid):
    data = request.json
    print("DATA IS ", repr(data["updates"]), flush=True)

    with engine.connect() as conn:
        conn.execute(text(f"INSERT INTO history (project_id, \"index\", type, time, row, column, extra, client, checksum) VALUES (:pid, :index, :type, :time, :row, :column, :extra, :client, :checksum) ON CONFLICT DO NOTHING"),
                [{"pid": data["project_id"],
                  "client": data["client_id"],
                  "index": u["index"],
                  "type": u["type"],
                  "time": u["time"],
                  "row": u["row"],
                  "column": u["column"],
                  "extra": json.dumps(u.get("extra")),
                  "checksum": u.get("checksum")
                  } for u in data["updates"]])
        conn.commit()

    return "Success"


