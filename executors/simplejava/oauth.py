# Heavily inspired and partially stolen from
# https://blog.miguelgrinberg.com/post/oauth-authentication-with-flask-in-2023

from flask_login import LoginManager, login_user, logout_user, current_user
from flask import abort, current_app, redirect, request, session, url_for, Flask
from sqlalchemy import text
from urllib.parse import urlencode
import os
import requests
import secrets
from app import app
from db import engine

login_manager = LoginManager(app)
login_manager.init_app(app)
login_manager.login_view="login"

oauth_config = {
    # Google OAuth 2.0 documentation:
    # https://developers.google.com/identity/protocols/oauth2/web-server#httprest
    'google': {
        'client_id': os.environ.get('GOOGLE_CLIENT_ID'),
        'client_secret': os.environ.get('GOOGLE_CLIENT_SECRET'),
        'authorize_url': 'https://accounts.google.com/o/oauth2/auth',
        'token_url': 'https://accounts.google.com/o/oauth2/token',
        'userinfo': {
            'url': 'https://www.googleapis.com/oauth2/v3/userinfo',
            'email': lambda json: json['email'],
        },
        'scopes': ['https://www.googleapis.com/auth/userinfo.email']
    }
}



class User:
    def __init__(self, email):
        with engine.connect() as conn:
            if isinstance(email, int):
                row = conn.execute(text("SELECT id, email FROM users WHERE id=:id AND (deactivated IS NULL OR deactivated <> 1)"), [{"id": email}]).first()
            else:
                row = conn.execute(text("SELECT id, email FROM users WHERE email=:email AND (deactivated IS NULL OR deactivated <> 1)"), [{"email": email}]).first()
            erow = None
            if "sudo" in request.cookies and request.cookies["sudo"]:
                erow = conn.execute(text("SELECT id, email FROM users WHERE id=:id"), [{"id": request.cookies["sudo"]}]).first()
        if row:
            self.id = row.id
            self.email = row.email
            self.euid = erow.id if erow else row.id
            self.eemail = erow.email if erow else row.email


    def is_authenticated(self):
        return True

    def is_active(self):
        return True

    def is_anonymous(self):
        return False

    def get_id(self):
        return self.id

    def get_eid(self):
        return self.euid

    def get_email(self):
        return self.email

    def get_eemail(self):
        return self.eemail

    def desc(self):
        if self.id == self.euid:
            return self.email
        return self.email + " viewing as " + self.eemail

@login_manager.user_loader
def load_user(id):
    return User(id)

# TODO: Why does <provider> not work here?
@app.route("/authorize/<provider>")
def authorize(provider):
    provider_data = oauth_config.get(provider)
    if provider_data is None:
        abort(404)

    session["oauth2_state"] = secrets.token_urlsafe(16)

    qs = urlencode({
        "client_id": provider_data["client_id"],
        "redirect_uri": url_for("oauth2_callback", provider=provider, _external=True),
        "response_type": "code",
        "scope": ' '.join(provider_data["scopes"]),
        "state": session["oauth2_state"],
    })

    return redirect(provider_data["authorize_url"] + "?" + qs)

@app.route("/callback/<provider>")
def oauth2_callback(provider):
    if not current_user.is_anonymous:
        with engine.connect() as conn:
            email = conn.execute(text("SELECT email FROM users WHERE id=:uid"), [{"uid": id}]).first().email
        return "logged in as " + current_user.id

    provider_data = oauth_config.get(provider)
    if provider_data is None:
        abort(404)

    if "error" in request.args:
        errors = []
        for k, v in request.arg.items():
            if k.startsWith("error"):
                errors.append(f"{k}: {v}")
        return "<br>".join(errors)

    if request.args["state"] != session.get("oauth2_state"):
        abort(401)

    if "code" not in request.args:
        abort(401)

    response = requests.post(provider_data["token_url"], data={
        "client_id": provider_data["client_id"],
        "client_secret": provider_data["client_secret"],
        "code": request.args["code"],
        "grant_type": "authorization_code",
        "redirect_uri": url_for("oauth2_callback", provider=provider, _external=True),
    }, headers={"Accept": "application/json"})
    if response.status_code != 200:
        abort(401)
    oauth2_token = response.json().get("access_token")
    if not oauth2_token:
        abort(401)

    response = requests.get(provider_data["userinfo"]["url"], headers={
        "Authorization": "Bearer " + oauth2_token,
        "Accept": "application/json",
    })
    if response.status_code != 200:
        abort(401)
    email = provider_data["userinfo"]["email"](response.json())

    with engine.connect() as conn:
        row = conn.execute(text("SELECT id FROM users WHERE email=:email AND (deactivated IS NULL OR deactivated <> 1)"), [{"email": email}]).first()
        print("row is " + repr(row) + " from " + email)

    if row:
        login_user(User(email))
        return redirect("/")

    print("Unknown user: " + str(email))
    return redirect("/unknown")
