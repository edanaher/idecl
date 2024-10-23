# Heavily inspired and partially stolen from
# https://blog.miguelgrinberg.com/post/oauth-authentication-with-flask-in-2023

from flask_login import LoginManager, login_user, logout_user, current_user
from flask import abort, current_app, redirect, request, session, url_for
from urllib.parse import urlencode
import os
import requests
import secrets

def authorize():
    provider = "google" # TODO: param
    provider_data = current_app.config["OAUTH2_PROVIDERS"].get(provider)
    if provider_data is None:
        abort(404)

    session["oauth2_state"] = secrets.token_urlsafe(16)

    qs = urlencode({
        "client_id": provider_data["client_id"],
        "redirect_uri": url_for("oauth2_callback", _external=True),
        "response_type": "code",
        "scope": ' '.join(provider_data["scopes"]),
        "state": session["oauth2_state"],
    })

    return redirect(provider_data["authorize_url"] + "?" + qs)

def oauth2_callback():
    provider = "google" # TODO: param
    #if not current_user.is_anonymous:
        #return redirect("/")

    provider_data = current_app.config["OAUTH2_PROVIDERS"].get(provider)
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
        "redirect_uri": url_for("oauth2_callback", _external=True),
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
    return "Logged in as " + email
