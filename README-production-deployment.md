# Production Deployment Guide

This guide covers deploying Playwright Crawlers in production using Docker containers, GitHub Actions CI/CD, and systemd services for automated hourly execution.

## Overview

The production deployment provides:
- **Automated builds** via GitHub Actions
- **Container registry** hosting on GitHub Container Registry
- **Scheduled execution** using systemd timers (hourly, staggered)
- **Process management** with systemd services
- **Centralized logging** via journald
- **Easy management** through dedicated scripts

## Architecture

```
GitHub Repository
├── GitHub Actions → Builds Docker images
├── GitHub Container Registry → Stores images
└── Linux Server
    ├── systemd timers → Schedule execution
    ├── systemd services → Run containers
    └── Docker → Execute crawlers
```

## Prerequisites

- Linux server with systemd support
- Docker installed
- Internet connectivity for pulling images
- Telegram bot token and chat ID

## Quick Installation

1. **Download installation script:**
   ```bash
   wget https://raw.githubusercontent.com/frogshead/playwright-crawlers/main/systemd/scripts/install.sh
   chmod +x install.sh
   ```

2. **Run installation (as root):**
   ```bash
   sudo ./install.sh
   ```

3. **Configure environment:**
   ```bash
   sudo nano /opt/playwright-crawlers/.env
   ```
   Add your Telegram credentials:
   ```
   TELEGRAM_API_KEY=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```

4. **Check status:**
   ```bash
   playwright-crawlers status
   ```

## Detailed Installation Steps

### 1. System Preparation

Install Docker if not already present:
```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
```

### 2. Service Installation

The installation script performs these steps:

1. **Creates service user:** `crawler` with docker group membership
2. **Sets up directories:**
   - `/opt/playwright-crawlers/` - Main application directory
   - `/opt/playwright-crawlers/data/` - Database storage
   - `/opt/playwright-crawlers/logs/` - Application logs
   - `/opt/playwright-crawlers/config/` - Configuration files

3. **Installs systemd files:**
   - Service template: `playwright-crawler@.service`
   - Target service: `playwright-crawlers.target`
   - Timer files: 6 individual crawler timers

4. **Configures execution schedule:**
   - **tori**: Every hour at :00
   - **mol**: Every hour at :10
   - **fillaritori**: Every hour at :20
   - **tavastia**: Every hour at :30
   - **krapinpaja**: Every hour at :40
   - **theseus**: Every hour at :50

### 3. Environment Configuration

Edit `/opt/playwright-crawlers/.env`:

```bash
# Required Telegram Configuration
TELEGRAM_API_KEY=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890

# Application Settings
NODE_ENV=production
LOG_LEVEL=INFO

# Optional Advanced Settings
CRAWLER_TIMEOUT=30000
DATABASE_PATH=/app/data/tori.db
```

**Getting Telegram Credentials:**

1. **Bot Token:** Message @BotFather on Telegram:
   - Send `/newbot`
   - Choose bot name and username
   - Copy the provided token

2. **Chat ID:** Send a message to your bot, then visit:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
   Find your chat ID in the response.

## Management Commands

The `playwright-crawlers` command provides complete management:

### Status Monitoring
```bash
# Show overall status
playwright-crawlers status

# View recent logs
playwright-crawlers logs

# Follow live logs
journalctl -u 'playwright-*' -f
```

### Service Control
```bash
# Start all crawlers
playwright-crawlers start

# Stop all crawlers
playwright-crawlers stop

# Restart all crawlers
playwright-crawlers restart
```

### Maintenance
```bash
# Update to latest image
playwright-crawlers update

# Test single crawler
playwright-crawlers test tori
playwright-crawlers test mol
```

## Systemd Service Details

### Service Template
Location: `/etc/systemd/system/playwright-crawler@.service`

Key features:
- Parameterized by crawler name (`%i`)
- Pulls latest image before execution
- Resource limits (1GB RAM, 1 CPU core)
- Security hardening (read-only filesystem)
- Automatic cleanup after execution

### Timer Configuration
Each crawler has a dedicated timer:
- `playwright-tori-crawler.timer`
- `playwright-mol-crawler.timer`
- `playwright-fillaritori-crawler.timer`
- `playwright-tavastia-crawler.timer`
- `playwright-krapinpaja-crawler.timer`
- `playwright-theseus-crawler.timer`

Timers include:
- Hourly execution with minute offset
- Randomized delay (0-60 seconds)
- Persistent scheduling (survives reboots)

## Monitoring and Logging

### Log Locations
- **Systemd logs:** `journalctl -u playwright-*`
- **Container logs:** Docker handles stdout/stderr
- **Application logs:** Stored in container, visible via journalctl

### Common Log Commands
```bash
# Recent logs from all crawlers
journalctl -u 'playwright-*-crawler.service' -n 50

# Live logs from specific crawler
journalctl -u 'playwright-tori-crawler.service' -f

# Logs with timestamps
journalctl -u 'playwright-*' -o short-iso

# Error logs only
journalctl -u 'playwright-*' -p err
```

### Timer Status
```bash
# List all crawler timers
systemctl list-timers 'playwright-*'

# Next scheduled runs
systemctl list-timers --all
```

## Docker Image Management

### Manual Image Operations
```bash
# Pull latest image
docker pull ghcr.io/frogshead/playwright-crawlers:latest

# List local images
docker images ghcr.io/frogshead/playwright-crawlers

# Remove old images
docker image prune -f
```

### Container Registry
Images are hosted at: `ghcr.io/frogshead/playwright-crawlers`

Available tags:
- `latest` - Latest build from main branch
- `v1.0.0` - Specific version releases
- `main` - Latest from main branch
- `dockerize` - Development branch builds

## Troubleshooting

### Common Issues

1. **Crawlers not starting:**
   ```bash
   # Check systemd status
   systemctl status playwright-crawlers.target
   
   # Check individual timer
   systemctl status playwright-tori-crawler.timer
   
   # Check service logs
   journalctl -u playwright-crawler@tori.service -n 20
   ```

2. **Docker image pull failures:**
   ```bash
   # Test Docker connectivity
   docker pull hello-world
   
   # Check image exists
   docker manifest inspect ghcr.io/frogshead/playwright-crawlers:latest
   ```

3. **Environment configuration:**
   ```bash
   # Verify environment file
   sudo cat /opt/playwright-crawlers/.env
   
   # Check file permissions
   ls -la /opt/playwright-crawlers/.env
   # Should show: -rw------- 1 crawler crawler
   ```

4. **Database issues:**
   ```bash
   # Check database file
   ls -la /opt/playwright-crawlers/data/
   
   # Database should be writable by crawler user
   sudo chown crawler:crawler /opt/playwright-crawlers/data/tori.db
   ```

### Service Debugging

Run single crawler manually:
```bash
# Test specific crawler
sudo systemctl start playwright-crawler@tori.service

# Monitor execution
journalctl -u playwright-crawler@tori.service -f
```

### Performance Monitoring

Check resource usage:
```bash
# System resources
top -p $(pgrep -f playwright-crawler)

# Docker stats
docker stats

# Disk usage
df -h /opt/playwright-crawlers/
```

## Security Considerations

### File Permissions
```bash
/opt/playwright-crawlers/
├── .env (600, crawler:crawler) - Contains secrets
├── data/ (750, crawler:crawler) - Database directory
├── logs/ (750, crawler:crawler) - Log directory
└── config/ (750, crawler:crawler) - Config directory
```

### Service Security
- Services run as non-root `crawler` user
- Containers use read-only filesystem
- Network access limited to required endpoints
- No privileged container execution

### Environment Variables
- Sensitive data in `.env` file with restricted permissions
- Never commit secrets to version control
- Use strong, unique Telegram bot tokens

## Backup and Recovery

### Database Backup
```bash
# Backup database
sudo cp /opt/playwright-crawlers/data/tori.db /backup/tori.db.$(date +%Y%m%d)

# Automated backup script
sudo crontab -e -u crawler
# Add: 0 2 * * * cp /opt/playwright-crawlers/data/tori.db /backup/tori.db.$(date +\%Y\%m\%d)
```

### Configuration Backup
```bash
# Backup entire configuration
sudo tar -czf /backup/playwright-crawlers-config.tar.gz \
  /opt/playwright-crawlers/.env \
  /etc/systemd/system/playwright-* \
  /opt/playwright-crawlers/config/
```

### Recovery
```bash
# Restore database
sudo cp /backup/tori.db.20240315 /opt/playwright-crawlers/data/tori.db
sudo chown crawler:crawler /opt/playwright-crawlers/data/tori.db

# Restart services
playwright-crawlers restart
```

## Updates and Maintenance

### Automatic Updates
The `playwright-crawlers update` command:
1. Pulls latest Docker image
2. Restarts all services
3. Verifies operation

### Manual Updates
```bash
# Update systemd files
sudo cp new-service-files/* /etc/systemd/system/
sudo systemctl daemon-reload

# Update management script
sudo cp manage.sh /opt/playwright-crawlers/
sudo chmod +x /opt/playwright-crawlers/manage.sh
```

### Health Checks
Add to crontab for automated health monitoring:
```bash
# Check every 30 minutes
*/30 * * * * /usr/local/bin/playwright-crawlers status > /dev/null 2>&1 || /usr/local/bin/playwright-crawlers restart
```

## CI/CD Pipeline

### GitHub Actions Workflow
Located at: `.github/workflows/docker.yml`

Triggers:
- Push to `main` or `dockerize` branches
- GitHub releases
- Manual workflow dispatch

Outputs:
- Multi-platform Docker images (amd64, arm64)
- Semantic versioning based on git tags
- Automatic latest tag updates

### Container Registry
Images published to GitHub Container Registry:
- Public access (no authentication required)
- Automatic cleanup of old images
- Multi-architecture support

## Support

### Log Analysis
For support requests, include:
```bash
# System information
uname -a
docker --version
systemctl --version

# Service status
playwright-crawlers status

# Recent logs
playwright-crawlers logs
```

### Common Commands Summary
```bash
# Quick status check
playwright-crawlers status

# Emergency restart
playwright-crawlers restart

# View live logs
journalctl -u 'playwright-*' -f

# Update system
playwright-crawlers update

# Test single crawler
playwright-crawlers test tori
```

This production deployment provides a robust, automated solution for running Playwright crawlers with minimal maintenance requirements and comprehensive monitoring capabilities.