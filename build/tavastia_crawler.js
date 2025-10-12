"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const dotenv_1 = require("dotenv");
const utils_1 = require("./utils");
const logger_1 = require("./logger");
const monitoring_1 = require("./monitoring");
// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;
const logger = (0, logger_1.createLogger)('tavastia');
// Parse command line arguments
const args = process.argv.slice(2);
const openInBrowser = args.includes('--open');
const noStore = args.includes('--no-store');
(async () => {
    (0, dotenv_1.config)();
    const crawlerName = 'tavastia';
    // Start monitoring and system monitoring
    (0, monitoring_1.startCrawlerMonitoring)(crawlerName);
    const systemMonitorInterval = monitoring_1.monitor.startSystemMonitoring();
    logger.crawlerStart();
    try {
        logger.browserOperation('launch', { headless: HEADLESS });
        const browser = await playwright_1.chromium.launch({ headless: HEADLESS });
        let page = await browser.newPage();
        const url = 'https://tavastiaklubi.fi/?show_all=1';
        logger.debug('Navigating to URL', { url });
        await page.goto(url);
        const urls = await page.$$eval('.tiketti-list-item', (elements) => elements.map((el) => el.href));
        logger.info('Found event URLs', { count: urls.length });
        (0, monitoring_1.recordCrawlerMetrics)(crawlerName, 'events', urls.length);
        await (0, utils_1.storeDb)(urls, openInBrowser, noStore);
        await browser.close();
        logger.browserOperation('close');
        logger.crawlerComplete(urls.length, 1);
    }
    catch (error) {
        logger.error('Error during crawling', {
            error: error instanceof Error ? error.message : error
        });
        (0, monitoring_1.recordCrawlerError)(crawlerName, error instanceof Error ? error.message : String(error));
    }
    // Complete monitoring
    (0, monitoring_1.completeCrawlerMonitoring)(crawlerName);
    clearInterval(systemMonitorInterval);
})();
