from flask import Flask, request, send_file, Response, stream_with_context
from functools import reduce
import os
import shutil
import subprocess
import tempfile

app = Flask(__name__)

@app.route("/run", methods=["POST"])
def run():
    formdata = request.form

    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, "Main.java")
    bin = os.path.join(tmp, "Main")
    for k in formdata:
        with open(os.path.join(tmp, k), "w") as f:
            f.write(formdata[k])

    def stream():
        proc = subprocess.run(["javac", "-cp", tmp, src], capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            yield "0\nError compiling program:\n" + proc.stderr
            return

        proc = subprocess.Popen(["java", "-cp", tmp, "Main"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1) # TODO: timeout
        yield str(proc.pid) + "\n"
        while l := proc.stdout.readline():
            yield l
        proc.wait()
        if proc.returncode != 0:
            return "Error running: " + proc.returncode + "\n:" + reduce((lambda a, b : a + b), iter(proc.stderr.readline, ""), "")

        shutil.rmtree(tmp)

    response = Response(stream_with_context(stream()))
    return response

@app.route("/")
def root():
    return send_file("../../client/index.html")

@app.route("/main.js")
def js():
    return send_file("../../client/main.js")

@app.route("/main.css")
def css():
    return send_file("../../client/main.css")

@app.route("/<pid>/stdin", methods=["POST"])
def stdin(pid):
    formdata = request.form
    input = formdata["input"]
    with open(f"/proc/{pid}/fd/0", "w") as f:
        f.write(input + "\n")
    return ""
