from flask import abort, redirect, render_template, request, send_file, session
from flask_login import login_required, current_user
import json
from sqlalchemy import text
import time

from app import app
from db import engine
from permissions import requires_permission, has_permission, Permissions as P

actions = [
    {
        "name": "sandbox",
        "type": "create_project",
        "tags": {"type": "sandbox", "owner": "${user.id}"},
        "files": [ {
            "name": "readme.md",
            "contents": "Sandbox project\n===============\n\nThis is a sandbox.  Feel free to describe your project here."
           }, {
             "name": "Main.java",
             "contents": "import java.io.*;\n\npublic class Main {\n  public static void main(String args[]) {\n    System.out.println(\"Hello world\");\n  }\n}"
           }
        ]
    }, {
        "name": "submit",
        "type": "update_project",
        "tags": {"add": {"submitted": None}},
    }, {
        "name": "unsubmit",
        "type": "update_project",
        "tags": {"remove": ["submitted"]},
    }
]

@app.route("/classrooms/<cid>/actions/<aid>", methods=["POST"])
@requires_permission(P.ACTION, "classroom")
def classroom_action(cid, aid):
    body = request.json
    aid = int(aid)
    if aid >= len(actions):
        abort(400, "Invalid action")

    action = actions[aid]

    if action["type"] == "create_project":
        with engine.connect() as conn:
            project = conn.execute(text("INSERT INTO projects (name, classroom_id, owner) VALUES (:name, :classroom, :uid) RETURNING id"), [{"uid": current_user.euid, "classroom": cid, "name": body["name"]}]).first()
            for t, v in action["tags"].items():
                v = v.replace("${user.id}", str(current_user.get_eid()))
                conn.execute(text("INSERT INTO projects_tags (project_id, tag_id, value, created) VALUES (:pid, (SELECT id FROM tags WHERE name=:tag), :value, :now) RETURNING id"), [{"pid": project.id, "tag": t, "value": v, "now": int(time.time())}]).first()
            for f in range(len(action["files"])):
                print(repr(action["files"]), repr(f), flush=True)
                file = action["files"][f]
                conn.execute(text("INSERT INTO files (project_id, file_id, name, contents, hidden, inherited, readonly) VALUES (:pid, :file_id, :name, :contents, :hidden, :inherited, :readonly)"),
                {"pid": project.id, "file_id": f, "name": file["name"], "contents": file["contents"],
                                  "hidden": "h" in file.get("attrs", ""),
                                  "inherited": "i" in file.get("attrs", ""),
                                  "readonly": "r" in file.get("attrs", "")})

            conn.commit()

    return json.dumps({"pid": project.id})

@app.route("/projects/<pid>/actions/<aid>", methods=["POST"])
@requires_permission(P.ACTION, "project")
def project_action(pid, aid):
    body = request.json
    aid = int(aid)
    if aid >= len(actions):
        abort(400, "Invalid action")

    action = actions[aid]

    if action["type"] == "update_project":
        with engine.connect() as conn:
            for t, v in action["tags"].get("add", {}).items():
                v = v and v.replace("${user.id}", str(current_user.get_eid()))
                conn.execute(text("INSERT INTO projects_tags (project_id, tag_id, value, created) VALUES (:pid, (SELECT id FROM tags WHERE name=:tag), :value, :now)"), [{"pid": pid, "tag": t, "value": v, "now": int(time.time())}])

            for t in action["tags"].get("remove", []):
                conn.execute(text("DELETE FROM projects_tags WHERE project_id=:pid AND tag_id=(SELECT id FROM tags WHERE name=:tag)"), [{"pid": pid, "tag": t}])
            conn.commit()

    return "Success"
