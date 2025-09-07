import { logger } from "./logger";

export interface CrawlerMetrics {
  crawlerName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  searchTermsProcessed: number;
  totalUrlsFound: number;
  newUrlsAdded: number;
  errors: number;
  telegramNotificationsSent: number;
  telegramNotificationsFailed: number;
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
  timestamp: Date;
}

class CrawlerMonitor {
  private metrics: Map<string, CrawlerMetrics> = new Map();
  private systemMetrics: SystemMetrics[] = [];
  private readonly MAX_SYSTEM_METRICS = 100; // Keep last 100 system metrics

  startCrawler(crawlerName: string): void {
    const metrics: CrawlerMetrics = {
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
    logger.info('Crawler monitoring started', { crawlerName, startTime: metrics.startTime });
  }

  completeCrawler(crawlerName: string): void {
    const metrics = this.metrics.get(crawlerName);
    if (metrics) {
      metrics.endTime = new Date();
      metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
      
      logger.info('Crawler monitoring completed', {
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

  recordSearchComplete(crawlerName: string, searchTerm: string, urlsFound: number): void {
    const metrics = this.metrics.get(crawlerName);
    if (metrics) {
      metrics.searchTermsProcessed++;
      metrics.totalUrlsFound += urlsFound;
    }
  }

  recordError(crawlerName: string, error: string): void {
    const metrics = this.metrics.get(crawlerName);
    if (metrics) {
      metrics.errors++;
    }
    logger.error('Crawler error recorded', { crawlerName, error });
  }

  recordNewUrls(crawlerName: string, newUrls: number): void {
    const metrics = this.metrics.get(crawlerName);
    if (metrics) {
      metrics.newUrlsAdded += newUrls;
    }
  }

  recordTelegramNotification(crawlerName: string, success: boolean): void {
    const metrics = this.metrics.get(crawlerName);
    if (metrics) {
      if (success) {
        metrics.telegramNotificationsSent++;
      } else {
        metrics.telegramNotificationsFailed++;
      }
    }
  }

  captureSystemMetrics(): SystemMetrics {
    const systemMetrics: SystemMetrics = {
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

  getCrawlerMetrics(crawlerName: string): CrawlerMetrics | undefined {
    return this.metrics.get(crawlerName);
  }

  getAllCrawlerMetrics(): CrawlerMetrics[] {
    return Array.from(this.metrics.values());
  }

  getSystemMetrics(): SystemMetrics[] {
    return [...this.systemMetrics];
  }

  getLatestSystemMetrics(): SystemMetrics | undefined {
    return this.systemMetrics[this.systemMetrics.length - 1];
  }

  // Health check method
  getHealthStatus(): { status: 'healthy' | 'warning' | 'critical', details: any } {
    const latestSystemMetrics = this.getLatestSystemMetrics();
    const allCrawlerMetrics = this.getAllCrawlerMetrics();
    
    if (!latestSystemMetrics) {
      return { status: 'warning', details: { message: 'No system metrics available' } };
    }

    const memoryUsageMB = latestSystemMetrics.memoryUsage.heapUsed / 1024 / 1024;
    const criticalMemoryThreshold = 512; // 512MB
    const warningMemoryThreshold = 256;  // 256MB

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    const details: any = {
      memoryUsageMB: Math.round(memoryUsageMB),
      uptime: Math.round(latestSystemMetrics.uptime),
      activeCrawlers: allCrawlerMetrics.filter(m => !m.endTime).length
    };

    if (memoryUsageMB > criticalMemoryThreshold) {
      status = 'critical';
      details.memoryWarning = 'Memory usage is critically high';
    } else if (memoryUsageMB > warningMemoryThreshold) {
      status = 'warning';
      details.memoryWarning = 'Memory usage is elevated';
    }

    // Check for recent errors
    const recentErrors = allCrawlerMetrics
      .filter(m => m.errors > 0 && m.endTime && (Date.now() - m.endTime.getTime() < 3600000)) // Last hour
      .length;
    
    if (recentErrors > 0) {
      details.recentErrors = recentErrors;
      if (status === 'healthy') status = 'warning';
    }

    return { status, details };
  }

  // Periodic system monitoring
  startSystemMonitoring(intervalMs: number = 60000): NodeJS.Timeout {
    const interval = setInterval(() => {
      const metrics = this.captureSystemMetrics();
      const health = this.getHealthStatus();
      
      logger.debug('System metrics captured', {
        memoryUsageMB: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
        uptime: Math.round(metrics.uptime),
        healthStatus: health.status
      });

      if (health.status !== 'healthy') {
        logger.warn('System health warning', health.details);
      }
    }, intervalMs);

    return interval;
  }
}

// Singleton instance
export const monitor = new CrawlerMonitor();

// Export helper functions for easy use in crawlers
export function startCrawlerMonitoring(crawlerName: string): void {
  monitor.startCrawler(crawlerName);
}

export function completeCrawlerMonitoring(crawlerName: string): void {
  monitor.completeCrawler(crawlerName);
}

export function recordCrawlerMetrics(
  crawlerName: string,
  searchTerm: string,
  urlsFound: number,
  newUrls?: number
): void {
  monitor.recordSearchComplete(crawlerName, searchTerm, urlsFound);
  if (newUrls !== undefined) {
    monitor.recordNewUrls(crawlerName, newUrls);
  }
}

export function recordCrawlerError(crawlerName: string, error: string): void {
  monitor.recordError(crawlerName, error);
}