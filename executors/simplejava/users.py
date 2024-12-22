from flask import abort, redirect, render_template, request, send_file, session, current_app
from flask_login import login_required, current_user
from sqlalchemy import text

from app import app
from db import engine
from permissions import Permissions as P, has_permission, requires_permission



@app.route("/users")
@requires_permission(P.LISTUSERS)
def users():
    with engine.connect() as conn:
        users = conn.execute(text("SELECT id, email, name FROM users WHERE deactivated <> 1 OR deactivated IS NULL")).all()
        classrooms = conn.execute(text("SELECT classrooms.id, classrooms.name FROM classrooms"), [{"uid": current_user.euid}]).all()
        inactive_users = conn.execute(text("SELECT id, email, name FROM users WHERE deactivated = 1")).all()
    return render_template("users.html", users=users, inactive_users=inactive_users, classrooms=classrooms, current_user=current_user, canaddusers=has_permission(P.ADDUSER), candeactivateusers=has_permission(P.DEACTIVATEUSER), canreactivateusers=has_permission(P.REACTIVATEUSER))

@app.route("/users", methods=["POST"])
@requires_permission(P.ADDUSER)
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
@requires_permission(P.VIEWUSER)
def view_user(uid):
    with engine.connect() as conn:
        # TODO: require admin permissions
        user = conn.execute(text("SELECT id, email, name, deactivated FROM users WHERE id=:id"), [{"id": uid}]).first()
        roles = conn.execute(text("SELECT users_roles.id, classrooms.name AS classroom, roles.name AS role FROM users_roles LEFT JOIN classrooms ON classroom_id = classrooms.id JOIN roles ON roles.id=role_id WHERE user_id=:id"), [{"id": uid}]).all()
        classrooms = conn.execute(text("SELECT classrooms.id, classrooms.name FROM classrooms"), [{"uid": current_user.euid}]).all()
    can_sudo = has_permission(P.SUDO)
    return render_template("user.html", user=user, roles=roles, classrooms=classrooms, can_sudo=can_sudo)

@app.route("/users/<uid>", methods=["DELETE"])
@requires_permission(P.DEACTIVATEUSER)
def deactivate_user(uid):
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        conn.execute(text("UPDATE users SET deactivated=1 WHERE id=:id"), [{"id": uid}])
        conn.commit()
    return ""

@app.route("/users/<uid>/roles", methods=["POST"])
@requires_permission(P.ADDUSERROLE)
def add_role_to_user(uid):
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        role = conn.execute(text("SELECT id FROM roles WHERE name=:role"), [{"role": formdata["role"]}]).first()
        if not role:
            role = conn.execute(text("SELECT id FROM roles WHERE name='student'")).first()
        classroom = None;
        if formdata["classroom"]:
            classroom = formdata["classroom"]
        row = conn.execute(text("INSERT INTO users_roles (user_id, role_id, classroom_id) VALUES (:user, :role, :classroom) RETURNING id"), [{"user": uid, "role": role.id, "classroom": classroom}]).first()
        conn.commit()
    return str(row.id)

@app.route("/users/<uid>/roles/<rid>", methods=["DELETE"])
@requires_permission(P.DELETEUSERROLE)
def delete_role_from_user(uid, rid):
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions and validate role is on user
        role = conn.execute(text("DELETE FROM users_roles WHERE id=:rid"), [{"rid": rid}])
        conn.commit()
    return ""

@app.route("/users/<uid>", methods=["PUT"])
@requires_permission(P.REACTIVATEUSER)
def reactivate_user(uid):
    formdata = request.form
    with engine.connect() as conn:
        # TODO: require admin permissions
        conn.execute(text("UPDATE users SET deactivated=0 WHERE id=:id"), [{"id": uid}])
        conn.commit()
    return ""
