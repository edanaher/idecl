from flask import Flask, redirect, request, send_file, session, Response, stream_with_context
from flask_login import login_required
from sqlalchemy import text
import os

from app import app

from db import engine


with engine.connect() as conn:
    count = conn.execute(text("SELECT COUNT(*) FROM users")).first()
    if count == 0:
        conn.execute(text("INSERT INTO users (email) VALUES (:email)"), [{"email": e} for e in os.environ.get("USERS").split(",")])
        conn.execute(text("INSERT INTO projects (owner, name) VALUES (:user_id, 'default')"), [{"user_id": n + 1} for n in range(0, len(os.environ.get("USERS").split(",")))])
        conn.commit()
