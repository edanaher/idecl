from flask import abort, redirect, render_template, request, send_file, session, current_app
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
        classrooms = conn.execute(text("SELECT classrooms.id, classrooms.name FROM classrooms"), [{"uid": current_user.id}]).all()
        inactive_users = conn.execute(text("SELECT id, email, name FROM users WHERE deactivated = 1")).all()
    return render_template("users.html", users=users, inactive_users=inactive_users, classrooms=classrooms)

@app.route("/users", methods=["POST"])
@login_required
def new_user():
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        role = conn.execute(text("SELECT id FROM roles WHERE name=:role"), [{"role": formdata["role"]}]).first()
        if not role:
            role = conn.execute(text("SELECT id FROM roles WHERE name='student'")).first()
        user = conn.execute(text("INSERT INTO users (email, name) VALUES (:email, :name) RETURNING id"), [{"email": formdata["email"], "name": formdata["name"], "role": role}]).first()
        classroom = None;
        if formdata["classroom"]:
            classroom = formdata["classroom"]
        conn.execute(text("INSERT INTO users_roles (user_id, role_id, classroom_id) VALUES (:user, :role, :classroom)"), [{"user": user.id, "role": role.id, "classroom": classroom}])
        conn.commit()
    return str(user.id)

@app.route("/users/<uid>")
@login_required
def view_user(uid):
    with engine.connect() as conn:
        # TODO: require admin permissions
        user = conn.execute(text("SELECT email, name, deactivated FROM users WHERE id=:id"), [{"id": uid}]).first()
        roles = conn.execute(text("SELECT classrooms.name AS classroom, roles.name AS role FROM users_roles LEFT JOIN classrooms ON classroom_id = classrooms.id JOIN roles ON roles.id=role_id WHERE user_id=:id"), [{"id": uid}]).all()
    return f"<h4>{user.email} ({user.name})</h4>{'<i>deactivated</i><br>' if user.deactivated else ""}{'<br>'.join([f'{r.role} on {r.classroom or 'all classrooms'}' for r in roles])}"

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
