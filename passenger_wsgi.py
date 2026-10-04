import sys
import os

# Add the backend directory to Python path
BACKEND_DIR = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, BACKEND_DIR)

from app import create_app

application = create_app()
