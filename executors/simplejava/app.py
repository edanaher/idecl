from flask import Flask, redirect, render_template, request, send_file, session, Response, stream_with_context
from flask_login import login_required
from functools import reduce
from sqlalchemy import text
import os
import shutil
import subprocess
import tempfile

from db import engine
import dbbootstrap

app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")

@app.route("/run", methods=["POST"])
@login_required
def run():
    body = request.json

    testing = request.args.get("test") == "1"

    tmp = tempfile.mkdtemp()
    tests = []
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

    # Caching!  This hash function is not quite safe, but good enough to test.
    proc = subprocess.run(["/bin/sh", "-c", f"cd {tmp}" " && { ls; cat *; }"], capture_output=True, text=False, timeout=30)
    #print("pre-hash result:", proc.stdout)
    proc = subprocess.run(["/bin/sh", "-c", f"cd {tmp}" " && { ls; cat *; } | sha256sum | cut -c1-64 | xargs echo -n"], capture_output=True, text=False, timeout=30)
    inputhash = str(testing) + str(proc.stdout)
    print("hash is", inputhash)
    with engine.connect() as conn:
        compiledtar = conn.execute(text("SELECT tarball FROM cached_classes WHERE sha256=:hash"), [{"hash": inputhash}]).first()
    print("compiledtar is", compiledtar)


    if testing and not tests:
        return "No tests found; tests should start with Test or end with Test or Tests.  E.g., TestNum.java, NumTest.java, or NumTests.java"

    def stream():
        dir_path = os.path.dirname(os.path.realpath(__file__))

        # TODO: error handling
        if compiledtar: 
            untar = subprocess.run(["/bin/sh", "-c", f"cd {tmp} && tar --zstd -x"], input=compiledtar.tarball)
            if untar.returncode != 0:
                print("Untar failure: " + str(untar.returncode) + str(untar.stdout) + str(untar.stderr))
        else:
            if testing:
                proc = subprocess.run(["docker", "run", f"-v{tmp}:/app", f"-v{dir_path}/junit:/junit", "--net", "none", "idecl-java-runner", "javac", "-cp", f"/junit/junit-4.13.2.jar:/app"] + [f"/app/{t}" for t in tests], capture_output=True, text=True, timeout=30)
            else:
                proc = subprocess.run(["docker", "run", f"-v{tmp}:/app", f"-v{dir_path}/junit:/junit", "--net", "none", "idecl-java-runner", "javac", "-cp", "/app", "/app/Main.java"], capture_output=True, text=True, timeout=30)
            if proc.returncode != 0:
                yield f"0\nError compiling {'tests' if testing else 'program'}:\n" + proc.stderr
                return

            # Add new compile to the cache
            proc = subprocess.run(["/bin/sh", "-c", f"cd {tmp} && tar --zstd -c ."], capture_output=True, text=False, timeout=30)
            saved_tarball = proc.stdout
            with engine.connect() as conn:
                conn.execute(text("INSERT INTO cached_classes (sha256, tarball) VALUES (:hash, :saved_tarball)"), [{"hash": inputhash, "saved_tarball": saved_tarball}])
                conn.commit()

        if testing:
            proc = subprocess.Popen(["docker", "run", f"-v{tmp}:/app", f"-v{dir_path}/junit:/junit", "--net", "none", "idecl-java-runner", "java", "-cp", f"/junit/junit-4.13.2.jar:/junit/hamcrest-core-1.3.jar:/app:/junit", "org.junit.runner.JUnitCore"] + [t.replace("/", ".").rstrip('.java') for t in tests], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1) # TODO: timeout
        else:
            os.mkfifo(os.path.join(tmp, "stdin.fifo"))
            proc = subprocess.Popen(["docker", "run", f"-v{tmp}:/app", "--net", "none", "idecl-java-runner", "/bin/sh", "-c", "java -cp /app Main <> /app/stdin.fifo"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1) # TODO: timeout
        yield f"{tmp.replace('/', '@')}\n"
        # TODO: intersperse stdout and stderr
        while l := proc.stdout.readline():
            yield l
        while l := proc.stderr.readline():
            yield l
        proc.wait()
        if proc.returncode != 0:
            return "Error running: " + str(proc.returncode) + "\n:" + reduce((lambda a, b : a + b), iter(proc.stderr.readline, ""), "")

        shutil.rmtree(tmp)

    response = Response(stream_with_context(stream()))
    return response

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

@app.route("/<containerid>/stdin", methods=["POST"])
@login_required
def stdin(containerid):
    data = request.json
    input = data["input"]
    with open(os.path.join(containerid.replace("@", "/"), "stdin.fifo"), "w") as f:
        f.write(input)
    return ""

import oauth
import filestore
import projects
import users
