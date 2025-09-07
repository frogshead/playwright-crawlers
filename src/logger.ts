export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  timestamp: string;
  level: string;
  crawler?: string;
  message: string;
  data?: any;
}

class Logger {
  private logLevel: LogLevel;
  private crawlerName: string;

  constructor(crawlerName: string = 'app', logLevel: LogLevel = LogLevel.INFO) {
    this.crawlerName = crawlerName;
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL) || logLevel;
  }

  private parseLogLevel(level?: string): LogLevel | undefined {
    if (!level) return undefined;
    
    const normalizedLevel = level.toUpperCase();
    switch (normalizedLevel) {
      case 'ERROR': return LogLevel.ERROR;
      case 'WARN': return LogLevel.WARN;
      case 'INFO': return LogLevel.INFO;
      case 'DEBUG': return LogLevel.DEBUG;
      default: return undefined;
    }
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.crawlerName}]`;
    
    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  error(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, data));
    }
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, data));
    }
  }

  // Convenience methods for common crawler operations
  crawlerStart(searchItems?: string[]): void {
    this.info('Crawler starting', { searchItems: searchItems?.length || 0 });
  }

  crawlerComplete(foundUrls: number, processedItems: number): void {
    this.info('Crawler completed', { foundUrls, processedItems });
  }

  searchStart(searchTerm: string): void {
    this.info('Starting search', { searchTerm });
  }

  searchComplete(searchTerm: string, foundUrls: number): void {
    this.info('Search completed', { searchTerm, foundUrls });
  }

  databaseOperation(operation: string, count: number): void {
    this.info('Database operation', { operation, count });
  }

  telegramNotification(url: string, success: boolean): void {
    if (success) {
      this.info('Telegram notification sent', { url });
    } else {
      this.error('Telegram notification failed', { url });
    }
  }

  browserOperation(operation: string, details?: any): void {
    this.debug('Browser operation', { operation, ...details });
  }
}

// Factory function to create loggers for different crawlers
export function createLogger(crawlerName: string, logLevel?: LogLevel): Logger {
  return new Logger(crawlerName, logLevel);
}

// Default logger for shared utilities
export const logger = createLogger('utils');