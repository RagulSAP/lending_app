"""
KYC file storage helpers.
Files are saved to the KYC_FOLDER configured in Config.
"""
import os
from config import Config

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "pdf"}


def _get_extension(filename: str) -> str:
    """Extract and validate the file extension from a filename."""
    if not filename or "." not in filename:
        raise ValueError("File has no extension")
    ext = filename.rsplit(".", 1)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Invalid file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    return ext


def save_kyc_file(file, customer_id: str, proof_type: str) -> str:
    """
    Save an uploaded KYC file to disk.

    Args:
        file: A Werkzeug FileStorage object (from request.files).
        customer_id: UUID string of the customer.
        proof_type: Logical label, e.g. 'photo', 'aadhaar', 'pan'.

    Returns:
        Relative filename (no directory prefix) stored in the DB,
        e.g. 'abc123_photo.jpg'.

    Raises:
        ValueError: If the file extension is invalid.
    """
    ext = _get_extension(file.filename)
    filename = f"{customer_id}_{proof_type.lower()}.{ext}"
    os.makedirs(Config.KYC_FOLDER, exist_ok=True)
    filepath = os.path.join(Config.KYC_FOLDER, filename)
    file.save(filepath)
    return filename


def delete_kyc_file(path: str) -> None:
    """
    Delete a KYC file from disk.

    Args:
        path: Either just the filename stored in DB, or a full absolute path.
    """
    if not path:
        return
    if os.path.isabs(path):
        full_path = path
    else:
        full_path = os.path.join(Config.KYC_FOLDER, path)
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
        except OSError:
            pass  # Best-effort; log in production
