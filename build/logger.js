"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
exports.createLogger = createLogger;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(crawlerName = 'app', logLevel = LogLevel.INFO) {
        this.crawlerName = crawlerName;
        this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL) || logLevel;
    }
    parseLogLevel(level) {
        if (!level)
            return undefined;
        const normalizedLevel = level.toUpperCase();
        switch (normalizedLevel) {
            case 'ERROR': return LogLevel.ERROR;
            case 'WARN': return LogLevel.WARN;
            case 'INFO': return LogLevel.INFO;
            case 'DEBUG': return LogLevel.DEBUG;
            default: return undefined;
        }
    }
    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level}] [${this.crawlerName}]`;
        if (data) {
            return `${prefix} ${message} ${JSON.stringify(data)}`;
        }
        return `${prefix} ${message}`;
    }
    shouldLog(level) {
        return level <= this.logLevel;
    }
    error(message, data) {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(this.formatMessage('ERROR', message, data));
        }
    }
    warn(message, data) {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage('WARN', message, data));
        }
    }
    info(message, data) {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(this.formatMessage('INFO', message, data));
        }
    }
    debug(message, data) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(this.formatMessage('DEBUG', message, data));
        }
    }
    // Convenience methods for common crawler operations
    crawlerStart(searchItems) {
        this.info('Crawler starting', { searchItems: searchItems?.length || 0 });
    }
    crawlerComplete(foundUrls, processedItems) {
        this.info('Crawler completed', { foundUrls, processedItems });
    }
    searchStart(searchTerm) {
        this.info('Starting search', { searchTerm });
    }
    searchComplete(searchTerm, foundUrls) {
        this.info('Search completed', { searchTerm, foundUrls });
    }
    databaseOperation(operation, count) {
        this.info('Database operation', { operation, count });
    }
    telegramNotification(url, success) {
        if (success) {
            this.info('Telegram notification sent', { url });
        }
        else {
            this.error('Telegram notification failed', { url });
        }
    }
    browserOperation(operation, details) {
        this.debug('Browser operation', { operation, ...details });
    }
}
// Factory function to create loggers for different crawlers
function createLogger(crawlerName, logLevel) {
    return new Logger(crawlerName, logLevel);
}
// Default logger for shared utilities
exports.logger = createLogger('utils');
