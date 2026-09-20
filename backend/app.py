import os
from datetime import timedelta
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from config import Config


def create_app():
    app = Flask(__name__, static_folder=None)

    # ── Configuration ─────────────────────────────────────────────────────────
    app.config["SECRET_KEY"]                = Config.SECRET_KEY
    app.config["JWT_SECRET_KEY"]            = Config.JWT_SECRET_KEY
    app.config["JWT_ACCESS_TOKEN_EXPIRES"]  = timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRES)
    app.config["MAX_CONTENT_LENGTH"]        = Config.MAX_CONTENT_LENGTH

    # ── Extensions ────────────────────────────────────────────────────────────
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    jwt = JWTManager(app)

    @jwt.unauthorized_loader
    def unauthorized_callback(reason):
        return {"success": False, "message": "Missing or invalid token"}, 401

    @jwt.expired_token_loader
    def expired_callback(jwt_header, jwt_payload):
        return {"success": False, "message": "Token has expired"}, 401

    @jwt.invalid_token_loader
    def invalid_callback(reason):
        return {"success": False, "message": "Invalid token"}, 401

    # ── Register blueprints ───────────────────────────────────────────────────
    from routers.auth          import auth_bp
    from routers.organizations import orgs_bp
    from routers.users         import users_bp
    from routers.customers     import customers_bp
    from routers.loans         import loans_bp
    from routers.payments      import payments_bp
    from routers.expenses      import expenses_bp
    from routers.dashboard     import dashboard_bp
    from routers.reports       import reports_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(orgs_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(customers_bp)
    app.register_blueprint(loans_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(expenses_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(reports_bp)

    # ── Serve frontend static files ───────────────────────────────────────────
    frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")

    @app.route("/")
    def root():
        return send_from_directory(frontend_dir, "index.html")

    @app.route("/frontend/<path:filename>")
    def frontend_static(filename):
        return send_from_directory(frontend_dir, filename)

    # ── Health check ─────────────────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return {"success": True, "message": "LendTrack API is running"}

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
