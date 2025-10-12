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

(async () => {
  config();
  const crawlerName = 'tori';

  // Start monitoring and system monitoring
  startCrawlerMonitoring(crawlerName);
  const systemMonitorInterval = monitor.startSystemMonitoring();

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
  'ruuvitag']


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
    
    // Extract all links that look like tori listings - try multiple patterns
    let urls: string[] = [];
    
    try {
      urls = await page.$$eval('a[href*="/vi/"]', (elements) => 
        elements.map((el) => el.href)
          .filter((href) => href && href.includes('tori.fi/vi/'))
          .slice(0, 10) // Limit to first 10 results
      );
    } catch (error) {
      logger.debug("No /vi/ links found, trying alternative patterns");
      
      // Try other link patterns
      try {
        urls = await page.$$eval('a[href*="tori.fi"]', (elements) => 
          elements.map((el) => el.href)
            .filter((href) => href && href.includes('tori.fi') && href.includes('/'))
            .slice(0, 10)
        );
      } catch (e) {
        logger.warn("No tori.fi links found using any pattern");
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
