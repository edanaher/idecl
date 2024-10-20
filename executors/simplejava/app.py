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
    if "file" not in formdata:
        return "Error; no file provided"

    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, "Main.java")
    bin = os.path.join(tmp, "Main")
    with open(src, "w") as f:
        f.write(formdata["file"])

    def stream():
        proc = subprocess.run(["javac", src], capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            yield "Error compiling program:\n" + proc.stderr
            return

        proc = subprocess.Popen(["java", "-cp", tmp, "Main"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1) # TODO: timeout
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

