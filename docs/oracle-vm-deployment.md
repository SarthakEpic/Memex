# Oracle Cloud Always-Free VM Deployment

This is the recommended way to run Memex as your **personal, everyday app**:
email ingestion, AI chat, notes, and the 10-minute scheduler all run on a
machine you control, with no serverless timeouts and no storage cap.

Oracle Cloud's **Always Free** tier includes ARM Ampere VMs (up to 4 OCPU /
24 GB RAM) that stay free forever — not a trial. Verify current limits on
Oracle's site before relying on them.

Total setup time: roughly 45–60 minutes. Cost: $0.

---

## 0. What you need before starting

- A GitHub account (to pull this repo onto the VM)
- A free AI provider key (recommended: [Gemini](https://aistudio.google.com/app/apikey))
- A credit/debit card for Oracle account verification (not charged on the free tier)
- ~45 minutes

Architecture on the VM:

```
Internet ──> Caddy (80/443, automatic HTTPS) ──> Memex (Next.js standalone)
                                                    │
                                          Postgres (pgdata volume)
Scheduler container ──every 10 min──> /api/cron/scheduled
```

---

## 1. Create the Oracle Cloud VM

1. Sign up at [cloud.oracle.com](https://cloud.oracle.com) and pick a home
   region close to you. **Region choice matters**: Always-Free ARM capacity
   sells out in popular regions. If step 3 fails with "out of capacity",
   either retry at off-peak hours (capacity frees up) or re-register in a
   less-loaded region.
2. Menu → **Compute → Instances → Create instance**.
3. Choose the **Ampere** shape: `VM.Standard.A1.Flex`, **2 OCPU / 12 GB RAM**
   is plenty for Memex (you can resize later; the free allowance is 4/24).
4. Operating system: **Ubuntu 22.04** (or 24.04).
5. Boot volume: **50 GB** (free-tier total).
6. Add your SSH public key (generate one locally with `ssh-keygen` if needed).
7. Create the instance and note its **public IP address**.

## 2. Open the firewall (two places)

**Oracle Security List** (cloud side): Instance details → Subnet → Security
List → Add ingress rules:

| Source    | Protocol | Port | Purpose     |
| --------- | -------- | ---- | ----------- |
| 0.0.0.0/0 | TCP      | 22   | SSH         |
| 0.0.0.0/0 | TCP      | 80   | HTTP        |
| 0.0.0.0/0 | TCP      | 443  | HTTPS       |

**Ubuntu firewall** (VM side): Oracle's Ubuntu images ship with restrictive
iptables rules. SSH in and run:

```bash
ssh ubuntu@<VM_PUBLIC_IP>

sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Point a domain at the VM

Caddy issues TLS certificates automatically, but it needs a real domain.
The free path is [DuckDNS](https://www.duckdns.org):

1. Sign in to DuckDNS with GitHub/Google and create a subdomain, e.g.
   `yourname-memex.duckdns.org`.
2. Point it at the VM's public IP (the DuckDNS dashboard does this, or run
   their update script/cron on the VM if your IP changes).
3. Verify: `ping yourname-memex.duckdns.org` resolves to the VM's IP.

## 4. Install Docker and get the code

```bash
# Docker Engine (official convenience script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # log out and back in after this

# Code
git clone https://github.com/SarthakEpic/Memex.git
cd Memex
```

## 5. Configure the environment

```bash
cp deploy/.env.example .env
nano .env
```

Fill in (see the comments in the file):

- `POSTGRES_PASSWORD` — long random password
- `MEMEX_DOMAIN` and `APP_BASE_URL` — your DuckDNS domain
- `ENCRYPTION_KEY` — generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
  (run `sudo apt-get install -y nodejs` first, or use
  `openssl rand -base64 32 | tr '+/' '-_'`)
- `CRON_SECRET` — another long random string
- `AI_PROVIDER=gemini` and `GEMINI_API_KEY`

## 6. Build and start

```bash
docker compose up -d --build
```

This builds the Memex image, starts Postgres, Caddy, the scheduler, and the
app. Caddy will obtain a certificate for your domain on first request.

Push the database schema (one-off; also after schema-changing updates):

```bash
docker compose --profile tools run --rm db-push
```

Then verify:

```bash
docker compose ps                    # all services "running/healthy"
curl https://yourname-memex.duckdns.org/api/health
```

Open the URL in a browser, create your account, and connect your inbox
(Settings → Email). For Gmail, the lowest-friction path for a personal
deployment is an **app password + IMAP** (Google account → Security →
2-Step Verification → App passwords), which avoids Google's OAuth
verification process. OAuth setup is documented in
[docs/email-oauth-setup.md](email-oauth-setup.md) if you prefer it.

## 7. Backups (do not skip)

Your notes and emails now live in the `pgdata` volume. The repo includes
[deploy/backup.sh](../deploy/backup.sh) — a `pg_dump` to `./backups/` that
keeps 14 days by default. Schedule it nightly:

```bash
chmod +x deploy/backup.sh
crontab -e
# add:
15 4 * * * cd /home/ubuntu/Memex && ./deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
```

For off-box safety, periodically copy `backups/` elsewhere (rclone to Google
Drive, `scp` to your PC, anything). A backup that only exists on the same VM
is not a backup.

## 8. Updating Memex

```bash
cd ~/Memex
git pull
docker compose up -d --build
docker compose --profile tools run --rm db-push   # only if the schema changed
```

## 9. What runs where (cheat sheet)

| Thing                 | Where                                  |
| --------------------- | -------------------------------------- |
| Web app               | `app` container (standalone Next.js)   |
| Database              | `db` container, `pgdata` volume        |
| HTTPS + proxy         | `caddy` container, ports 80/443        |
| Scheduled jobs        | `scheduler` container, every 10 min    |
| Schema push           | `db-push` tooling container (one-off)  |
| Logs                  | `docker compose logs -f app`           |
| Backups               | `deploy/backup.sh` via host crontab    |

## Troubleshooting

- **"Out of capacity" when creating the ARM VM** — retry later or pick a
  different home region; this is the most common Oracle friction point.
- **Caddy gets no certificate** — ports 80/443 must be reachable from the
  internet (both the Oracle security list *and* the VM iptables rules), and
  DNS must point at the VM. Check `docker compose logs caddy`.
- **502 from Caddy** — the app is still starting or unhealthy:
  `docker compose logs app`, `docker compose ps`.
- **Cron route returns 401** — `CRON_SECRET` in `.env` must match the one
  the scheduler container received; restart with `docker compose up -d`
  after changing it.
- **Reset everything except data**: `docker compose down` (keeps volumes),
  then `up -d --build`. Nuclear option — `docker compose down -v` **deletes
  the database volume**.
