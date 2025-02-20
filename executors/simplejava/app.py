from flask import Flask, redirect, render_template, request, send_file, session, Response, stream_with_context
from flask_login import login_required, current_user
from functools import reduce
from sqlalchemy import text
import json
import os
import re
import select
import shutil
import subprocess
import tempfile
import time

from db import engine
import dbbootstrap

app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")

@app.route("/projects/<pid>/compile", methods=["POST"])
@login_required
def compile(pid):
    body = request.json

    testing = request.args.get("test") == "1"

    tmp = tempfile.mkdtemp(dir="/var/run/idecl", prefix="container_")
    shutil.chown(tmp, "nginx")

    container_name = f"{tmp[1:].replace('/', '-')}"
    tests = []
    # TODO: This should all be saved, not passed in.  The body here should just be to avoid sync issues.
    for k in body:
        if "/" in k:
            dirname = os.path.join(tmp, os.path.dirname(k))
            if not os.path.exists(dirname):
                os.makedirs(os.path.join(tmp, os.path.dirname(k)))
        with open(os.path.join(tmp, k), "w") as f:
            if "contents" in body[k]:
                contents = body[k]["contents"]
            else:
                # TODO: handle chained inherits
                inherited = body[k]["inherit"]
                with engine.connect() as conn:
                    contents = conn.execute(text("SELECT contents FROM files WHERE project_id=:pid AND file_id=:fid"),
                            [{"pid": inherited["project"], "fid": inherited["file"]}]).first().contents
            f.write(contents)

        if testing:
            basename = os.path.basename(k)
            if (basename.startswith("Test") and k.endswith(".java")) or k.endswith("Test.java") or k.endswith("Tests.java"):
                tests.append(k)

    # Add hidden files; the client doesn't know about them.
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT file_id, name, contents, inherited FROM files WHERE project_id=:pid"), [{"pid": int(pid)}]).all()
        for r in rows:
            if r.name in body:
                continue
            # TODO: test nested inherits
            parent = conn.execute(text("SELECT parent_id FROM projects WHERE id=:pid"), [{"pid": pid}]).first()
            file = r
            while file.inherited:
                file = conn.execute(text("SELECT file_id, name, contents, inherited FROM files WHERE project_id=:pid AND file_id=:fileid"), [{"pid": parent.parent_id, "fileid": r.file_id}]).first()
                parent = conn.execute(text("SELECT parent_id FROM projects WHERE id=:pid"), [{"pid": parent.parent_id}]).first()
            with open(os.path.join(tmp, r.name), "w") as f:
                f.write(file.contents)

            if testing:
                basename = os.path.basename(r.name)
                if (basename.startswith("Test") and basename.endswith(".java")) or basename.endswith("Test.java") or basename.endswith("Tests.java"):
                    tests.append(r.name)

    if testing and not tests:
        shutil.rmtree(tmp)
        return json.dumps({"error": "No tests found; tests should start with Test or end with Test or Tests.  E.g., TestNum.java, NumTest.java, or NumTests.java\n"})

    # Caching!  This hash function is not quite safe, but good enough to test.
    proc = subprocess.run(["/bin/sh", "-c", f"cd {tmp}" " && { ls; cat *; } | sha256sum | cut -c1-64 | xargs echo -n"], capture_output=True, text=False, timeout=30)
    inputhash = str(testing) + str(proc.stdout)
    with engine.connect() as conn:
        compiledtar = conn.execute(text("SELECT tarball FROM cached_classes WHERE sha256=:hash"), [{"hash": inputhash}]).first()

    dir_path = os.path.dirname(os.path.realpath(__file__))

    # TODO: error handling
    if compiledtar: 
        untar = subprocess.run(["/bin/sh", "-c", f"cd {tmp} && tar --zstd -x"], input=compiledtar.tarball)
        if untar.returncode != 0:
            print("Untar failure: " + str(untar.returncode) + str(untar.stdout) + str(untar.stderr))
        result = {"path": tmp, "container": container_name}
        if testing:
            result["tests"] = tests
        os.mkfifo(tmp + "/stdin.fifo")
        return json.dumps(result)
    else:
        if testing:
            proc = subprocess.run(["docker", "run", "--rm", "--name", container_name, "-m128m", "--ulimit", "cpu=10", f"-v{tmp}:/app", f"-v{dir_path}/junit:/junit", "--net", "none", "idecl-java-runner", "javac", "-cp", f"/junit/junit-4.13.2.jar:/app"] + [f"/app/{t}" for t in tests], capture_output=True, text=True, timeout=30)
        else:
            proc = subprocess.run(["docker", "run", "--rm", "--name", container_name, "-m128m", "--ulimit", "cpu=10", f"-v{tmp}:/app", f"-v{dir_path}/junit:/junit", "--net", "none", "idecl-java-runner", "javac", "-cp", "/app", "/app/Main.java"], capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            return json.dumps({"error": f"Error compiling {'tests' if testing else 'program'}:\n" + proc.stderr})

        # Add new compile to the cache
        proc = subprocess.run(["/bin/sh", "-c", f"cd {tmp} && tar --zstd -c ."], capture_output=True, text=False, timeout=30)
        saved_tarball = proc.stdout
        with engine.connect() as conn:
            conn.execute(text("INSERT INTO cached_classes (sha256, tarball) VALUES (:hash, :saved_tarball)"), [{"hash": inputhash, "saved_tarball": saved_tarball}])
            conn.commit()
    result = {"path": tmp, "container": container_name}
    if testing:
        result["tests"] = tests

    os.mkfifo(tmp + "/stdin.fifo")

    return json.dumps(result)

@app.route("/projects/<pid>/tests/save", methods=["POST"])
@login_required
def save_test_results(pid):
    body = request.json
    finalline = body.get("finalline", "")
    print("Saving test result for ", pid, ": ", finalline, flush=True)

    passed = None
    total = None
    allpassed = re.search(r"^OK \(([0-9]*) tests?\)\n*$", finalline)
    if allpassed:
        passed = int(allpassed.group(1))
        total = passed
    partial = re.search(r"^Tests run: *([0-9]*), *Failures: *([0-9]*)\n*$", finalline)
    if partial:
        total = int(partial.group(1))
        passed = total - int(partial.group(2))
    with engine.connect() as conn:
        conn.execute(text("INSERT INTO project_test_results (project_id, success, total, raw_results, created) VALUES (:pid, :passed, :total, :raw, :now)"), [{"pid": pid, "passed": passed, "total": total, "raw": finalline, "now": int(time.time())}])
        conn.commit()


    return ""


@app.route("/login")
def login():
    return send_file("../../client/login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")

@app.route("/unknown")
def unknown():
    return "Unregistered user"


@app.route("/")
@login_required
def root():
    return redirect("/classrooms")
    #return render_template("editor.html", project_name="scratchpad")

@app.route("/static/main.js")
def js():
    return send_file("../../client/main.js")

@app.route("/static/main.css")
def css():
    return send_file("../../client/main.css")

@app.route("/containers/<containerid>", methods=["DELETE"])
@login_required
def kill_container(containerid):
    proc = subprocess.run(["docker", "kill", containerid], capture_output=True, text=False, timeout=30)
    return ""

@app.route("/containers/<tmppath>/stdin", methods=["POST"])
@login_required
def stdin(tmppath):
    data = request.json
    input = data["input"]
    with open(os.path.join("/var/run/idecl", tmppath, "stdin.fifo"), "w") as f:
        f.write(input)
    return ""

@app.route("/comments", methods=["POST"])
@login_required
def addcomment():
    data = request.json
    comment = data["content"]
    with engine.connect() as conn:
        conn.execute(text("INSERT INTO comments (user_id, contents, created) VALUES (:uid, :comment, :now)"), [{"uid": current_user.get_id(), "comment": comment, "now": int(time.time())}])
        conn.commit()
    return ""

@app.route("/internal/logerror", methods=["POST"])
@login_required
def log_error():
    data = request.json
    user = current_user.get_id()
    project = data.get("project")
    user_agent = request.headers.get("User-Agent")
    error = data.get("error")
    stacktrace = data.get("stacktrace")
    internaldata = data.get("data")

    print("Error: ", repr(user), repr(project), repr(user_agent), repr(error), repr(stacktrace), repr(internaldata), flush=True)

    with engine.connect() as conn:
        conn.execute(text("INSERT INTO client_errors (user_id, project_id, user_agent, error, stacktrace, data, created) VALUES (:user, :project, :user_agent, :error, :stacktrace, :data, :now)"), [{"user": user, "project": project, "user_agent": user_agent, "error": error, "stacktrace": stacktrace, "data": json.dumps(internaldata), "now": int(time.time())}])
        conn.commit()

    return ""

@app.after_request
def after_request(response):
    timestamp = time.strftime('[%Y-%b-%d %H:%M:%S]')
    app.logger.error('%s %s %s %s %s %s %s', timestamp, request.headers.get("X-Forwarded-For"), current_user.get_id() or 0, request.method, request.scheme, request.full_path, response.status)
    return response

import oauth
import filestore
import projects
import users
