"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const dotenv_1 = require("dotenv");
const utils_1 = require("./utils");
const logger_1 = require("./logger");
const monitoring_1 = require("./monitoring");
// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;
const logger = (0, logger_1.createLogger)('tori');
(async () => {
    (0, dotenv_1.config)();
    const crawlerName = 'tori';
    // Start monitoring and system monitoring
    (0, monitoring_1.startCrawlerMonitoring)(crawlerName);
    const systemMonitorInterval = monitoring_1.monitor.startSystemMonitoring();
    logger.crawlerStart();
    const items = [
        'yale doorman',
        'barcelona sohva',
        'dremel',
        'ruuvi gateway',
        'esp32',
        'oskilloskooppi',
        'rasberry pi',
        'arduino',
        'genelec',
        'pyörän kattoteline',
        'agilent',
        'rigol',
        'tektronix',
        'lecroy',
        'sähkökitara',
        'wlan reititin',
        'Herman Miller',
        'ruuvitag'
    ];
    const urls = [];
    for await (const item of items) {
        const i = await searchItems(item);
        logger.searchComplete(item, i.length);
        (0, monitoring_1.recordCrawlerMetrics)(crawlerName, item, i.length);
        urls.push(...i);
    }
    logger.crawlerComplete(urls.length, items.length);
    await (0, utils_1.storeDb)(urls);
    // Complete monitoring
    (0, monitoring_1.completeCrawlerMonitoring)(crawlerName);
    clearInterval(systemMonitorInterval);
})();
async function searchItems(items) {
    logger.browserOperation('launch', { headless: HEADLESS });
    const browser = await playwright_1.chromium.launch({ headless: HEADLESS });
    let page = await browser.newPage();
    try {
        // Navigate directly to search results URL with shorter timeout
        const searchUrl = `https://www.tori.fi/koko_suomi?q=${encodeURIComponent(items)}`;
        logger.searchStart(items);
        await page.goto(searchUrl, { timeout: 15000 });
        // Handle cookie consent simply
        try {
            await page.click('text=Hyväksy', { timeout: 3000 });
            await page.waitForTimeout(1000);
        }
        catch (error) {
            // Try alternative cookie consent approaches
            try {
                await page.click('text=Hyväksy kaikki evästeet', { timeout: 2000 });
            }
            catch (e) {
                logger.debug("Cookie consent handled or not needed");
            }
        }
        // Wait for content to load
        await page.waitForTimeout(5000);
        // Extract all links that look like tori listings - try multiple patterns
        let urls = [];
        try {
            urls = await page.$$eval('a[href*="/vi/"]', (elements) => elements.map((el) => el.href)
                .filter((href) => href && href.includes('tori.fi/vi/'))
                .slice(0, 10) // Limit to first 10 results
            );
        }
        catch (error) {
            logger.debug("No /vi/ links found, trying alternative patterns");
            // Try other link patterns
            try {
                urls = await page.$$eval('a[href*="tori.fi"]', (elements) => elements.map((el) => el.href)
                    .filter((href) => href && href.includes('tori.fi') && href.includes('/'))
                    .slice(0, 10));
            }
            catch (e) {
                logger.warn("No tori.fi links found using any pattern");
            }
        }
        logger.debug(`Found URLs for search term`, { searchTerm: items, count: urls.length });
        await browser.close();
        logger.browserOperation('close');
        return urls;
    }
    catch (error) {
        logger.error(`Error processing search term`, { searchTerm: items, error: error instanceof Error ? error.message : error });
        (0, monitoring_1.recordCrawlerError)('tori', error instanceof Error ? error.message : String(error));
        await browser.close();
        return [];
    }
}
