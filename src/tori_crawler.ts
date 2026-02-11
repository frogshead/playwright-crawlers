import { chromium } from 'playwright';
import { config } from "dotenv";
import { storeDb} from './utils';
import { createLogger } from './logger';
import { startCrawlerMonitoring, completeCrawlerMonitoring, recordCrawlerMetrics, recordCrawlerError, monitor } from './monitoring';

// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;
const logger = createLogger('tori');

// Parse command line arguments
const args = process.argv.slice(2);
const openInBrowser = args.includes('--open');
const noStore = args.includes('--no-store');

// Extract search terms (non-flag arguments)
const customSearchTerms = args.filter(arg => !arg.startsWith('--'));

(async () => {
  config();
  const crawlerName = 'tori';

  // Start monitoring and system monitoring
  startCrawlerMonitoring(crawlerName);
  const systemMonitorInterval = monitor.startSystemMonitoring();

  logger.crawlerStart();

  // Default search terms
  const defaultItems = [
  'yale doorman',
  'mac mini',
  'barcelona sohva',
  'dremel',
  'ruuvi gateway',
  'esp32',
  'oskilloskooppi',
  'rasberry pi',
  'garmin edge',
  'genelec',
  'pyörän kattoteline',
  'agilent',
  'rigol',
  'tektronix',
  'lecroy',
  'sähkökitara',
  'usb äänikortti',
  'Herman Miller',
  'ruuvitag'];

  // Use custom search terms if provided, otherwise use defaults
  const items = customSearchTerms.length > 0 ? customSearchTerms : defaultItems;

  if (customSearchTerms.length > 0) {
    logger.info('Using custom search terms', { terms: customSearchTerms, count: customSearchTerms.length });
  } else {
    logger.info('Using default search terms', { count: defaultItems.length });
  }


  const urls: string[] =  [];

  for await (const item of items) {
    const i = await searchItems(item);
    logger.searchComplete(item, i.length);
    recordCrawlerMetrics(crawlerName, item, i.length);
    urls.push(...i)
  }

  logger.crawlerComplete(urls.length, items.length);
  await storeDb(urls, openInBrowser, noStore);

  // Complete monitoring
  completeCrawlerMonitoring(crawlerName);
  clearInterval(systemMonitorInterval);
})();



async function searchItems(items:string): Promise<string[]> {
  logger.browserOperation('launch', { headless: HEADLESS });
  const browser = await chromium.launch({headless: HEADLESS});
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
    } catch (error) {
      // Try alternative cookie consent approaches
      try {
        await page.click('text=Hyväksy kaikki evästeet', { timeout: 2000 });
      } catch (e) {
        logger.debug("Cookie consent handled or not needed");
      }
    }
    
    // Wait for content to load
    await page.waitForTimeout(5000);
    
    // Extract all links that look like tori listings - updated pattern for new website structure
    let urls: string[] = [];

    try {
      urls = await page.$$eval('a[href*="/recommerce/forsale/item/"]', (elements) =>
        elements.map((el) => el.href)
          .filter((href) => href && href.includes('tori.fi/recommerce/forsale/item/'))
          .slice(0, 10) // Limit to first 10 results
      );
    } catch (error) {
      logger.debug("No /recommerce/forsale/item/ links found, trying alternative patterns");

      // Try fallback pattern
      try {
        urls = await page.$$eval('a[href]', (elements) =>
          elements.map((el) => el.href)
            .filter((href) =>
              href &&
              href.includes('tori.fi') &&
              (href.includes('/recommerce/forsale/item/') || href.match(/\/\d+$/))
            )
            .slice(0, 10)
        );
      } catch (e) {
        logger.warn("No tori.fi listing links found using any pattern");
      }
    }
    
    logger.debug(`Found URLs for search term`, { searchTerm: items, count: urls.length });
    await browser.close();
    logger.browserOperation('close');
    return urls;
    
  } catch (error) {
    logger.error(`Error processing search term`, { searchTerm: items, error: error instanceof Error ? error.message : error });
    recordCrawlerError('tori', error instanceof Error ? error.message : String(error));
    await browser.close();
    return [];
  }
}
