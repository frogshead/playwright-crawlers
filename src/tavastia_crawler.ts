import { chromium  } from "playwright";
import { config } from "dotenv";
import { storeDb } from "./utils";
import { createLogger } from "./logger";
import {
    startCrawlerMonitoring,
    completeCrawlerMonitoring,
    recordCrawlerMetrics,
    recordCrawlerError,
    monitor
} from "./monitoring";

// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;

const logger = createLogger('tavastia');

// Parse command line arguments
const args = process.argv.slice(2);
const openInBrowser = args.includes('--open');

(async () => {
    config();

    const crawlerName = 'tavastia';

    // Start monitoring and system monitoring
    startCrawlerMonitoring(crawlerName);
    const systemMonitorInterval = monitor.startSystemMonitoring();

    logger.crawlerStart();

    try {
        logger.browserOperation('launch', { headless: HEADLESS });
        const browser = await chromium.launch({headless: HEADLESS});
        let page = await browser.newPage();

        const url = 'https://tavastiaklubi.fi/?show_all=1';
        logger.debug('Navigating to URL', { url });
        await page.goto(url);

        const urls = await page.$$eval('.tiketti-list-item', (elements) => elements.map((el) => el.href));
        logger.info('Found event URLs', { count: urls.length });

        recordCrawlerMetrics(crawlerName, 'events', urls.length);

        await storeDb(urls, openInBrowser);

        await browser.close();
        logger.browserOperation('close');

        logger.crawlerComplete(urls.length, 1);
    } catch (error) {
        logger.error('Error during crawling', {
            error: error instanceof Error ? error.message : error
        });
        recordCrawlerError(crawlerName, error instanceof Error ? error.message : String(error));
    }

    // Complete monitoring
    completeCrawlerMonitoring(crawlerName);
    clearInterval(systemMonitorInterval);
})();