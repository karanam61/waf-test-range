#!/bin/bash
set -eu
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y docker.io git nginx openssl curl

systemctl enable docker nginx
systemctl start docker

if [ ! -d /opt/waf-test-range/.git ]; then
  git clone https://github.com/karanam61/waf-test-range.git /opt/waf-test-range
else
  git -C /opt/waf-test-range pull
fi

mkdir -p /opt/waf-data
chmod 777 /opt/waf-data

cd /opt/waf-test-range
if ! docker build -t waf-test-range . ; then
  echo "DOCKER BUILD FAILED"
  exit 1
fi

docker rm -f waf-test-range 2>/dev/null || true
docker run -d --restart unless-stopped --name waf-test-range \
  -p 127.0.0.1:3000:3000 \
  -v /opt/waf-data:/app/var \
  -e DB_PATH=/app/var/waf.db \
  waf-test-range

sleep 5
if ! curl -sf http://127.0.0.1/health >/tmp/health.json; then
  echo "CONTAINER FAILED TO START"
  docker ps -a || true
  docker logs waf-test-range 2>&1 || true
  exit 1
fi

cat /tmp/health.json

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/waf-origin.key \
  -out /etc/ssl/certs/waf-origin.crt \
  -subj "/CN=waf1-test.my1earningtools.org" 2>/dev/null || true

cat > /etc/nginx/sites-available/waf-test-range <<'NGINX'
server {
    listen 80;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    ssl_certificate /etc/ssl/certs/waf-origin.crt;
    ssl_certificate_key /etc/ssl/private/waf-origin.key;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/waf-test-range /etc/nginx/sites-enabled/waf-test-range
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo "DEPLOY_OK"
