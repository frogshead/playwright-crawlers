# Systemd Installation for Playwright Crawlers

This directory contains systemd service and timer files for running Playwright crawlers automatically.

## Structure

```
systemd/
├── services/          # Systemd service files
│   ├── playwright-tori.service
│   ├── playwright-mol.service
│   ├── playwright-fillaritori.service
│   ├── playwright-duunitori.service
│   ├── playwright-tavastia.service
│   ├── playwright-krapinpaja.service
│   ├── playwright-theseus.service
│   └── playwright-crawlers.target
├── timers/           # Systemd timer files
│   ├── playwright-tori.timer
│   ├── playwright-mol.timer
│   ├── playwright-fillaritori.timer
│   ├── playwright-duunitori.timer
│   ├── playwright-tavastia.timer
│   ├── playwright-krapinpaja.timer
│   └── playwright-theseus.timer
├── scripts/          # Installation and management scripts
│   ├── install.sh    # Production installation script
│   └── manage.sh     # Management script for running crawlers
├── config/           # Configuration templates
│   └── production.env.template
└── deprecated/       # Old template-based files (deprecated)
```

## Available Crawlers

1. **tori** - Tori.fi marketplace crawler
2. **mol** - Tyomarkkinatori.fi (MOL) job listings crawler
3. **fillaritori** - Fillaritori.fi bicycle marketplace crawler
4. **duunitori** - Duunitori.fi job listings crawler
5. **tavastia** - Tavastia.fi crawler
6. **krapinpaja** - Krapinpaja.fi crawler
7. **theseus** - Theseus.fi crawler

## Quick Start (User Installation)

For user-level systemd services (no root required):

```bash
# 1. Copy service and timer files to user systemd directory
mkdir -p ~/.config/systemd/user
cp systemd/services/playwright-*.service ~/.config/systemd/user/
cp systemd/timers/playwright-*.timer ~/.config/systemd/user/

# 2. Reload systemd
systemctl --user daemon-reload

# 3. Enable and start specific crawlers
systemctl --user enable --now playwright-tori.timer
systemctl --user enable --now playwright-duunitori.timer

# 4. Check status
systemctl --user list-timers 'playwright-*'
```

## Production Installation (Docker)

For production deployment with Docker (requires root):

```bash
# Run the automated installation script
sudo systemd/scripts/install.sh

# Follow the prompts to configure environment variables
# The script will:
# - Create a service user
# - Set up directory structure at /opt/playwright-crawlers
# - Install systemd files
# - Pull Docker image
# - Enable and start all crawler timers

# Use the management command
playwright-crawlers status
playwright-crawlers logs
```

## Timer Schedule

All crawlers are configured to run:
- **2 minutes after boot** (OnBootSec=120)
- **Every 10 minutes thereafter** (OnUnitActiveSec=600)
- **Persistent** (catches up if system was off)

## Manual Management

### Enable a crawler timer
```bash
systemctl --user enable playwright-tori.timer
```

### Start a crawler timer
```bash
systemctl --user start playwright-tori.timer
```

### Check timer status
```bash
systemctl --user list-timers 'playwright-*'
```

### Run a crawler immediately
```bash
systemctl --user start playwright-tori.service
```

### View logs
```bash
journalctl --user -u playwright-tori.service -f
```

### Stop all crawlers
```bash
systemctl --user stop 'playwright-*.timer'
```

## Configuration

Each service file contains environment variables:
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `TELEGRAM_CHAT_ID` - Your Telegram chat ID

**Important**: Update these values in the service files before enabling them, or use environment file for production setup.

## Troubleshooting

### Check if timers are active
```bash
systemctl --user list-timers --all
```

### View service status
```bash
systemctl --user status playwright-tori.service
```

### View recent logs
```bash
journalctl --user -u 'playwright-*' -n 50
```

### Follow live logs for all crawlers
```bash
journalctl --user -u 'playwright-*' -f
```

### Reload after editing service files
```bash
systemctl --user daemon-reload
systemctl --user restart playwright-tori.timer
```

## Migration from Old Setup

The old setup used a templated service file (`playwright-crawler@.service`) with timer files named `playwright-*-crawler.timer`. These have been moved to the `deprecated/` directory.

To migrate:
1. Stop old timers: `systemctl --user stop 'playwright-*-crawler.timer'`
2. Disable old timers: `systemctl --user disable 'playwright-*-crawler.timer'`
3. Remove old files: `rm ~/.config/systemd/user/playwright-*-crawler.timer`
4. Follow the Quick Start guide above to install new files

## Notes

- All crawlers use TypeScript and run via `npx ts-node`
- Services run as oneshot (complete execution then exit)
- Timers trigger services on schedule
- Working directory is set to `/home/mikko/github/playwright-crawlers`
- Update the `WorkingDirectory` path in service files if your installation is elsewhere
