# Production firewall (LAN / static-IP deployment)

Applies to the HTTPS-by-IP setup (`docker-compose.ip-https.yml`). Replace the placeholders:

| Placeholder | Example | Meaning |
|---|---|---|
| `<SERVER_IP>` | `192.168.1.50` | Server's static LAN address |
| `<IFACE>` | `eno1` | Server's LAN interface (`ip -br addr`) |
| `<OFFICE_SUBNET>` | `192.168.1.0/24` | Network(s) allowed to use the app |
| `<ADMIN_IP>` | `192.168.1.10` | The admin PC allowed to SSH |

## What is exposed (verified in the Phase 2 Docker test)

| Service | Port | Reachable from |
|---|---|---|
| nginx | 443 (HTTPS), 80 (redirect only) | `<OFFICE_SUBNET>` only (rules below) |
| SSH | 22 | `<ADMIN_IP>` only |
| Web (Next.js) 3000, API 3001, PostgreSQL 5432, Redis 6379 | — | **Nobody**: not published by Docker; internal network `eitf` only |

`docker port` on every container showed host ports **only** on nginx. Never add a `ports:` entry for
postgres, redis, api or web.

## 1. Host firewall (ufw): SSH and the host itself

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <ADMIN_IP> to any port 22 proto tcp
sudo ufw allow from <OFFICE_SUBNET> to any port 80,443 proto tcp
sudo ufw enable
sudo ufw status verbose
```

## 2. Docker-published ports: the `DOCKER-USER` chain

**Docker bypasses ufw** for ports it publishes (nginx 80/443), so ufw alone does not restrict who can
reach the app. Docker's documented place for such rules is the `DOCKER-USER` iptables chain.
`/usr/local/sbin/eitf-docker-firewall.sh`:

```bash
#!/bin/sh
# Only <OFFICE_SUBNET> may reach Docker-published ports on <IFACE>. Container egress (MSG91,
# backup bucket, OS updates) and its replies are unaffected.
set -e
iptables -N DOCKER-USER 2>/dev/null || true
iptables -F DOCKER-USER
iptables -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
iptables -A DOCKER-USER -i <IFACE> -s <OFFICE_SUBNET> -j RETURN
iptables -A DOCKER-USER -i <IFACE> -j DROP
iptables -A DOCKER-USER -j RETURN
```

Run it after Docker starts on every boot, `/etc/systemd/system/eitf-docker-firewall.service`:

```ini
[Unit]
Description=EITF HRMS: restrict Docker-published ports to the office subnet
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/eitf-docker-firewall.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo chmod 700 /usr/local/sbin/eitf-docker-firewall.sh
sudo systemctl daemon-reload && sudo systemctl enable --now eitf-docker-firewall
sudo iptables -L DOCKER-USER -n -v
```

Also set `NGINX_BIND_IP=<SERVER_IP>` in `.env.production` so nginx listens only on the LAN address.

If Docker is configured with the nftables firewall backend, express the same rules in nftables
instead; check with `docker info | grep -i firewall`.

## 3. Verify on the server (record the output)

```bash
sudo ss -tlnp | grep -E ':(22|80|443|3000|3001|5432|6379)\b'   # only 22, 80, 443
docker compose ps --format '{{.Name}} {{.Ports}}'              # only nginx has host ports
```

From an **authorized** office PC: `https://<SERVER_IP>` loads (company CA installed), and
`http://<SERVER_IP>` redirects to HTTPS.

From a machine **outside** `<OFFICE_SUBNET>` (e.g. a phone on mobile data via VPN-less path, or a
guest VLAN): ports 80/443 must time out. From any machine: 3000, 3001, 5432 and 6379 must be closed
(`nmap -Pn -p 22,80,443,3000,3001,5432,6379 <SERVER_IP>`).

## 4. Client IP and rate limits

`deploy/nginx/ip-https/eitf-hrms.conf` **replaces** `X-Forwarded-For` with the real peer address.
Do not change it back to `$proxy_add_x_forwarded_for`: LAN clients have private IPs, which the API's
default `TRUST_PROXY` trusts, so appending would let any user fake their IP and bypass the login rate
limit and the IP allow-list (reproduced and fixed in Phase 2).
