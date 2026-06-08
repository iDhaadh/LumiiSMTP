# DNS Setup Guide

Replace `yourdomain.com` with your real domain and `YOUR_SERVER_IP` with your VPS IP address.

---

## Step 1 — A Record (point domain to server)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `mail` | `YOUR_SERVER_IP` | 300 |

> This makes `mail.yourdomain.com` resolve to your server.

---

## Step 2 — SPF Record (authorize your server to send)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | `@` or `yourdomain.com` | `v=spf1 ip4:YOUR_SERVER_IP ~all` | 3600 |

If you use other mail services too:
```
v=spf1 ip4:YOUR_SERVER_IP include:_spf.google.com ~all
```

---

## Step 3 — DKIM Record (cryptographic signature)

1. Log into your dashboard → **Domains** → Add `yourdomain.com`
2. Click **Generate DKIM Keys**
3. Copy the DNS record shown (looks like `v=DKIM1; k=rsa; p=MIIBIj...`)
4. Add to DNS:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | `mail._domainkey` | `v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY` | 3600 |

---

## Step 4 — DMARC Record (policy for failing emails)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100` | 3600 |

Start with `p=none` while testing, then move to `p=quarantine` or `p=reject`.

---

## Step 5 — MX Record for bounce handling

| Type | Name | Value | Priority | TTL |
|------|------|-------|----------|-----|
| MX | `bounces` | `mail.yourdomain.com` | 10 | 3600 |

Set `BOUNCE_EMAIL=bounce@bounces.yourdomain.com` in your `.env`.

---

## Step 6 — Reverse DNS (PTR Record) — CRITICAL for deliverability

Go to your VPS provider's control panel (Hetzner, DigitalOcean, Linode etc.) and set:

```
YOUR_SERVER_IP → mail.yourdomain.com
```

This is the single most important step for not landing in spam.

---

## Step 7 — Verify everything

After DNS propagates (5–30 min), run in your dashboard:
- **Domains** → your domain → **Check DNS** button

Or test from the command line on the server:
```bash
# SPF
dig TXT yourdomain.com +short

# DKIM
dig TXT mail._domainkey.yourdomain.com +short

# DMARC
dig TXT _dmarc.yourdomain.com +short

# Reverse DNS
dig -x YOUR_SERVER_IP +short

# Test email deliverability
swaks --to test@gmail.com --from you@yourdomain.com --server mail.yourdomain.com:587 \
  --auth PLAIN --auth-user you@yourdomain.com --auth-password YOUR_API_KEY
```

---

## Deliverability checklist

- [ ] A record points to server IP
- [ ] SPF record added
- [ ] DKIM keys generated and TXT record added
- [ ] DMARC record added
- [ ] Reverse DNS (PTR) set at VPS provider
- [ ] Port 25 is open (check with VPS provider — many block it by default, you have to request it)
- [ ] Domain added and verified in dashboard
- [ ] Test email lands in inbox (not spam) at mail-tester.com

---

## Port 25 unblocking

Most VPS providers block port 25 by default to prevent spam. You need to:

- **Hetzner**: Submit a ticket requesting port 25 unblock
- **DigitalOcean**: Submit a ticket via support
- **Vultr**: Request via support ticket
- **Linode/Akamai**: Submit support ticket
- **AWS EC2**: Request via AWS support (takes 24–48h)

Until port 25 is unblocked, emails will only go out via ports 465/587 (which is fine for most use cases).
