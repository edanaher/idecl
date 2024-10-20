from flask import Flask, request, send_file
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

    proc = subprocess.run(["javac", src], capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        return "Error compiling:\n:" + proc.stderr

    if proc.returncode != 0:
        return "Error running program:\n:" + proc.stderr
    proc = subprocess.Popen(["java", "-cp", tmp, "Main"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) # TODO: timeout
    while proc.returncode is None:
        proc.wait()
    if proc.returncode != 0:
        return "Error compiling:\n:" + proc.stderr

    shutil.rmtree(tmp)

    return reduce((lambda a, b : a + b), iter(proc.stdout.readline, ""), "")

@app.route("/")
def root():
    return send_file("../../client/index.html")

@app.route("/main.js")
def js():
    return send_file("../../client/main.js")

