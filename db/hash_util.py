from werkzeug.security import generate_password_hash, check_password_hash


def hash_password(plain: str) -> str:
    return generate_password_hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return check_password_hash(hashed, plain)


if __name__ == "__main__":
    password = input("Enter password to hash: ").strip()
    hashed = hash_password(password)
    print(f"\nHashed: {hashed}")

    print("\n--- Verify ---")
    attempt = input("Re-enter password to verify: ").strip()
    if verify_password(attempt, hashed):
        print("Match — password is correct")
    else:
        print("No match — password is wrong")
