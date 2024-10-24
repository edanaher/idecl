from flask import Flask, redirect, request, send_file, session, Response, stream_with_context
from flask_login import login_required
from functools import reduce
import os
import shutil
import subprocess
import tempfile

app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")

@login_required
@app.route("/run", methods=["POST"])
def run():
    formdata = request.form

    testing = request.args.get("test") == "1"

    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, "Main.java")
    bin = os.path.join(tmp, "Main")
    tests = []
    for k in formdata:
        with open(os.path.join(tmp, k), "w") as f:
            f.write(formdata[k])
        if testing:
            if (k.startswith("Test") and k.endswith(".java")) or k.endswith("Test.java") or k.endswith("Tests.java"):
                tests.append(k)

    if testing and not tests:
        return "No tests found; tests should start with Test or end with Test or Tests.  E.g., TestNum.java, NumTest.java, or NumTests.java"

    def stream():
        if testing:
            proc = subprocess.run(["javac", "-cp", f"junit/junit-4.13.2.jar:{tmp}"] + [f"{tmp}/{t}" for t in tests], capture_output=True, text=True, timeout=30)
        else:
            proc = subprocess.run(["javac", "-cp", tmp, src], capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            yield f"0\nError compiling {'tests' if testing else 'program'}:\n" + proc.stderr
            return

        if testing:
            proc = subprocess.Popen(["java", "-cp", f"junit/junit-4.13.2.jar:junit/hamcrest-core-1.3.jar:{tmp}:junit", "org.junit.runner.JUnitCore"] + [t.rstrip('.java') for t in tests], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1) # TODO: timeout
        else:
            proc = subprocess.Popen(["java", "-cp", tmp, "Main"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1) # TODO: timeout
        yield str(proc.pid) + "\n"
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
    return send_file("../../client/index.html")

@login_required
@app.route("/main.js")
def js():
    return send_file("../../client/main.js")

@login_required
@app.route("/main.css")
def css():
    return send_file("../../client/main.css")

@login_required
@app.route("/<pid>/stdin", methods=["POST"])
def stdin(pid):
    formdata = request.form
    input = formdata["input"]
    with open(f"/proc/{pid}/fd/0", "w") as f:
        f.write(input + "\n")
    return ""

import oauth
