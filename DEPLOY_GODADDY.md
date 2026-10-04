# GoDaddy Deployment Guide — Thiruvelan Capitals

## Prerequisites

- GoDaddy cPanel access with Python App already created:
  - **Application root:** `thiruvelan`
  - **Application URL:** your domain (no path)
  - **Startup file:** `passenger_wsgi.py`
  - **Entry point:** `application`
- SSH access enabled on your GoDaddy hosting plan
- MySQL database created in cPanel → **MySQL Databases**

---

## 1. Folder Structure on the Server

After upload, your server should look like this:

```
~/thiruvelan/
├── passenger_wsgi.py        ← WSGI entry point (already created)
├── backend/
│   ├── app.py
│   ├── config.py
│   ├── models.py
│   ├── database.py
│   ├── requirements.txt
│   ├── .env                 ← you will create this on the server
│   ├── kyc/                 ← KYC photo uploads (must be writable)
│   ├── routers/
│   ├── core_functions/
│   └── schemas/
└── frontend/
    ├── index.html
    ├── dashboard.html
    ├── collect-payment.html
    └── assets/
```

---

## 2. Upload Files

### Option A — via cPanel File Manager
1. Open cPanel → **File Manager**
2. Navigate to `~/thiruvelan/`
3. Upload a ZIP of the entire project and extract it there
4. Confirm `passenger_wsgi.py` is directly inside `~/thiruvelan/` (not in a subfolder)

### Option B — via FTP (FileZilla)
1. Connect using your GoDaddy FTP credentials
2. Upload all files to `/home/<your-cpanel-user>/thiruvelan/`

### Option C — via SSH (Git)
```bash
ssh your-user@yourdomain.com
cd ~/thiruvelan
git clone https://github.com/your-repo/lending_app.git .
```

---

## 3. SSH into the Server

```bash
ssh your-cpanel-user@yourdomain.com
```

---

## 4. Activate the Virtual Environment

GoDaddy creates the venv automatically when you set up the Python App. Activate it:

```bash
source ~/virtualenv/thiruvelan/3.x/bin/activate
```

> Replace `3.x` with the Python version you selected in cPanel (e.g. `3.11`).

Confirm it's active — your prompt should show `(thiruvelan)`:

```bash
which python   # should point to ~/virtualenv/thiruvelan/...
```

---

## 5. Install Dependencies

```bash
cd ~/thiruvelan
pip install -r backend/requirements.txt
```

---

## 6. Create the `.env` File

```bash
nano ~/thiruvelan/backend/.env
```

Paste and fill in your values:

```env
# Flask / JWT
SECRET_KEY=<generate a random 32-byte hex string>
JWT_SECRET_KEY=<generate a different random 32-byte hex string>
JWT_ACCESS_TOKEN_EXPIRES_HOURS=12

# Database — use GoDaddy MySQL credentials
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_cpanel_user_dbname
DB_USER=your_cpanel_user_dbuser
DB_PASSWORD=your_db_password
```

> **Generate secure keys** by running this once on the server:
> ```bash
> python -c "import secrets; print(secrets.token_hex(32))"
> ```
> Run it twice — once for `SECRET_KEY`, once for `JWT_SECRET_KEY`.

> **DB credentials** come from cPanel → MySQL Databases. The database name and user are always prefixed with your cPanel username (e.g. `myuser_lending_db`).

Save and exit: `Ctrl+O`, `Enter`, `Ctrl+X`

---

## 7. Set Up the MySQL Database

### 7a. Create database & user in cPanel
1. cPanel → **MySQL Databases**
2. Create a new database (e.g. `lending_db` → becomes `cpaneluser_lending_db`)
3. Create a new user with a strong password
4. Add the user to the database with **All Privileges**

### 7b. Import the schema
Upload `db/lending_db_ddl.sql` to the server, then import it:

```bash
mysql -u your_db_user -p your_db_name < ~/thiruvelan/db/lending_db_ddl.sql
```

It will prompt for your DB password.

### 7c. Run the rotation_balance migration (if upgrading from an older schema)

If the database already has data (not a fresh import), run this extra migration:

```bash
mysql -u your_db_user -p your_db_name <<'SQL'
ALTER TABLE `wallet`
  ADD COLUMN IF NOT EXISTS `rotation_balance` NUMERIC(10,2) NOT NULL DEFAULT 0 AFTER `invest_balance`;
UPDATE `wallet` SET `rotation_balance` = `invest_balance` WHERE `rotation_balance` = 0;
SQL
```

---

## 8. Ensure the KYC Upload Folder is Writable

```bash
mkdir -p ~/thiruvelan/backend/kyc
chmod 755 ~/thiruvelan/backend/kyc
```

---

## 9. Verify the Configuration

```bash
cd ~/thiruvelan
python -c "
import sys; sys.path.insert(0, 'backend')
from config import Config
print('DB URI:', Config.SQLALCHEMY_DATABASE_URI)
print('KYC folder:', Config.KYC_FOLDER)
"
```

Make sure the DB URI shows your real credentials (not the defaults) and the KYC path resolves correctly.

---

## 10. Restart the Application

In cPanel:
1. Go to **Setup Python App**
2. Find your `thiruvelan` app
3. Click **Restart**

Or via SSH (if your plan supports `touch`):

```bash
touch ~/thiruvelan/tmp/restart.txt
```

---

## 11. Verify the Deployment

Open your domain in a browser. You should see the login page.

Test the API health endpoint:

```
https://yourdomain.com/api/health
```

Expected response:
```json
{"success": true, "message": "Thiruvelan Capitals API is running"}
```

---

## 12. First Login

Use the SUPER_ADMIN credentials seeded in `lending_db_ddl.sql`:

| Field | Value |
|-------|-------|
| Email | (as set in the DDL seed INSERT) |
| Password | (as set in the DDL seed INSERT) |

> **Important:** Change the default password immediately after first login via Settings.

---

## Troubleshooting

### App shows 500 / blank page
Check the Passenger error log:
```bash
cat ~/logs/thiruvelan/error.log
# or
tail -f ~/thiruvelan/logs/passenger.log
```

### ModuleNotFoundError
The venv is not active or `pip install` was run outside it. Re-activate and reinstall:
```bash
source ~/virtualenv/thiruvelan/3.x/bin/activate
pip install -r ~/thiruvelan/backend/requirements.txt
```

### Can't connect to MySQL
- Confirm DB credentials in `.env` match what cPanel shows exactly (including the `cpaneluser_` prefix)
- Test the connection: `mysql -u your_db_user -p -h localhost your_db_name`

### Static files / frontend not loading
- Confirm the `frontend/` folder is at `~/thiruvelan/frontend/` (not inside `backend/`)
- The Flask route `/frontend/<path>` serves all frontend assets — no Nginx config needed

### KYC photo uploads fail
```bash
ls -la ~/thiruvelan/backend/kyc/
# must be writable by the web process
chmod 755 ~/thiruvelan/backend/kyc/
```

---

## Updating the App

```bash
ssh your-user@yourdomain.com
cd ~/thiruvelan
git pull origin main   # or re-upload changed files

source ~/virtualenv/thiruvelan/3.x/bin/activate
pip install -r backend/requirements.txt   # only if requirements changed

# Restart via cPanel → Setup Python App → Restart
touch ~/thiruvelan/tmp/restart.txt
```
