import os
from dotenv import load_dotenv
import pymysql

load_dotenv()

host     = os.getenv("DB_HOST", "localhost")
port     = int(os.getenv("DB_PORT", 3306))
db       = os.getenv("DB_NAME", "lending_db")
user     = os.getenv("DB_USER")
password = os.getenv("DB_PASSWORD")

print(f"Connecting to {user}@{host}:{port}/{db} ...")

try:
    conn = pymysql.connect(host=host, port=port, database=db, user=user, password=password, connect_timeout=5)
    print("✅ Connection successful!")
    with conn.cursor() as cur:
        cur.execute("SELECT VERSION()")
        print(f"   MySQL version: {cur.fetchone()[0]}")
    conn.close()
except pymysql.err.OperationalError as e:
    print(f"❌ Connection failed: {e}")
