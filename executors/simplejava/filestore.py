from flask import Flask, redirect, request, send_file, session, Response, stream_with_context
from flask_login import login_required
import os
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, BLOB, ForeignKey, UniqueConstraint, text

from app import app

engine = create_engine("sqlite+pysqlite:////tmp/idecl.db")
metadata_obj = MetaData()

user_table = Table(
    "users",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("email", String, unique=True, nullable=False),
    Column("name", String)
)

projects_table = Table(
    "projects",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("owner", Integer, ForeignKey("users.id"), nullable=False),
    Column("name", String),
    UniqueConstraint("owner", "name", name="uniq_project_owner_name")
)

files_table = Table(
    "files",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id"), nullable=False),
    Column("name", String),
    Column("contents", BLOB),
    UniqueConstraint("project_id", "name", name="uniq_file_project_name")
)

metadata_obj.create_all(engine)

with engine.connect() as conn:
    conn.execute(text("INSERT INTO users (email) VALUES (:email)"), [{"email": e} for e in os.environ.get("USERS").split(",")])
    conn.execute(text("INSERT INTO projects (owner, name) VALUES (:user_id, 'default')"), [{"user_id": n + 1} for n in range(0, len(os.environ.get("USERS").split(",")))])
    conn.commit()
