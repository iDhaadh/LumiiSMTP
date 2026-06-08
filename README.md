# Lumii SMTP

A self-hosted, production-ready SMTP relay platform similar to SMTP2GO. Send transactional and marketing emails through your own infrastructure with full deliverability tooling, analytics, and a web dashboard.

## Features

- Custom SMTP server on ports 25, 465 (SSL), and 587 (STARTTLS)
- API key + SMTP credential authentication
- BullMQ-based email queue with retry logic (exponential backoff)
- Per-domain DKIM signing, SPF/DMARC verification
- Open and click tracking
- Bounce and spam-complaint handling with automatic suppression
- REST API for programmatic sending
- Multi-tenant: isolated API keys, domains, and logs per account
- React dashboard with analytics

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 20+ (for local development)

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env with your values
```

### 2. Start all services

```bash
docker compose up -d
```

### 3. Run database migrations

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed
```

### 4. Access the dashboard

Open [http://localhost:5173](http://localhost:5173)

Default admin credentials (seeded):
- Email: `admin@localhost`
- Password: `admin123` (change immediately)

---

## Local Development (without Docker)

```bash
# Start Postgres and Redis only
docker compose up -d postgres redis

# Backend
cd backend
npm install
cp ../.env.example .env  # adjust DATABASE_URL/REDIS_URL to localhost
npx prisma migrate dev
npm run dev

# Worker (separate terminal)
npm run worker

# Frontend
cd ../frontend
npm install
npm run dev
```

---

## REST API

Base URL: `http://localhost:3000/api/v1`

All requests require: `Authorization: Bearer <api_key>`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/email/send` | Send single or batch email |
| GET | `/email/logs` | Retrieve send logs |
| GET | `/email/stats` | Delivery/open/bounce stats |
| POST | `/domains` | Add a sender domain |
| GET | `/domains/verify` | Check SPF/DKIM/DMARC |
| POST | `/webhooks` | Register webhook |
| DELETE | `/webhooks/:id` | Remove webhook |
| POST | `/apikeys` | Create API key |
| GET | `/apikeys` | List API keys |
| DELETE | `/apikeys/:id` | Revoke API key |

---

## DNS Configuration

For each sender domain, add these DNS records:

### SPF
```
TXT @ "v=spf1 ip4:<your-server-ip> ~all"
```

### DKIM
Generate via dashboard → Domains → your domain → Generate DKIM.
Add the provided TXT record to your DNS.

### DMARC
```
TXT _dmarc "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"
```

### Return-Path (MX for bounces)
```
MX bounces.yourdomain.com 10 <your-server-ip>
```

---

## Architecture

```
[Client SMTP/API] → [SMTP Server / Express API]
                          ↓
                    [BullMQ Queue]
                          ↓
                    [Email Worker]
                      ↙       ↘
               [MX Lookup]  [DKIM Sign]
                          ↓
                  [Destination MX Server]
                          ↓
              [Bounce/Event Tracking → DB → Webhooks]
```

---

## Environment Variables

See [.env.example](.env.example) for all available variables.

---

## Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Obtain a TLS certificate (Let's Encrypt) and set `SMTP_TLS_CERT`/`SMTP_TLS_KEY`
3. Configure your server's firewall to allow ports 25, 465, 587, 3000, 5173
4. Update `TRACKING_DOMAIN` to a real domain pointing to your server
5. `docker compose -f docker-compose.yml up -d`
