"""Auth apis."""

import base64
import hashlib
import ipaddress
import json
import logging
import os
import re
import secrets
import time
from datetime import datetime
from pathlib import Path

from flask import Blueprint, current_app, jsonify, make_response, redirect, request
from flask_limiter import Limiter
from joserfc import jwt
from peewee import DoesNotExist, IntegrityError
import requests

from vigision.config import AuthConfig, ProxyConfig
from vigision.const import CONFIG_DIR, JWT_SECRET_ENV_VAR, PASSWORD_HASH_ALGORITHM
from vigision.models import User
from vigision.models import OTP

import random

import uuid
from joserfc.errors import DecodeError

from flask_mail import Mail, Message

logger = logging.getLogger(__name__)

AuthBp = Blueprint("auth", __name__)


def get_remote_addr():
    route = list(reversed(request.headers.get("x-forwarded-for").split(",")))
    logger.debug(f"IP Route: {[r for r in route]}")
    trusted_proxies = []
    for proxy in current_app.vigision_config.auth.trusted_proxies:
        try:
            network = ipaddress.ip_network(proxy)
        except ValueError:
            logger.warn(f"Unable to parse trusted network: {proxy}")
        trusted_proxies.append(network)

    # return the first remote address that is not trusted
    for addr in route:
        ip = ipaddress.ip_address(addr.strip())
        logger.debug(f"Checking {ip} (v{ip.version})")
        trusted = False
        for trusted_proxy in trusted_proxies:
            logger.debug(
                f"Checking against trusted proxy: {trusted_proxy} (v{trusted_proxy.version})"
            )
            if trusted_proxy.version == 4:
                ipv4 = ip.ipv4_mapped if ip.version == 6 else ip
                if ipv4 in trusted_proxy:
                    trusted = True
                    logger.debug(f"Trusted: {str(ip)} by {str(trusted_proxy)}")
                    break
            elif trusted_proxy.version == 6 and ip.version == 6:
                if ip in trusted_proxy:
                    trusted = True
                    logger.debug(f"Trusted: {str(ip)} by {str(trusted_proxy)}")
                    break
        if trusted:
            logger.debug(f"{ip} is trusted")
            continue
        else:
            logger.debug(f"First untrusted IP: {str(ip)}")
            return str(ip)

    # if there wasn't anything in the route, just return the default
    return request.remote_addr or "127.0.0.1"


limiter = Limiter(
    get_remote_addr,
    storage_uri="memory://",
)


def get_rate_limit():
    return current_app.vigision_config.auth.failed_login_rate_limit


def get_jwt_secret() -> str:
    jwt_secret = None
    # check env var
    if JWT_SECRET_ENV_VAR in os.environ:
        logger.debug(
            f"Using jwt secret from {JWT_SECRET_ENV_VAR} environment variable."
        )
        jwt_secret = os.environ.get(JWT_SECRET_ENV_VAR)
    # check docker secrets
    elif os.path.isfile(os.path.join("/run/secrets", JWT_SECRET_ENV_VAR)):
        logger.debug(f"Using jwt secret from {JWT_SECRET_ENV_VAR} docker secret file.")
        jwt_secret = Path(os.path.join("/run/secrets", JWT_SECRET_ENV_VAR)).read_text()
    # check for the addon options file
    elif os.path.isfile("/data/options.json"):
        with open("/data/options.json") as f:
            raw_options = f.read()
        logger.debug("Using jwt secret from Home Assistant addon options file.")
        options = json.loads(raw_options)
        jwt_secret = options.get("jwt_secret")

    if jwt_secret is None:
        jwt_secret_file = os.path.join(CONFIG_DIR, ".jwt_secret")
        # check .jwt_secrets file
        if not os.path.isfile(jwt_secret_file):
            logger.debug(
                "No jwt secret found. Generating one and storing in .jwt_secret file in config directory."
            )
            jwt_secret = secrets.token_hex(64)
            try:
                with open(jwt_secret_file, "w") as f:
                    f.write(str(jwt_secret))
            except Exception:
                logger.warn(
                    "Unable to write jwt token file to config directory. A new jwt token will be created at each startup."
                )
        else:
            logger.debug("Using jwt secret from .jwt_secret file in config directory.")
            with open(jwt_secret_file) as f:
                try:
                    jwt_secret = f.readline()
                except Exception:
                    logger.warn(
                        "Unable to read jwt token from .jwt_secret file in config directory. A new jwt token will be created at each startup."
                    )
                    jwt_secret = secrets.token_hex(64)

    if len(jwt_secret) < 64:
        logger.warn("JWT Secret is recommended to be 64 characters or more")

    return jwt_secret


def hash_password(password, salt=None, iterations=600000):
    if salt is None:
        salt = secrets.token_hex(16)
    assert salt and isinstance(salt, str) and "$" not in salt
    assert isinstance(password, str)
    pw_hash = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations
    )
    b64_hash = base64.b64encode(pw_hash).decode("ascii").strip()
    return "{}${}${}${}".format(PASSWORD_HASH_ALGORITHM, iterations, salt, b64_hash)


def verify_password(password, password_hash):
    if (password_hash or "").count("$") != 3:
        return False
    algorithm, iterations, salt, b64_hash = password_hash.split("$", 3)
    iterations = int(iterations)
    assert algorithm == PASSWORD_HASH_ALGORITHM
    compare_hash = hash_password(password, salt, iterations)
    return secrets.compare_digest(password_hash, compare_hash)


def create_encoded_jwt(user, expiration, secret):
    return jwt.encode({"alg": "HS256"}, {"sub": user, "exp": expiration}, secret)


def set_jwt_cookie(response, cookie_name, encoded_jwt, expiration, secure):
    # TODO: ideally this would set secure as well, but that requires TLS
    response.set_cookie(
        cookie_name, encoded_jwt, httponly=True, expires=expiration, secure=secure
    )

def upsert_otp(email, otp):
    try:
        OTP.insert(
            email=email,
            otp=otp,
            created_at=datetime.utcnow()
        ).execute()
    except IntegrityError:
        OTP.update(
            otp=otp,
            created_at=datetime.utcnow()
        ).where(OTP.email == email).execute()


def create_encoded_jwt2(user, expiration, secret):
    jti = str(uuid.uuid4())  # Generate a unique identifier for the token
    payload = {
        "sub": user,
        "exp": expiration,
        "jti": jti  # Add the unique identifier to the token
    }
    token = jwt.encode({"alg": "HS256"}, payload, secret)
    
    # Save the jti in the database for the user
    User.update({User.token_jti: jti}).where(User.username == user).execute()
    
    return token
# Endpoint for use with nginx auth_request
@AuthBp.route("/auth")
def auth():
    auth_config: AuthConfig = current_app.vigision_config.auth
    proxy_config: ProxyConfig = current_app.vigision_config.proxy

    success_response = make_response({}, 202)
    fail_response = make_response({}, 401)

    # Bypass authentication if the request is from the internal port (set by Nginx)
    if request.headers.get("x-server-port", 0, type=int) == 5000:
        return success_response

    # Ensure the proxy secret matches if configured
    if (
        proxy_config.auth_secret is not None
        and request.headers.get("x-proxy-secret", "", type=str)
        != proxy_config.auth_secret
    ):
        logger.debug("X-Proxy-Secret header does not match configured secret value")
        return fail_response

    # If authentication is disabled, use proxy headers or return anonymous
    if not auth_config.enabled:
        if proxy_config.header_map.user is not None:
            upstream_user_header_value = request.headers.get(
                proxy_config.header_map.user,
                type=str,
                default="anonymous",
            )
            success_response.headers["remote-user"] = upstream_user_header_value
        else:
            success_response.headers["remote-user"] = "anonymous"
        return success_response

    # JWT settings
    JWT_COOKIE_NAME = current_app.vigision_config.auth.cookie_name
    JWT_COOKIE_SECURE = current_app.vigision_config.auth.cookie_secure
    JWT_REFRESH = current_app.vigision_config.auth.refresh_time
    JWT_SESSION_LENGTH = current_app.vigision_config.auth.session_length

    # Extract the JWT from the Authorization header or cookie
    jwt_source = None
    encoded_token = None
    if "authorization" in request.headers and request.headers["authorization"].startswith("Bearer "):
        jwt_source = "authorization"
        logger.debug("Found authorization header")
        encoded_token = request.headers["authorization"].replace("Bearer ", "")
    elif JWT_COOKIE_NAME in request.cookies:
        jwt_source = "cookie"
        logger.debug("Found jwt cookie")
        encoded_token = request.cookies[JWT_COOKIE_NAME]

    if encoded_token is None:
        logger.debug("No jwt token found")
        return fail_response

    try:
        # Decode the JWT using the configured secret
        token = jwt.decode(encoded_token, current_app.jwt_token)
        if "sub" not in token.claims or "jti" not in token.claims:
            logger.debug("User or jti not set in jwt token")
            return fail_response

        user = token.claims.get("sub")
        token_jti = token.claims.get("jti")

        # Fetch the user's current jti from the database
        db_user = User.get_by_id(user)
        if db_user.token_jti != token_jti:
            logger.debug("Token jti does not match the current user session jti")
            return fail_response

        current_time = int(time.time())

        # Check if the JWT is expired
        expiration = int(token.claims.get("exp"))
        logger.debug(f"current time:   {datetime.fromtimestamp(current_time).strftime('%c')}")
        logger.debug(f"jwt expires at: {datetime.fromtimestamp(expiration).strftime('%c')}")
        logger.debug(f"jwt refresh at: {datetime.fromtimestamp(expiration - JWT_REFRESH).strftime('%c')}")

        if expiration <= current_time:
            logger.debug("jwt token expired")
            return fail_response

        # Refresh the JWT if it's expiring soon and it was sourced from a cookie
        if jwt_source == "cookie" and expiration - JWT_REFRESH <= current_time:
            logger.debug("jwt token expiring soon, refreshing cookie")
            # Ensure the user hasn't been deleted
            try:
                db_user = User.get_by_id(user)
            except DoesNotExist:
                return fail_response

            new_expiration = current_time + JWT_SESSION_LENGTH
            new_encoded_jwt = create_encoded_jwt2(db_user.username, new_expiration, current_app.jwt_token)
            set_jwt_cookie(
                success_response,
                JWT_COOKIE_NAME,
                new_encoded_jwt,
                new_expiration,
                JWT_COOKIE_SECURE,
            )

        success_response.headers["remote-user"] = user
        return success_response
    except Exception as e:
        logger.error(f"Error parsing jwt: {e}")
        return fail_response


@AuthBp.route("/api/profile")
@AuthBp.route("/profile")
def profile():
    JWT_COOKIE_NAME = current_app.vigision_config.auth.cookie_name
    encoded_token = request.cookies.get(JWT_COOKIE_NAME)
    if not encoded_token:
        return jsonify({"username": "anonymous"}), 401

    try:
        # Decode the JWT
        token = jwt.decode(encoded_token, current_app.jwt_token)

        # Access the payload from the token
        claims = token.claims

        username = claims.get("sub")
        jti = claims.get("jti")

        if not username or not jti:
            return jsonify({"username": "anonymous"}), 401

        # Fetch the user's current jti from the database
        try:
            db_user = User.get(User.username == username)
            if db_user.token_jti != jti:
                logger.debug("Token jti does not match the current user session jti")
                return jsonify({"username": "anonymous"}), 401
        except DoesNotExist:
            return jsonify({"username": "anonymous"}), 401

        return jsonify({"username": username}), 200

    except DecodeError as e:
        logger.error(f"DecodeError decoding JWT: {e}")
        return jsonify({"username": "anonymous"}), 401
    except Exception as e:
        logger.error(f"Error decoding JWT: {e}")
        return jsonify({"username": "anonymous"}), 401


def get_current_user():
    JWT_COOKIE_NAME = current_app.vigision_config.auth.cookie_name
    encoded_token = request.cookies.get(JWT_COOKIE_NAME)

    if not encoded_token:
        return None

    try:
        token = jwt.decode(encoded_token, current_app.jwt_token)
        username = token.claims.get("sub")
        if not username:
            return None

        return username
    except jwt.JWTError as e:
        logger.error(f"Error decoding JWT in get_current_user: {e}")
        return None


@AuthBp.route("/logout")
def logout():
    auth_config: AuthConfig = current_app.vigision_config.auth
    user = get_current_user()  # Implement this function to get the current logged-in user

    if user:
        User.update({User.token_jti: None}).where(User.username == user).execute()

    response = make_response(redirect("/login", code=303))
    response.delete_cookie(auth_config.cookie_name)
    return response

@AuthBp.route("/api/login", methods=["POST"])
@AuthBp.route("/login", methods=["POST"])
@limiter.limit(get_rate_limit, deduct_when=lambda response: response.status_code == 400)
def login():
    JWT_COOKIE_NAME = current_app.vigision_config.auth.cookie_name
    JWT_COOKIE_SECURE = current_app.vigision_config.auth.cookie_secure
    JWT_SESSION_LENGTH = current_app.vigision_config.auth.session_length
    content = request.get_json()
    user = content.get("user")
    password = content.get("password")

    try:
        if "@" in user:
            # Assume it's an email
            db_user = User.get(User.email == user)
        else:
            # Assume it's a username
            db_user = User.get_by_id(user)
    except DoesNotExist:
        return make_response({"message": "Login failed"}, 400)

    password_hash = db_user.password_hash
    if verify_password(password, password_hash):
        # Generate a new expiration time
        expiration = int(time.time()) + JWT_SESSION_LENGTH
        
        # Generate a new token with a new jti
        encoded_jwt = create_encoded_jwt2(db_user.username, expiration, current_app.jwt_token)
        
        # Set the new token as a cookie
        response = make_response({"token": encoded_jwt}, 200)
        set_jwt_cookie(response, JWT_COOKIE_NAME, encoded_jwt, expiration, JWT_COOKIE_SECURE)
        
        return response

    return make_response({"message": "Login failed"}, 400)



@AuthBp.route("/api/send_otp", methods=['POST'])
@AuthBp.route("/send_otp", methods=['POST'])
def send_otp():
    try:
        data = request.json
        email = data.get('email')

        otp = ''.join(random.choices('0123456789', k=6))
        message = Message('Your OTP Code', sender='noreply@example.com', recipients=[email])
        message.body = f'Your OTP code is {otp}.'

        upsert_otp(email, otp)

        current_app.mail.send(message)
        return jsonify({'message': 'OTP sent successfully'}), 200
    except Exception as e:
        print("Error:", e)
        return jsonify({'error': 'Failed to send OTP'}), 500

@AuthBp.route("/api/verify_otp", methods=['POST'])
@AuthBp.route("/verify_otp", methods=['POST'])
def verify_otp():
    try:
        data = request.json
        email = data.get('email')
        otp = data.get('otp')

        otp_entry = OTP.get(OTP.email == email)
        if not otp_entry or otp_entry.otp != otp:
            return jsonify({'error': 'Invalid or expired OTP'}), 400

        OTP.delete().where(OTP.email == email).execute()
        return jsonify({'message': 'OTP verified successfully'}), 200
    except Exception as e:
        print("Error:", e)
        return jsonify({'error': 'Failed to verify OTP'}), 500

@AuthBp.route("/api/verify_email", methods=['POST'])
@AuthBp.route("/verify_email", methods=['POST'])
def verify_email():
    try:
        data = request.json
        email = data.get('email')
        
        user = User.get(User.email == email)
        return make_response({"message": "Email exists"}, 200)
    except DoesNotExist:
        return make_response({"message": "Email does not exist"}, 404)
    except Exception as e:
        print("Error:", e)
        return jsonify({'error': 'Failed to verify email'}), 500

@AuthBp.route("/users/<username>/email", methods=['PUT'])
def update_email(username: str):
    data = request.json
    email = data.get('email')
    otp = data.get('otp')

    try:
        otp_entry = OTP.get(OTP.email == email)
        if not otp_entry or otp_entry.otp != otp:
            return jsonify({'error': 'Invalid or expired OTP'}), 400

        User.update({User.email: email, User.receive_alert: False}).where(User.username == username).execute()
        OTP.delete().where(OTP.email == email).execute()
        return jsonify({"message": "Email updated successfully"}), 200
    except DoesNotExist:
        return jsonify({"error": "User not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@AuthBp.route("/users", methods=["GET"])
def get_users():
    users = User.select().order_by(User.username)
    user_list = [
        {
            "username": user.username,
            "email": user.email,
            "receive_alert": user.receive_alert,
        }
        for user in users
    ]
    
    # Move admin to the top
    user_list = sorted(user_list, key=lambda x: (x['username'] != 'admin', x['username']))
    return jsonify(user_list)


@AuthBp.route("/users", methods=["POST"])
def create_user():
    HASH_ITERATIONS = current_app.vigision_config.auth.hash_iterations

    request_data = request.get_json()
    email = request_data.get('email', '')

    if not re.match("^[A-Za-z0-9._]+$", request_data.get("username", "")):
        return make_response({"message": "Invalid username"}, 400)

    otp = request_data.get('otp', '')
    otp_entry = OTP.get_or_none(OTP.email == email)
    if not otp_entry or otp_entry.otp != otp:
        return jsonify({'error': 'Invalid or expired OTP'}), 400

    password_hash = hash_password(request_data["password"], iterations=HASH_ITERATIONS)

    try:
        User.insert(
            {
                User.username: request_data["username"],
                User.password_hash: password_hash,
                User.email: email,
                User.receive_alert: False,  # Set default receive_alert to False
            }
        ).execute()
        OTP.delete().where(OTP.email == email).execute()
        return jsonify({"message": "User created successfully.", "user": {"username": request_data["username"], "email": email}}), 201
    except KeyError as e:
        return jsonify({"error": f"Missing key: {str(e)}"}), 400
    except Exception as e:
        if "UNIQUE constraint failed: user.username" in str(e):
            return jsonify({"error": "Username exists, creation failed."}), 400
        elif "UNIQUE constraint failed: user.email" in str(e):
            return jsonify({"error": "Email exists, creation failed."}), 400
        return jsonify({"error": str(e)}), 500



@AuthBp.route("/users/<username>", methods=["DELETE"])
def delete_user(username: str):
    User.delete_by_id(username)
    return jsonify({"success": True})


@AuthBp.route("/users/<username>/password", methods=["PUT"])
def update_password(username: str):
    HASH_ITERATIONS = current_app.vigision_config.auth.hash_iterations

    request_data = request.get_json()

    password_hash = hash_password(request_data["password"], iterations=HASH_ITERATIONS)

    User.set_by_id(
        username,
        {
            User.password_hash: password_hash,
        },
    )
    return jsonify({"success": True})

@AuthBp.route("/users/<username>/verify-password", methods=["POST"])
def verify_password_endpoint(username: str):
    content = request.get_json()
    password = content["password"]

    try:
        db_user: User = User.get_by_id(username)
        if verify_password(password, db_user.password_hash):
            return make_response({"message": "Password verified"}, 200)
        else:
            return make_response({"message": "Invalid password"}, 400)
    except DoesNotExist:
        return make_response({"message": "User not found"}, 404)
        
@AuthBp.route("/api/update_password", methods=['PUT'])
@AuthBp.route("/update_password", methods=['PUT'])
def update_forgot_password():
    data = request.json
    email = data.get('email')
    new_password = data.get('password')

    try:
        HASH_ITERATIONS = current_app.vigision_config.auth.hash_iterations
        password_hash = hash_password(new_password, iterations=HASH_ITERATIONS)

        update_count = User.update({User.password_hash: password_hash}).where(User.email == email).execute()
        if update_count == 0:
            logger.error('Failed to update password: no rows affected')
            return jsonify({'error': 'Failed to update password'}), 500

        logger.info('Password updated successfully for email: %s', email)
        return jsonify({"message": "Password updated successfully"}), 201  # Ensure 201 status code
    except DoesNotExist:
        logger.error('User not found for email: %s', email)
        return jsonify({"error": "User not found"}), 404
    except Exception as e:
        logger.error(f"Error updating password: {str(e)}")
        return jsonify({"error": str(e)}), 500


@AuthBp.route("/users/<username>/receive-alert", methods=["PUT"])
def update_receive_alert(username: str):
    data = request.json
    receive_alert = data.get('receive_alert')

    try:
        if receive_alert is None:
            raise ValueError("Missing 'receive_alert' in request data")

        User.update({User.receive_alert: receive_alert}).where(User.username == username).execute()
        user = User.get(User.username == username)  # Fetch updated user to confirm change
        return jsonify({"message": "Receive alert updated successfully", "receive_alert": user.receive_alert}), 200
    except User.DoesNotExist:
        logger.error(f"User not found: {username}")
        return jsonify({"error": "User not found"}), 404
    except Exception as e:
        logger.error(f"Error updating receive alert for user {username}: {str(e)}")
        return jsonify({"error": str(e)}), 500


@AuthBp.route('/tunnel_url', methods=['GET'])
def get_tunnel_url():
    print("Get tunnel url")
    tunnel_url = requests.get("http://host.docker.internal:4040/api/tunnels").text
    j = json.loads(tunnel_url)
    tunnel_url = j['tunnels'][0]['public_url']
    return jsonify({'tunnel_url': tunnel_url})


