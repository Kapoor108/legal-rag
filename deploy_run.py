import paramiko
import os
import stat
import sys

HOST = "31.97.226.6"
PORT = 22
USER = "root"
PASSWORD = "Jayant@110125151204"
REMOTE_DIR = "/opt/antigravity"
LOCAL_DIR = r"d:\antigravity"

EXCLUDE = {
    "node_modules", ".git", "dist", "build", "coverage",
    ".env.local", ".env", "deploy_run.py", "deploy.sh",
    "__pycache__", ".vscode", "assets"
}

def log(msg):
    print(f"  {msg}", flush=True)

def connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)
    return client

def run(ssh, cmd, desc=""):
    if desc:
        log(f">>> {desc}")
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode(errors="ignore").strip()
    err = stderr.read().decode(errors="ignore").strip()
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    return out

def upload_dir(sftp, local_path, remote_path):
    try:
        sftp.mkdir(remote_path)
    except Exception:
        pass
    for item in os.listdir(local_path):
        if item in EXCLUDE or item.startswith(".env"):
            continue
        lp = os.path.join(local_path, item)
        rp = remote_path + "/" + item
        if os.path.isdir(lp):
            upload_dir(sftp, lp, rp)
        else:
            log(f"Uploading {rp}")
            sftp.put(lp, rp)

print("\n=== [1/5] Connecting to server ===")
ssh = connect()
log("Connected.")

print("\n=== [2/5] Uploading project files ===")
sftp = ssh.open_sftp()
try:
    sftp.stat(REMOTE_DIR)
except FileNotFoundError:
    sftp.mkdir(REMOTE_DIR)

upload_dir(sftp, LOCAL_DIR, REMOTE_DIR)

# Upload .env.production as .env on the server
log("Uploading .env.production → /opt/antigravity/.env.production")
sftp.put(os.path.join(LOCAL_DIR, ".env.production"), REMOTE_DIR + "/.env.production")
sftp.close()
log("All files uploaded.")

print("\n=== [3/5] Installing Docker on server ===")
run(ssh, "apt-get update -y && apt-get install -y curl ca-certificates", "Updating apt")
run(ssh, "curl -fsSL https://get.docker.com | sh", "Installing Docker")
run(ssh, "systemctl enable docker && systemctl start docker", "Starting Docker")
run(ssh, "docker --version", "Docker version")

print("\n=== [4/5] Installing Docker Compose plugin ===")
run(ssh, """
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
""", "Installing Docker Compose")
run(ssh, "docker compose version", "Docker Compose version")

print("\n=== [5/5] Building and starting containers ===")
run(ssh, f"cd {REMOTE_DIR} && docker compose down --remove-orphans 2>/dev/null || true", "Stopping old containers")
run(ssh, f"cd {REMOTE_DIR} && docker compose build --no-cache 2>&1", "Building Docker image (this takes a few minutes)")
run(ssh, f"cd {REMOTE_DIR} && docker compose up -d 2>&1", "Starting containers")
run(ssh, f"cd {REMOTE_DIR} && docker compose ps", "Container status")

ssh.close()

print("\n✅ Deployment complete!")
print(f"   App    → http://{HOST}:3001")
print(f"   Qdrant → http://{HOST}:6333")
