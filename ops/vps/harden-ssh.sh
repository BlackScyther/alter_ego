#!/usr/bin/env bash
#
# Lock down SSH AFTER you have confirmed key-based login works.
#
#   - Disables password authentication (key-only login).
#   - Disables direct root login with a password (key still allowed).
#
# DANGER: If you have NOT verified that you can log in with your SSH key, this
# can lock you out of the server. Open a SECOND working SSH session before
# running this, and keep it open until you confirm a fresh login still works.
#
# Run as root:  sudo bash harden-ssh.sh

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root (e.g. 'sudo bash harden-ssh.sh')." >&2
  exit 1
fi

# Refuse to continue if no authorized key exists anywhere obvious.
if ! grep -rqsE 'ssh-(ed25519|rsa|ecdsa)' /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null; then
  echo "No SSH public keys found in authorized_keys files." >&2
  echo "Aborting to avoid locking you out. Add your key first (see bootstrap.sh)." >&2
  exit 1
fi

CONF=/etc/ssh/sshd_config.d/99-hardening.conf
echo "Writing ${CONF}"
cat >"${CONF}" <<'EOF'
# Managed by ops/vps/harden-ssh.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
EOF

echo "Validating sshd configuration"
sshd -t

echo "Restarting SSH service"
systemctl restart ssh || systemctl restart sshd

cat <<'EOF'

SSH hardening applied.
IMPORTANT: In a NEW terminal, verify you can still log in:
  ssh <user>@<server-ip>
If that fails, use your still-open session to revert:
  sudo rm /etc/ssh/sshd_config.d/99-hardening.conf && sudo systemctl restart ssh
EOF
