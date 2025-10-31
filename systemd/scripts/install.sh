#!/bin/bash
set -e

# Playwright Crawlers Production Installation Script
# This script sets up the complete production environment for running
# Playwright crawlers hourly using Docker and systemd.

INSTALL_DIR="/opt/playwright-crawlers"
SERVICE_USER="crawler"
CONTAINER_REGISTRY="ghcr.io/frogshead/playwright-crawlers"

echo "🚀 Installing Playwright Crawlers Production Environment"
echo "=================================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# Check if systemd is available
if ! systemctl --version &> /dev/null; then
    echo "❌ Systemd is not available. This script requires systemd."
    exit 1
fi

echo "✅ Prerequisites check passed"

# 1. Create service user
echo "👤 Creating service user '$SERVICE_USER'..."
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd --system --create-home --shell /bin/false "$SERVICE_USER"
    usermod -aG docker "$SERVICE_USER"
    echo "✅ User '$SERVICE_USER' created and added to docker group"
else
    echo "✅ User '$SERVICE_USER' already exists"
fi

# 2. Create directory structure
echo "📁 Creating directory structure..."
mkdir -p "$INSTALL_DIR"/{data,logs,config}
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"/{data,logs,config}
echo "✅ Directory structure created at $INSTALL_DIR"

# 3. Copy systemd service files
echo "⚙️  Installing systemd service files..."
cp "$(dirname "$0")/../services/playwright-crawler@.service" /etc/systemd/system/
cp "$(dirname "$0")/../services/playwright-crawlers.target" /etc/systemd/system/
cp "$(dirname "$0")/../timers/"*.timer /etc/systemd/system/
echo "✅ Systemd files installed"

# 4. Create environment file template if it doesn't exist
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    echo "🔧 Creating environment file template..."
    cat > "$INSTALL_DIR/.env" << 'EOF'
# Telegram Configuration (REQUIRED)
TELEGRAM_API_KEY=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here

# Application Configuration
NODE_ENV=production
LOG_LEVEL=INFO

# Optional: Custom settings
# CRAWLER_TIMEOUT=30000
# DATABASE_PATH=/app/data/tori.db
EOF
    chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
    echo "✅ Environment file template created at $INSTALL_DIR/.env"
    echo "⚠️  IMPORTANT: Edit $INSTALL_DIR/.env with your Telegram credentials!"
else
    echo "✅ Environment file already exists"
fi

# 5. Pull Docker image
echo "🐳 Pulling Docker image..."
docker pull "$CONTAINER_REGISTRY:latest"
echo "✅ Docker image pulled"

# 6. Reload systemd and enable services
echo "🔄 Reloading systemd configuration..."
systemctl daemon-reload

echo "🔧 Enabling crawler timers..."
CRAWLERS=("tori" "mol" "fillaritori" "tavastia" "krapinpaja" "theseus")
for crawler in "${CRAWLERS[@]}"; do
    systemctl enable "playwright-$crawler-crawler.timer"
    echo "  ✅ Enabled $crawler crawler timer"
done

systemctl enable playwright-crawlers.target
echo "✅ Enabled crawlers target"

# 7. Test single crawler
echo "🧪 Testing single crawler execution..."
if systemctl start "playwright-crawler@tori.service"; then
    echo "✅ Test crawler execution successful"
else
    echo "❌ Test crawler execution failed. Check logs with:"
    echo "   journalctl -u playwright-crawler@tori.service -f"
fi

# 8. Start timers
echo "▶️  Starting crawler timers..."
for crawler in "${CRAWLERS[@]}"; do
    systemctl start "playwright-$crawler-crawler.timer"
done
systemctl start playwright-crawlers.target
echo "✅ All crawler timers started"

# 9. Create management script
echo "🛠️  Installing management script..."
cp "$(dirname "$0")/manage.sh" "$INSTALL_DIR/manage.sh"
chmod +x "$INSTALL_DIR/manage.sh"
ln -sf "$INSTALL_DIR/manage.sh" /usr/local/bin/playwright-crawlers
echo "✅ Management script installed (available as 'playwright-crawlers' command)"

echo ""
echo "🎉 Installation Complete!"
echo "======================="
echo ""
echo "Next steps:"
echo "1. Edit environment file: sudo nano $INSTALL_DIR/.env"
echo "2. Add your Telegram bot token and chat ID"
echo "3. Check status: playwright-crawlers status"
echo "4. View logs: playwright-crawlers logs"
echo ""
echo "Crawler Schedule:"
echo "  📊 Tori:        Every hour at :00"
echo "  💼 MOL:         Every hour at :10"  
echo "  🛒 Fillaritori: Every hour at :20"
echo "  🎵 Tavastia:    Every hour at :30"
echo "  🔧 Krapinpaja:  Every hour at :40"
echo "  📚 Theseus:     Every hour at :50"
echo ""
echo "Management commands:"
echo "  playwright-crawlers status   # Show status of all crawlers"
echo "  playwright-crawlers start    # Start all crawlers"
echo "  playwright-crawlers stop     # Stop all crawlers"
echo "  playwright-crawlers restart  # Restart all crawlers"
echo "  playwright-crawlers logs     # View logs"
echo "  playwright-crawlers update   # Update to latest image"
echo ""