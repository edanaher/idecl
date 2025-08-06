from flask import Flask, abort, redirect, request, send_file, session, Response, stream_with_context
from flask_login import login_required, current_user
from sqlalchemy import text
import json
import os

from app import app
from permissions import Permissions as P, has_permission, requires_permission

from db import engine

def adjust_history(target, missed):
    for m in missed:
        if m["type"] == "i":
            if m["row"] == target["row"] and m["column"] < target["column"]:
                target["column"] += len(m["extra"])
    return target


@app.route("/projects/<pid>/history", methods=["POST"])
@requires_permission(P.EDITPROJECT, "project")
def update_project_history(pid):
    data = request.json
    print("DATA IS ", repr(data["updates"]), flush=True)
    min_index = min(u["index"] for u in data["updates"])

    with engine.connect() as conn:
        dbhist = conn.execute(text(f"SELECT * FROM history WHERE project_id=:pid AND \"index\" >= :minindex ORDER BY \"index\""), [{"pid": pid, "minindex": min_index}]).all()

        for client_first in data["updates"]:
            if client_first["index"] == min_index:
                break

        print("client_first", repr(client_first), flush=True)
        if (len(dbhist) == 0 or
           client_first["type"] != dbhist[0].type or
           client_first["time"] != dbhist[0].time or
           client_first["row"] != dbhist[0].row or
           client_first["column"] != dbhist[0].column or
           client_first["index"] != dbhist[0].index):
            # TODO: negotiate update with client and/or rebase client
           print("Out of date client; refusing to log update", flush=True)
           if client_first["index"] != 0 or len(dbhist) > 0:
               return json.dumps({"op": "ack", "error": "client is out of date"})

        offset = len(dbhist) - 1

        conn.execute(text(f"INSERT INTO history (project_id, \"index\", type, time, row, column, extra, client, checksum) VALUES (:pid, :index, :type, :time, :row, :column, :extra, :client, :checksum) ON CONFLICT DO NOTHING"),
                [{"pid": data["project_id"],
                  "client": data["client_id"],
                  "index": u["index"] + offset,
                  "type": u["type"],
                  "time": u["time"],
                  "row": u["row"],
                  "column": u["column"],
                  "extra": json.dumps(u.get("extra")),
                  "checksum": u.get("checksum")
                  } for u in data["updates"]])
        conn.commit()

    missed = [{
        "index": r.index,
        "type": r.type,
        "time": r.time,
        "row": r.row,
        "column": r.column,
        "extra": json.loads(r.extra),
        "client": r.client
    } for r in dbhist[1:]]

    adjusted = [adjust_history({
        "index": u["index"] + offset,
        "type": u["type"],
        "time": u["time"],
        "row": u["row"], # TODO: adjust row and column
        "column": u["column"],
        "extra": u.get("extra"), # TODO: and adjust extra as needed
    }, missed) for u in data["updates"]]


    # TODO: return real response
    return json.dumps({"op": "ack", "index": adjusted[-1]["index"], "missed": missed, "adjusted": adjusted[1:]})


