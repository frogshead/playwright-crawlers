"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const dotenv_1 = require("dotenv");
const utils_1 = require("./utils");
const logger_1 = require("./logger");
const monitoring_1 = require("./monitoring");
// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;
const logger = (0, logger_1.createLogger)('fillaritori');
// Parse command line arguments
const args = process.argv.slice(2);
const openInBrowser = args.includes('--open');
const noStore = args.includes('--no-store');
(async () => {
    (0, dotenv_1.config)();
    const crawlerName = 'fillaritori';
    // Start monitoring and system monitoring
    (0, monitoring_1.startCrawlerMonitoring)(crawlerName);
    const systemMonitorInterval = monitoring_1.monitor.startSystemMonitoring();
    logger.crawlerStart();
    const subcategory_urls = [
        'https://www.fillaritori.com/forum/85-maasto/', // sähkö
        'https://www.fillaritori.com/forum/55-cyclocrossgravel/',
        'https://www.fillaritori.com/forum/54-maantie/'
    ];
    const urls = [];
    for await (const item of subcategory_urls) {
        const i = await searchItems(item);
        logger.info('Found URLs for category', { category: item, count: i.length });
        (0, monitoring_1.recordCrawlerMetrics)(crawlerName, item, i.length);
        urls.push(...i);
    }
    logger.crawlerComplete(urls.length, subcategory_urls.length);
    await (0, utils_1.storeDb)(urls, openInBrowser, noStore);
    // Complete monitoring
    (0, monitoring_1.completeCrawlerMonitoring)(crawlerName);
    clearInterval(systemMonitorInterval);
})();
async function searchItems(url) {
    logger.browserOperation('launch', { headless: HEADLESS });
    const browser = await playwright_1.chromium.launch({ headless: HEADLESS });
    try {
        let page = await browser.newPage();
        logger.debug('Navigating to URL', { url });
        await page.goto(url);
        await page.locator('button:has-text("HYVÄKSY")').click();
        logger.debug('Cookie consent accepted');
        const urls = await page.$$eval('a[href^="https://www.fillaritori.com/topic/"]', (elements) => elements.map((el) => el.href));
        logger.debug('Found topic URLs', { count: urls.length });
        await browser.close();
        logger.browserOperation('close');
        return urls;
    }
    catch (error) {
        logger.error('Error during category search', {
            url,
            error: error instanceof Error ? error.message : error
        });
        (0, monitoring_1.recordCrawlerError)('fillaritori', error instanceof Error ? error.message : String(error));
        await browser.close();
        return [];
    }
}
