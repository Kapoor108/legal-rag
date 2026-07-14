#!/bin/bash
# deploy.sh — run ON THE SERVER after files are uploaded
set -e

PROJECT_DIR="/opt/antigravity"

echo "=== [1/5] Updating system packages ==="
apt-get update -y && apt-get install -y curl git

echo "=== [2/5] Installing Docker (if not present) ==="
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "Docker installed."
else
  echo "Docker already installed: $(docker --version)"
fi

echo "=== [3/5] Installing Docker Compose plugin (if not present) ==="
if ! docker compose version &>/dev/null; then
  mkdir -p /usr/local/lib/docker/cli-plugins
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  echo "Docker Compose installed."
else
  echo "Docker Compose already installed: $(docker compose version)"
fi

echo "=== [4/5] Building and starting containers ==="
cd "$PROJECT_DIR"
docker compose down --remove-orphans || true
docker compose build --no-cache
docker compose up -d

echo "=== [5/5] Verifying containers are running ==="
sleep 5
docker compose ps

echo ""
echo "✅ Deployment complete!"
echo "   App  → http://31.97.226.6:3001"
echo "   Qdrant REST → http://31.97.226.6:6333"
