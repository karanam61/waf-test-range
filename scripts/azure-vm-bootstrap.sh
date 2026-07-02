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
cd /opt/waf-test-range
docker build -t waf-test-range .
docker rm -f waf-test-range 2>/dev/null || true
docker run -d --restart unless-stopped --name waf-test-range \
  -p 127.0.0.1:3000:3000 \
  -v /opt/waf-data:/app/data \
  -e DB_PATH=/app/data/waf.db \
  waf-test-range

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/waf-origin.key \
  -out /etc/ssl/certs/waf-origin.crt \
  -subj "/CN=waf1-test.my1earningtools.org"

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

sleep 3
echo "HTTP=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/health)"
echo "HTTPS=$(curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1/health)"
