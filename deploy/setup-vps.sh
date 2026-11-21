#!/usr/bin/env bash
# Préparation d'un VPS Debian 12 / Ubuntu 24.04 LTS pour KnowList (à lancer une fois, en root).
#   bash setup-vps.sh <utilisateur> "<clé SSH publique>"
set -euo pipefail
USER_NAME="${1:?utilisateur non-root à créer, ex. knowlist}"
PUBKEY="${2:?clé SSH publique (contenu de ~/.ssh/id_ed25519.pub)}"

apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades git sqlite3 age rclone

# 1. Utilisateur non-root avec accès SSH par clé
id "$USER_NAME" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$USER_NAME"
usermod -aG sudo "$USER_NAME"
install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "/home/$USER_NAME/.ssh"
echo "$PUBKEY" > "/home/$USER_NAME/.ssh/authorized_keys"
chown "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.ssh/authorized_keys"
chmod 600 "/home/$USER_NAME/.ssh/authorized_keys"

# 2. SSH : clé uniquement, pas de root
cat > /etc/ssh/sshd_config.d/10-knowlist.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
CONF
systemctl reload ssh || systemctl reload sshd

# 3. Pare-feu : 22, 80, 443 uniquement
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# 4. Mises à jour de sécurité automatiques
dpkg-reconfigure -f noninteractive unattended-upgrades

# 5. Docker + Compose (dépôt officiel)
. /etc/os-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker "$USER_NAME"

# 6. fail2ban (échecs de connexion KnowList + SSH)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/fail2ban/knowlist.conf" ]; then
  cp "$SCRIPT_DIR/fail2ban/knowlist.conf" /etc/fail2ban/filter.d/knowlist.conf
  cp "$SCRIPT_DIR/fail2ban/knowlist.local" /etc/fail2ban/jail.d/knowlist.local
fi
systemctl enable --now fail2ban
systemctl restart fail2ban

# 7. Journaux : rotation et taille bornée
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\nMaxRetentionSec=30day\n' > /etc/systemd/journald.conf.d/knowlist.conf
systemctl restart systemd-journald

echo "✔ VPS prêt. Reconnecte-toi en SSH avec l'utilisateur « $USER_NAME » puis suis docs/installation.md."
