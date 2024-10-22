# Heavily inspired by https://blog.miguelgrinberg.com/post/oauth-authentication-with-flask-in-2023

from flask_login import LoginManager, login_user, logout_user, current_user
from flask import current_app, redirect, session, url_for
from urllib.parse import urlencode
import os
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
    return "Authed?"
 
