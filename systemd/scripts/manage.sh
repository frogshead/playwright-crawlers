#!/bin/bash
# Playwright Crawlers Management Script

CRAWLERS=("tori" "mol" "fillaritori" "duunitori" "tavastia" "krapinpaja" "theseus")
CONTAINER_REGISTRY="ghcr.io/frogshead/playwright-crawlers"

show_usage() {
    echo "Playwright Crawlers Management Tool"
    echo "Usage: $0 {status|start|stop|restart|logs|update|test|help}"
    echo ""
    echo "Commands:"
    echo "  status   - Show status of all crawler timers and services"
    echo "  start    - Start all crawler timers"
    echo "  stop     - Stop all crawler timers"
    echo "  restart  - Restart all crawler timers"
    echo "  logs     - View recent logs from all crawlers"
    echo "  update   - Pull latest Docker image and restart services"
    echo "  test     - Test run a single crawler (tori by default)"
    echo "  help     - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 status              # Show current status"
    echo "  $0 logs                # View logs"
    echo "  $0 test mol            # Test run MOL crawler"
    echo "  journalctl -u 'playwright-*' -f  # Follow all crawler logs"
}

show_status() {
    echo "🔍 Playwright Crawlers Status"
    echo "============================="
    echo ""
    
    echo "📊 Timer Status:"
    for crawler in "${CRAWLERS[@]}"; do
        status=$(systemctl is-active "playwright-$crawler.timer" 2>/dev/null || echo "inactive")
        enabled=$(systemctl is-enabled "playwright-$crawler.timer" 2>/dev/null || echo "disabled")

        if [[ "$status" == "active" ]]; then
            echo "  ✅ $crawler: $status ($enabled)"
        else
            echo "  ❌ $crawler: $status ($enabled)"
        fi
    done
    
    echo ""
    echo "🎯 Target Status:"
    target_status=$(systemctl is-active playwright-crawlers.target 2>/dev/null || echo "inactive")
    target_enabled=$(systemctl is-enabled playwright-crawlers.target 2>/dev/null || echo "disabled")
    
    if [[ "$target_status" == "active" ]]; then
        echo "  ✅ playwright-crawlers.target: $target_status ($target_enabled)"
    else
        echo "  ❌ playwright-crawlers.target: $target_status ($target_enabled)"
    fi
    
    echo ""
    echo "⏱️  Next Scheduled Runs:"
    systemctl list-timers 'playwright-*.timer' --no-pager 2>/dev/null || echo "  No timers found"
    
    echo ""
    echo "🐳 Docker Image:"
    if docker images "$CONTAINER_REGISTRY" --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}" 2>/dev/null; then
        echo ""
    else
        echo "  ❌ Docker image not found locally"
    fi
}

start_crawlers() {
    echo "▶️  Starting all crawler timers..."

    for crawler in "${CRAWLERS[@]}"; do
        if systemctl start "playwright-$crawler.timer"; then
            echo "  ✅ Started $crawler crawler timer"
        else
            echo "  ❌ Failed to start $crawler crawler timer"
        fi
    done
    
    if systemctl start playwright-crawlers.target; then
        echo "  ✅ Started crawlers target"
    else
        echo "  ❌ Failed to start crawlers target"
    fi
    
    echo "✅ All crawler timers started"
}

stop_crawlers() {
    echo "⏹️  Stopping all crawler timers..."

    # Stop target first
    systemctl stop playwright-crawlers.target

    for crawler in "${CRAWLERS[@]}"; do
        if systemctl stop "playwright-$crawler.timer"; then
            echo "  ✅ Stopped $crawler crawler timer"
        else
            echo "  ❌ Failed to stop $crawler crawler timer"
        fi
    done
    
    echo "✅ All crawler timers stopped"
}

restart_crawlers() {
    echo "🔄 Restarting all crawler timers..."
    stop_crawlers
    sleep 2
    start_crawlers
}

show_logs() {
    echo "📋 Recent Crawler Logs (last 50 lines)"
    echo "======================================"
    echo ""

    # Show recent logs from all crawler services
    journalctl -u 'playwright-*.service' -n 50 --no-pager -o short-iso
    
    echo ""
    echo "💡 To follow live logs, use:"
    echo "   journalctl -u 'playwright-*' -f"
}

update_image() {
    echo "🔄 Updating Docker image..."
    
    # Pull latest image
    if docker pull "$CONTAINER_REGISTRY:latest"; then
        echo "✅ Docker image updated"
        
        # Restart all services to use new image
        echo "🔄 Restarting services to use new image..."
        restart_crawlers
        
        echo "✅ Update complete"
    else
        echo "❌ Failed to pull Docker image"
        return 1
    fi
}

test_crawler() {
    local crawler="${1:-tori}"
    
    if [[ ! " ${CRAWLERS[@]} " =~ " $crawler " ]]; then
        echo "❌ Invalid crawler name: $crawler"
        echo "Available crawlers: ${CRAWLERS[*]}"
        return 1
    fi
    
    echo "🧪 Testing $crawler crawler..."

    if systemctl start "playwright-$crawler.service"; then
        echo "✅ Test crawler started successfully"
        echo "📋 Follow logs with: journalctl -u playwright-$crawler.service -f"
    else
        echo "❌ Test crawler failed to start"
        echo "📋 Check logs with: journalctl -u playwright-$crawler.service -n 20"
        return 1
    fi
}

# Main command processing
case "$1" in
    status)
        show_status
        ;;
    start)
        start_crawlers
        ;;
    stop)
        stop_crawlers
        ;;
    restart)
        restart_crawlers
        ;;
    logs)
        show_logs
        ;;
    update)
        update_image
        ;;
    test)
        test_crawler "$2"
        ;;
    help|--help|-h)
        show_usage
        ;;
    "")
        show_usage
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_usage
        exit 1
        ;;
esac