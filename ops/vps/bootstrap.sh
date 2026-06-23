#!/usr/bin/env bash
#
# Bootstrap a fresh Ubuntu 24.04 LTS VPS into a secure, multi-project host.
#
# What it does (idempotent - safe to re-run):
#   1. Updates the OS and installs base tools.
#   2. Creates a non-root sudo user with your SSH public key.
#   3. Enables automatic security updates (unattended-upgrades).
#   4. Adds a swap file if none exists (helps small VPS instances).
#   5. Configures the ufw firewall (SSH, HTTP/HTTPS, Coolify ports).
#   6. Enables fail2ban (SSH brute-force protection).
#   7. Installs Coolify (which installs Docker) - the web panel that builds and
#      deploys your projects from Git with automatic HTTPS.
#
# Run as root on the fresh server:
#   SSH_PUBKEY="ssh-ed25519 AAAA... you@host" bash bootstrap.sh
#
# Optional environment variables:
#   DEPLOY_USER=deploy           # non-root sudo user to create
#   SSH_PUBKEY="ssh-ed25519 ..." # public key authorized for that user (and root)
#   TIMEZONE=UTC                 # system timezone
#   SWAP_SIZE=2G                 # swap file size (set to 0 to skip)
#   INSTALL_COOLIFY=1            # set to 0 to skip Coolify (manual Docker only)
#
# NOTE: This script does NOT disable SSH password login (to avoid locking you
# out before you confirm key access). Run ops/vps/harden-ssh.sh AFTERWARDS once
# you have verified you can log in with your key.

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SSH_PUBKEY="${SSH_PUBKEY:-}"
TIMEZONE="${TIMEZONE:-UTC}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
INSTALL_COOLIFY="${INSTALL_COOLIFY:-1}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m[warn] %s\033[0m\n' "$*"; }

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root (e.g. 'sudo bash bootstrap.sh')." >&2
  exit 1
fi

if ! grep -q "Ubuntu 24.04" /etc/os-release 2>/dev/null; then
  warn "This script targets Ubuntu 24.04 LTS. Detected a different OS; continuing anyway."
fi

export DEBIAN_FRONTEND=noninteractive

log "Setting timezone to ${TIMEZONE}"
timedatectl set-timezone "${TIMEZONE}" || warn "Could not set timezone."

log "Updating package lists and upgrading the system"
apt-get update -y
apt-get upgrade -y

log "Installing base packages"
apt-get install -y \
  ca-certificates curl gnupg git ufw fail2ban \
  unattended-upgrades apt-listchanges

log "Enabling automatic security updates"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades || warn "unattended-upgrades not active yet."

# --- Non-root sudo user -----------------------------------------------------
if id "${DEPLOY_USER}" &>/dev/null; then
  log "User '${DEPLOY_USER}' already exists"
else
  log "Creating sudo user '${DEPLOY_USER}'"
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
  usermod -aG sudo "${DEPLOY_USER}"
fi

if [[ -n "${SSH_PUBKEY}" ]]; then
  log "Installing SSH public key for ${DEPLOY_USER} and root"
  for home in "/home/${DEPLOY_USER}" "/root"; do
    install -d -m 700 "${home}/.ssh"
    touch "${home}/.ssh/authorized_keys"
    grep -qxF "${SSH_PUBKEY}" "${home}/.ssh/authorized_keys" \
      || echo "${SSH_PUBKEY}" >>"${home}/.ssh/authorized_keys"
    chmod 600 "${home}/.ssh/authorized_keys"
  done
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
else
  warn "No SSH_PUBKEY provided; skipping key install. Set SSH_PUBKEY before hardening SSH."
fi

# --- Swap -------------------------------------------------------------------
if [[ "${SWAP_SIZE}" != "0" ]] && ! swapon --show | grep -q .; then
  log "Creating ${SWAP_SIZE} swap file"
  fallocate -l "${SWAP_SIZE}" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
else
  log "Swap already present or disabled; skipping"
fi

# --- Firewall ---------------------------------------------------------------
log "Configuring ufw firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
if [[ "${INSTALL_COOLIFY}" == "1" ]]; then
  ufw allow 8000/tcp comment 'Coolify dashboard'
  ufw allow 6001/tcp comment 'Coolify realtime'
  ufw allow 6002/tcp comment 'Coolify terminal'
fi
ufw --force enable
ufw status verbose || true

# --- fail2ban ---------------------------------------------------------------
log "Enabling fail2ban (SSH protection)"
cat >/etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
findtime = 10m
EOF
systemctl enable --now fail2ban || warn "fail2ban not active yet."

# --- Coolify (installs Docker) ---------------------------------------------
if [[ "${INSTALL_COOLIFY}" == "1" ]]; then
  if [[ -d /data/coolify ]]; then
    log "Coolify appears to be installed already; skipping installer"
  else
    log "Installing Coolify (this also installs Docker)"
    curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
  fi
else
  log "INSTALL_COOLIFY=0: installing Docker only"
  if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
  fi
  usermod -aG docker "${DEPLOY_USER}" || true
fi

SERVER_IP="$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

log "Bootstrap complete"
cat <<EOF

Next steps:
  1. Confirm you can log in as '${DEPLOY_USER}' with your SSH key:
       ssh ${DEPLOY_USER}@${SERVER_IP}
  2. Only AFTER that works, lock down SSH (disable passwords / root login):
       sudo bash ops/vps/harden-ssh.sh
EOF

if [[ "${INSTALL_COOLIFY}" == "1" ]]; then
  cat <<EOF
  3. Open the Coolify dashboard and create the first admin account NOW
     (the first visitor becomes the owner - do this immediately):
       http://${SERVER_IP}:8000
  4. In Coolify, add your domain, then deploy this project (see doc/deploy-vps.md).
EOF
fi
