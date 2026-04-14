#
import os
import json
from pathlib import Path

CONFIG_FILE = Path(__file__).parent / "env_image_name.json"

def load_config():
    # Start with environment variables (may be None)
    config = {
        "ENV_IMAGE_NAME": os.getenv("ENV_IMAGE_NAME"),
        "DB_URI": os.getenv("DB_URI"),
        "AUTH_SECRET": os.getenv("AUTH_SECRET"),
    }

    # If JSON file exists, fill missing values from it
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Use .get on config to avoid KeyError; prefer existing env var if present
            config["ENV_IMAGE_NAME"] = config.get("ENV_IMAGE_NAME") or data.get("env_image_name")
            config["DB_URI"] = config.get("DB_URI") or data.get("db_uri") or data.get("DB_URI")
            config["AUTH_SECRET"] = config.get("AUTH_SECRET") or data.get("auth_secret") or data.get("AUTH_SECRET")
        except Exception as e:
            # Print here so startup still proceeds; server.py logs more formally
            print("Config file read error:", e)

    # Debug print (you can remove or change to logging)
    print("Loaded Config:", config)
    return config

config = load_config()
