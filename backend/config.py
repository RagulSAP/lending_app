import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Database
    DB_HOST     = os.getenv("DB_HOST", "localhost")
    DB_PORT     = int(os.getenv("DB_PORT", 3306))
    DB_NAME     = os.getenv("DB_NAME", "lending_db")
    DB_USER     = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        "?charset=utf8mb4"
    )

    # JWT
    JWT_SECRET_KEY          = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
    JWT_ACCESS_TOKEN_EXPIRES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_HOURS", 12)) * 3600

    # App
    SECRET_KEY      = os.getenv("SECRET_KEY", "change-me-in-production")
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB upload limit
    KYC_FOLDER      = os.path.join(os.path.dirname(__file__), "kyc")

    # Reserved SYSTEM org for Super Admin
    SYSTEM_ORG_ID = "00000000-0000-0000-0000-000000000000"

    # Roles
    ROLE_SUPER_ADMIN = 0
    ROLE_ADMIN       = 1
    ROLE_MANAGER     = 2
    ROLE_STAFF       = 3
    ROLE_COLLECTOR   = 4
    ROLE_ACCOUNTANT  = 5

    ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "pdf"}
