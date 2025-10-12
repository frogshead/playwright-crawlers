import { chromium } from 'playwright';
import { config } from "dotenv";
import { storeDb } from './utils';
import { createLogger } from './logger';
import { startCrawlerMonitoring, completeCrawlerMonitoring, recordCrawlerMetrics, recordCrawlerError, monitor } from './monitoring';

// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;
const CRAWLER_NAME = 'duunitori';
const logger = createLogger(CRAWLER_NAME);

// Parse command line arguments
const args = process.argv.slice(2);
const openInBrowser = args.includes('--open');
const noStore = args.includes('--no-store');

// Extract search terms (non-flag arguments)
const customSearchTerms = args.filter(arg => !arg.startsWith('--'));

(async () => {
  config();

  // Start monitoring and system monitoring
  startCrawlerMonitoring(CRAWLER_NAME);
  const systemMonitorInterval = monitor.startSystemMonitoring();

  logger.crawlerStart();

  // Default search terms
  const defaultSearchTerms = [
    'ohjelmistokehittäjä',
    'developer',
    'software',
    'rust',
    'embedded',
    'sulautettu',
    'devops',
    'test automation',
    'testiautomaatio',
    'iot'
  ];

  // Use custom search terms if provided, otherwise use defaults
  const searchTerms = customSearchTerms.length > 0 ? customSearchTerms : defaultSearchTerms;

  if (customSearchTerms.length > 0) {
    logger.info('Using custom search terms', { terms: customSearchTerms, count: customSearchTerms.length });
  } else {
    logger.info('Using default search terms', { count: defaultSearchTerms.length });
  }

  const jobUrls: string[] = [];

  for await (const term of searchTerms) {
    const urls = await searchJobs(term);
    logger.searchComplete(term, urls.length);
    recordCrawlerMetrics(CRAWLER_NAME, term, urls.length);
    jobUrls.push(...urls);

    // Add delay between searches to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  logger.crawlerComplete(jobUrls.length, searchTerms.length);
  if (jobUrls.length > 0) {
    await storeDb(jobUrls, openInBrowser, noStore);
  }

  // Complete monitoring
  completeCrawlerMonitoring(CRAWLER_NAME);
  clearInterval(systemMonitorInterval);
})();

async function searchJobs(searchTerm: string): Promise<string[]> {
  logger.browserOperation('launch', { headless: HEADLESS });
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  try {
    logger.searchStart(searchTerm);

    // Navigate directly to search results URL with query parameter and Uusimaa location filter
    const searchUrl = `https://duunitori.fi/tyopaikat?alue=uusimaa&haku=${encodeURIComponent(searchTerm)}`;
    await page.goto(searchUrl, { timeout: 30000 });

    // Handle cookie consent if present
    try {
      await page.click('button:has-text("Hyväksy"), button:has-text("Hyväksyn"), button:has-text("Hyväksy kaikki")', {
        timeout: 5000
      });
      await page.waitForTimeout(1000);
      logger.debug("Cookie consent accepted");
    } catch (error) {
      logger.debug("Cookie consent handled or not needed");
    }

    // Wait for search results to load
    await page.waitForTimeout(5000);

    // Extract job listing URLs from the search results page
    let jobUrls: string[] = [];

    try {
      // Try different selectors to find job listing links within main > section
      const linkSelectors = [
        // Primary: Target links within main > section elements
        'main section a[href*="/tyopaikat/tyo/"]',
        // Alternative: Job box title links
        'main .job-box__title a',
        // Fallback: Any job listing links in main
        'main a[href*="/tyopaikat/"]',
      ];

      for (const selector of linkSelectors) {
        try {
          const links = await page.$$eval(selector, (elements) =>
            elements.map((el) => ({
              href: el.href,
              text: el.textContent?.trim() || '',
            }))
              .filter((link) =>
                link.href &&
                link.href.includes('/tyopaikat/tyo/') &&
                !link.href.includes('/lisaa_suosikkeihin')
              )
              .map(link => link.href)
          );

          if (links.length > 0) {
            jobUrls = [...jobUrls, ...links];
            logger.debug(`Found ${links.length} job links using selector: ${selector}`);
            break; // Stop after finding results with first working selector
          }
        } catch (e) {
          logger.debug(`Selector ${selector} failed, trying next`);
          // Continue to next selector
        }
      }

      // Remove duplicates
      jobUrls = [...new Set(jobUrls)];

      // Limit to 20 results per search term
      jobUrls = jobUrls.slice(0, 20);

      // If no specific job links found, try to extract any links that might be job postings
      if (jobUrls.length === 0) {
        logger.warn("No job-specific links found, trying broader search");
        try {
          const allLinks = await page.$$eval('main a', (elements) =>
            elements.map((el) => ({
              href: el.href,
              text: el.textContent?.toLowerCase().trim() || '',
            }))
            .filter(link =>
              link.href &&
              link.href.includes('duunitori.fi') &&
              link.href.includes('/tyopaikat/tyo/') &&
              !link.href.includes('/lisaa_suosikkeihin') &&
              link.text.length > 5 // Has meaningful content
            )
            .map(link => link.href)
            .slice(0, 15)
          );

          jobUrls = [...new Set(allLinks)];
          logger.debug(`Found ${jobUrls.length} potential job-related links`);
        } catch (e) {
          logger.error("Could not extract any links", { error: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (error) {
      logger.error("Error extracting job URLs", {
        searchTerm,
        error: error instanceof Error ? error.message : String(error)
      });
      recordCrawlerError(CRAWLER_NAME, error instanceof Error ? error.message : String(error));
    }

    logger.debug(`Total unique job URLs found`, { searchTerm, count: jobUrls.length });
    await browser.close();
    logger.browserOperation('close');
    return jobUrls;

  } catch (error) {
    logger.error(`Error searching for jobs`, {
      searchTerm,
      error: error instanceof Error ? error.message : String(error)
    });
    recordCrawlerError(CRAWLER_NAME, error instanceof Error ? error.message : String(error));
    await browser.close();
    return [];
  }
}
