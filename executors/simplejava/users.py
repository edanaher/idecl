from flask import redirect, render_template, request, send_file, session
from flask_login import login_required, current_user
from sqlalchemy import text

from app import app
from db import engine

@app.route("/users")
@login_required
def users():
    with engine.connect() as conn:
        # TODO: require admin permissions
        users = conn.execute(text("SELECT id, email, name FROM users")).all()
    return render_template("users.html", users=users)

@app.route("/users", methods=["POST"])
@login_required
def new_user():
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        users = conn.execute(text("INSERT INTO users (email, name) VALUES (:email, :name) RETURNING id"), [{"email": formdata["email"], "name": formdata["name"]}]).first()
        conn.commit()
    return str(user.id)

@app.route("/users", methods=["POST"])
@login_required
def new_user():
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        users = conn.execute(text("INSERT INTO users (email, name) VALUES (:email, :name) RETURNING id"), [{"email": formdata["email"], "name": formdata["name"]}]).first()
        conn.commit()
    return str(user.id)

@app.route("/users/<uid>", methods=["DELETE"])
@login_required
def delete_user():
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        users = conn.execute(text("INSERT INTO users (email, name) VALUES (:email, :name) RETURNING id"), [{"email": formdata["email"], "name": formdata["name"]}]).first()
        conn.commit()
    return str(user.id)
