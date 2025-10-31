"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordCrawlerError = exports.recordCrawlerMetrics = exports.completeCrawlerMonitoring = exports.startCrawlerMonitoring = exports.monitor = void 0;
const logger_1 = require("./logger");
class CrawlerMonitor {
    constructor() {
        this.metrics = new Map();
        this.systemMetrics = [];
        this.MAX_SYSTEM_METRICS = 100; // Keep last 100 system metrics
    }
    startCrawler(crawlerName) {
        const metrics = {
            crawlerName,
            startTime: new Date(),
            searchTermsProcessed: 0,
            totalUrlsFound: 0,
            newUrlsAdded: 0,
            errors: 0,
            telegramNotificationsSent: 0,
            telegramNotificationsFailed: 0
        };
        this.metrics.set(crawlerName, metrics);
        logger_1.logger.info('Crawler monitoring started', { crawlerName, startTime: metrics.startTime });
    }
    completeCrawler(crawlerName) {
        const metrics = this.metrics.get(crawlerName);
        if (metrics) {
            metrics.endTime = new Date();
            metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
            logger_1.logger.info('Crawler monitoring completed', {
                crawlerName,
                duration: metrics.duration,
                searchTermsProcessed: metrics.searchTermsProcessed,
                totalUrlsFound: metrics.totalUrlsFound,
                newUrlsAdded: metrics.newUrlsAdded,
                errors: metrics.errors,
                successRate: metrics.errors > 0 ?
                    ((metrics.searchTermsProcessed - metrics.errors) / metrics.searchTermsProcessed * 100).toFixed(2) + '%' : '100%'
            });
        }
    }
    recordSearchComplete(crawlerName, searchTerm, urlsFound) {
        const metrics = this.metrics.get(crawlerName);
        if (metrics) {
            metrics.searchTermsProcessed++;
            metrics.totalUrlsFound += urlsFound;
        }
    }
    recordError(crawlerName, error) {
        const metrics = this.metrics.get(crawlerName);
        if (metrics) {
            metrics.errors++;
        }
        logger_1.logger.error('Crawler error recorded', { crawlerName, error });
    }
    recordNewUrls(crawlerName, newUrls) {
        const metrics = this.metrics.get(crawlerName);
        if (metrics) {
            metrics.newUrlsAdded += newUrls;
        }
    }
    recordTelegramNotification(crawlerName, success) {
        const metrics = this.metrics.get(crawlerName);
        if (metrics) {
            if (success) {
                metrics.telegramNotificationsSent++;
            }
            else {
                metrics.telegramNotificationsFailed++;
            }
        }
    }
    captureSystemMetrics() {
        const systemMetrics = {
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            timestamp: new Date()
        };
        this.systemMetrics.push(systemMetrics);
        // Keep only the last MAX_SYSTEM_METRICS entries
        if (this.systemMetrics.length > this.MAX_SYSTEM_METRICS) {
            this.systemMetrics = this.systemMetrics.slice(-this.MAX_SYSTEM_METRICS);
        }
        return systemMetrics;
    }
    getCrawlerMetrics(crawlerName) {
        return this.metrics.get(crawlerName);
    }
    getAllCrawlerMetrics() {
        return Array.from(this.metrics.values());
    }
    getSystemMetrics() {
        return [...this.systemMetrics];
    }
    getLatestSystemMetrics() {
        return this.systemMetrics[this.systemMetrics.length - 1];
    }
    // Health check method
    getHealthStatus() {
        const latestSystemMetrics = this.getLatestSystemMetrics();
        const allCrawlerMetrics = this.getAllCrawlerMetrics();
        if (!latestSystemMetrics) {
            return { status: 'warning', details: { message: 'No system metrics available' } };
        }
        const memoryUsageMB = latestSystemMetrics.memoryUsage.heapUsed / 1024 / 1024;
        const criticalMemoryThreshold = 512; // 512MB
        const warningMemoryThreshold = 256; // 256MB
        let status = 'healthy';
        const details = {
            memoryUsageMB: Math.round(memoryUsageMB),
            uptime: Math.round(latestSystemMetrics.uptime),
            activeCrawlers: allCrawlerMetrics.filter(m => !m.endTime).length
        };
        if (memoryUsageMB > criticalMemoryThreshold) {
            status = 'critical';
            details.memoryWarning = 'Memory usage is critically high';
        }
        else if (memoryUsageMB > warningMemoryThreshold) {
            status = 'warning';
            details.memoryWarning = 'Memory usage is elevated';
        }
        // Check for recent errors
        const recentErrors = allCrawlerMetrics
            .filter(m => m.errors > 0 && m.endTime && (Date.now() - m.endTime.getTime() < 3600000)) // Last hour
            .length;
        if (recentErrors > 0) {
            details.recentErrors = recentErrors;
            if (status === 'healthy')
                status = 'warning';
        }
        return { status, details };
    }
    // Periodic system monitoring
    startSystemMonitoring(intervalMs = 60000) {
        const interval = setInterval(() => {
            const metrics = this.captureSystemMetrics();
            const health = this.getHealthStatus();
            logger_1.logger.debug('System metrics captured', {
                memoryUsageMB: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
                uptime: Math.round(metrics.uptime),
                healthStatus: health.status
            });
            if (health.status !== 'healthy') {
                logger_1.logger.warn('System health warning', health.details);
            }
        }, intervalMs);
        return interval;
    }
}
// Singleton instance
exports.monitor = new CrawlerMonitor();
// Export helper functions for easy use in crawlers
function startCrawlerMonitoring(crawlerName) {
    exports.monitor.startCrawler(crawlerName);
}
exports.startCrawlerMonitoring = startCrawlerMonitoring;
function completeCrawlerMonitoring(crawlerName) {
    exports.monitor.completeCrawler(crawlerName);
}
exports.completeCrawlerMonitoring = completeCrawlerMonitoring;
function recordCrawlerMetrics(crawlerName, searchTerm, urlsFound, newUrls) {
    exports.monitor.recordSearchComplete(crawlerName, searchTerm, urlsFound);
    if (newUrls !== undefined) {
        exports.monitor.recordNewUrls(crawlerName, newUrls);
    }
}
exports.recordCrawlerMetrics = recordCrawlerMetrics;
function recordCrawlerError(crawlerName, error) {
    exports.monitor.recordError(crawlerName, error);
}
exports.recordCrawlerError = recordCrawlerError;
