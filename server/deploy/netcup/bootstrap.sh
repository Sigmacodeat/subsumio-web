#!/bin/sh
# One-time setup of a fresh netcup root server for Subsumio and Sanicura.
# Works on Debian 12/13 and Ubuntu 22.04/24.04 (netcup ships Debian 13 minimal).
# Idempotent: safe to run again. Run as root on the NEW server.
set -eu

echo "[bootstrap] Pakete aktualisieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get -y -qq upgrade
apt-get -y -qq install ca-certificates curl gnupg ufw fail2ban unattended-upgrades rsync jq htop openssh-server

echo "[bootstrap] Docker aus dem offiziellen Repository"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  # Docker publishes separate repositories for Debian and Ubuntu.
  distro="$ID"
  case "$distro" in debian | ubuntu) ;; *) echo "Nicht unterstützt: $distro" >&2; exit 1 ;; esac
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${distro} ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get -y -qq install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "[bootstrap] Container-Protokolle begrenzen (eine volle Platte hat den alten Server lahmgelegt)"
mkdir -p /etc/docker
cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
JSON
systemctl restart docker

echo "[bootstrap] Systemprotokolle begrenzen"
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' >/etc/systemd/journald.conf.d/size.conf
systemctl restart systemd-journald

echo "[bootstrap] Auslagerungsdatei 8 GB, sparsam genutzt"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 8G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
printf 'vm.swappiness=10\n' >/etc/sysctl.d/90-subsumio.conf
sysctl -q --system

echo "[bootstrap] Firewall: nur SSH, HTTP, HTTPS"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

echo "[bootstrap] SSH nur mit Schlüssel"
mkdir -p /etc/ssh/sshd_config.d
printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' >/etc/ssh/sshd_config.d/90-subsumio.conf
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true

echo "[bootstrap] Automatische Sicherheitsupdates"
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
systemctl enable --now fail2ban >/dev/null 2>&1 || true

timedatectl set-timezone UTC
mkdir -p /opt/caddy /opt/sanicura /opt/subsumio

echo "[bootstrap] fertig: $(docker --version), $(docker compose version | head -1)"
free -h | head -2
df -h / | tail -1
