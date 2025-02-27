import os
from sqlalchemy import text
from db import engine

# Bootstrap roles
# TODO: general roles.
with engine.connect() as conn:
    count = conn.execute(text("SELECT COUNT(*) FROM roles")).first()[0]
    if count == 0:
        conn.execute(text("INSERT INTO roles (name) VALUES (:name)"), [{"name": n} for n in ["teacher", "student"]])
        conn.commit()

with engine.connect() as conn:
    count = conn.execute(text("SELECT COUNT(*) FROM users")).first()[0]
    if count == 0:
        print(repr(os.environ.get("USERS").split(",")))
        conn.execute(text("INSERT INTO users (email) VALUES (:email)"), [{"email": e} for e in os.environ.get("USERS").split(",")])
        uids = conn.execute(text("SELECT id FROM users")).all()
        conn.execute(text("INSERT INTO users_roles (user_id, role_id) VALUES (:uid, (SELECT id FROM roles WHERE name='teacher'))"), [{"uid": u.id} for u in uids])
        conn.commit()

with engine.connect() as conn:
    conn.execute(text("INSERT INTO tags (id, name, display) VALUES (1, :name, TRUE) ON CONFLICT DO UPDATE SET  name=:name, display=TRUE"), [{"name": "published"}])
    conn.execute(text("INSERT INTO tags (id, name, display) VALUES (2, :name, TRUE) ON CONFLICT DO UPDATE SET  name=:name, display=TRUE"), [{"name": "submitted"}])
    conn.execute(text("INSERT INTO tags (id, name, display) VALUES (3, :name, FALSE) ON CONFLICT DO UPDATE SET  name=:name, display=FALSE"), [{"name": "owner"}])
    conn.execute(text("INSERT INTO tags (id, name, display) VALUES (4, :name, FALSE) ON CONFLICT DO UPDATE SET  name=:name, display=FALSE"), [{"name": "type"}])
    conn.commit()
