from flask import Flask, redirect, request, send_file, session, Response, stream_with_context
from flask_login import login_required
import os
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, text

from app import app

engine = create_engine("sqlite+pysqlite:////tmp/idecl.db")
metadata_obj = MetaData()

user_table = Table(
    "users",
    metadata_obj,
    Column("id", Integer, primary_key=True),
    Column("email", String),
    Column("name", String)
)

metadata_obj.create_all(engine)

with engine.connect() as conn:
    conn.execute(text("INSERT INTO users (email) VALUES (:email)"), [{"email": e} for e in os.environ.get("USERS").split(",")])
    conn.commit()
