"""
GoDaddy shared hosting WSGI entry point.
Place this file at the domain/subdomain root in cPanel.
Set the Application startup file to: passenger_wsgi.py
Set the Application Entry point to: application
Set the Python version to 3.x in cPanel Python App setup.
"""
import sys
import os

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app import app as application  # noqa: F401  (Passenger looks for 'application')
