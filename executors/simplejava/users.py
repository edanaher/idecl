from flask import redirect, render_template, request, send_file, session
from flask_login import login_required, current_user
from sqlalchemy import text

from app import app
from db import engine

# Bootstrap roles
# TODO: general roles.
with engine.connect() as conn:
    count = conn.execute(text("SELECT COUNT(*) FROM roles")).first()[0]
    if count == 0:
        conn.execute(text("INSERT INTO roles (name) VALUES (:name)"), [{"name": n} for n in ["teacher", "student"]])
        conn.commit()

@app.route("/users")
@login_required
def users():
    with engine.connect() as conn:
        # TODO: require admin permissions
        users = conn.execute(text("SELECT id, email, name FROM users WHERE deactivated <> 1 OR deactivated IS NULL")).all()
        inactive_users = conn.execute(text("SELECT id, email, name FROM users WHERE deactivated = 1")).all()
    return render_template("users.html", users=users, inactive_users=inactive_users)

@app.route("/users", methods=["POST"])
@login_required
def new_user():
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        user = conn.execute(text("INSERT INTO users (email, name) VALUES (:email, :name) RETURNING id"), [{"email": formdata["email"], "name": formdata["name"]}]).first()
        conn.commit()
    return str(user.id)

@app.route("/users/<uid>", methods=["DELETE"])
@login_required
def deactivate_user(uid):
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        conn.execute(text("UPDATE users SET deactivated=1 WHERE id=:id"), [{"id": uid}])
        conn.commit()
    return ""

@app.route("/users/<uid>", methods=["PUT"])
@login_required
def reactivate_user(uid):
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        conn.execute(text("UPDATE users SET deactivated=0 WHERE id=:id"), [{"id": uid}])
        conn.commit()
    return ""
