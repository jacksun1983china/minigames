#!/usr/bin/env python3
"""Create production environment file on server"""
import os

env_content = """DATABASE_URL=mysql://minigame_user:MinigameHub2024@127.0.0.1:3306/minigame_hub
NODE_ENV=production
PORT=3001
JWT_SECRET=novaplay_jwt_secret_2024_minigame_hub_secure_key_x9f2k
VITE_APP_TITLE=NOVAPLAY Minigame Hub
OWNER_OPEN_ID=admin_owner
OWNER_NAME=Admin
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=placeholder
VITE_FRONTEND_FORGE_API_KEY=placeholder
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
VITE_APP_ID=minigame-hub
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im
"""

target = "/var/www/minigame-hub/.env"
with open(target, "w") as f:
    f.write(env_content)
print(f"Created {target}")
