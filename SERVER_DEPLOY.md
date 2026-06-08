# Linux Server Deployment

## Requirements
- Ubuntu 22.04 / Debian 12 VPS (1 vCPU, 2 GB RAM minimum)
- A domain name (e.g. `mail.yourdomain.com`)
- Root or sudo access

---

## 1. Copy project to server

On your **Windows machine**, open a terminal in the `smtp-relay` folder and run:

```bash
# Using scp (replace with your server IP)
scp -r . root@YOUR_SERVER_IP:/opt/smtp-relay

# OR using rsync (faster for updates)
rsync -avz --exclude node_modules --exclude .git \
  . root@YOUR_SERVER_IP:/opt/smtp-relay
```

---

## 2. Run the deploy script

SSH into your server and run:

```bash
ssh root@YOUR_SERVER_IP

cd /opt/smtp-relay
chmod +x deploy.sh
bash deploy.sh mail.yourdomain.com admin@yourdomain.com
```

The script automatically:
- Installs Docker, nginx, certbot
- Opens firewall ports (22, 80, 443, 25, 465, 587)
- Gets a free Let's Encrypt SSL certificate
- Builds and starts all containers
- Seeds the admin account

---

## 3. Configure DNS

See **[DNS_SETUP.md](DNS_SETUP.md)** for full DNS instructions.

Minimum required records:

```
A     mail              YOUR_SERVER_IP
TXT   @                 v=spf1 ip4:YOUR_SERVER_IP ~all
TXT   _dmarc            v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

DKIM is generated from the dashboard after adding your domain.

---

## 4. Log in and add your sender domain

1. Open `https://mail.yourdomain.com`
2. Sign in: `admin@localhost` / `admin123`
3. **Change your password** in Settings immediately
4. Go to **Domains** → Add `yourdomain.com`
5. Click **Generate DKIM** → copy the TXT record → add to DNS
6. Click **Check DNS** after 5–10 minutes

---

## 5. Send a test email via API

```bash
curl -X POST https://mail.yourdomain.com/api/v1/email/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "you@yourdomain.com",
    "to": "test@gmail.com",
    "subject": "Test from SMTP Relay",
    "html": "<h1>It works!</h1>"
  }'
```

---

## 6. Send via SMTP (Nodemailer / any email client)

```js
const transporter = nodemailer.createTransport({
  host: 'mail.yourdomain.com',
  port: 587,
  secure: false,
  auth: {
    user: 'admin@localhost',   // your account email
    pass: 'YOUR_API_KEY'       // use your API key as password
  }
});
```

---

## Managing the server

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart all services
docker compose -f docker-compose.prod.yml restart

# Stop everything
docker compose -f docker-compose.prod.yml down

# Update (after pushing new code)
cd /opt/smtp-relay
git pull   # or rsync from Windows
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port 25 blocked | Request unblock from VPS provider |
| Emails land in spam | Set up PTR record at VPS provider |
| DKIM not verified | Wait 10 min for DNS, then click Check DNS again |
| Container won't start | `docker compose -f docker-compose.prod.yml logs backend` |
| SSL cert fails | Make sure A record points to this server before running deploy |
