import { chromium, Page, selectors, Selectors } from 'playwright';
import { config } from "dotenv";
import { storeDb} from './utils';
import { createLogger } from './logger';
import {
    startCrawlerMonitoring,
    completeCrawlerMonitoring,
    recordCrawlerMetrics,
    recordCrawlerError,
    monitor
} from './monitoring';

// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;

const logger = createLogger('fillaritori');

// Parse command line arguments
const args = process.argv.slice(2);
const openInBrowser = args.includes('--open');
const noStore = args.includes('--no-store');

(async () => {
  config();

  const crawlerName = 'fillaritori';

  // Start monitoring and system monitoring
  startCrawlerMonitoring(crawlerName);
  const systemMonitorInterval = monitor.startSystemMonitoring();

  logger.crawlerStart();

  const subcategory_urls = [
    'https://www.fillaritori.com/forum/13-kiekot/?filterByState=8', // State ==  myydään
    'https://www.fillaritori.com/forum/55-cyclocrossgravel/?filterByState=8'
  ];

  const urls: string[] = [];

  for await (const item of subcategory_urls) {
    const i = await searchItems(item);
    logger.info('Found URLs for category', { category: item, count: i.length });
    recordCrawlerMetrics(crawlerName, item, i.length);
    urls.push(...i);
  }

  logger.crawlerComplete(urls.length, subcategory_urls.length);

  await storeDb(urls, openInBrowser, noStore);

  // Complete monitoring
  completeCrawlerMonitoring(crawlerName);
  clearInterval(systemMonitorInterval);
})();



async function searchItems(url:string): Promise<string[]> {
  logger.browserOperation('launch', { headless: HEADLESS });
  const browser = await chromium.launch({headless: HEADLESS});

  try {
    let page = await browser.newPage();
    logger.debug('Navigating to URL', { url });
    await page.goto(url);

    await page.locator('button:has-text("HYVÄKSY")').click();
    logger.debug('Cookie consent accepted');

    const urls = await page.$$eval('a[href^="https://www.fillaritori.com/topic/"]', (elements) =>
      elements.map((el)=> el.href)
    );

    logger.debug('Found topic URLs', { count: urls.length });

    await browser.close();
    logger.browserOperation('close');

    return urls;
  } catch (error) {
    logger.error('Error during category search', {
      url,
      error: error instanceof Error ? error.message : error
    });
    recordCrawlerError('fillaritori', error instanceof Error ? error.message : String(error));
    await browser.close();
    return [];
  }
}
