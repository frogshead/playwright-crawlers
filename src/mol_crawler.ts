import { chromium } from 'playwright';
import { config } from "dotenv";
import { storeDb } from './utils';
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

const logger = createLogger('mol');

// Parse command line arguments
const args = process.argv.slice(2);
const openInBrowser = args.includes('--open');
const noStore = args.includes('--no-store');

(async () => {
  config();

  const crawlerName = 'mol';

  // Start monitoring and system monitoring
  startCrawlerMonitoring(crawlerName);
  const systemMonitorInterval = monitor.startSystemMonitoring();

  logger.crawlerStart();

  const searchTerms = [
    'ohjelmistokehittäjä',
    'developer',
    'software',
    'rust',
    'embedded',
    'sulautettu',
    'devops',
    'test automation',
    'testiautomaatio',
    'devops',
    'iot'

  ];

  const jobUrls: string[] = [];

  for await (const term of searchTerms) {
    const urls = await searchJobs(term);
    logger.searchComplete(term, urls.length);
    recordCrawlerMetrics(crawlerName, term, urls.length);
    jobUrls.push(...urls);

    // Add delay between searches to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  logger.crawlerComplete(jobUrls.length, searchTerms.length);

  if (jobUrls.length > 0) {
    await storeDb(jobUrls, openInBrowser, noStore);
  }

  // Complete monitoring
  completeCrawlerMonitoring(crawlerName);
  clearInterval(systemMonitorInterval);
})();

async function searchJobs(searchTerm: string): Promise<string[]> {
  logger.browserOperation('launch', { headless: HEADLESS });
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  try {
    logger.searchStart(searchTerm);

    // Navigate directly to search results URL with query parameter
    const searchUrl = `https://tyomarkkinatori.fi/henkiloasiakkaat/avoimet-tyopaikat/?ae=NOW&f=NOW&p=0&ps=30&q=${encodeURIComponent(searchTerm)}&r=01`;
    await page.goto(searchUrl, { timeout: 30000 });

    // Handle cookie consent if present
    try {
      await page.click('button:has-text("Hyväksy"), button:has-text("Hyväksyn"), text=Hyväksy', {
        timeout: 5000
      });
      await page.waitForTimeout(1000);
    } catch (error) {
      logger.debug("Cookie consent handled or not needed");
    }

    // Wait for search results to load
    await page.waitForTimeout(8000);

    // Debug: Check for search results containers
    const tmtSearchResults = await page.$('.tmt-haku-search-results-list');
    const switchableResults = await page.$('.SwitchableLayoutSearchResultsList');

    if (tmtSearchResults) {
      logger.debug('Found tmt-haku-search-results-list container');
    } else if (switchableResults) {
      logger.debug('Found SwitchableLayoutSearchResultsList container');
    } else {
      logger.debug('Neither search results container found, trying alternative selectors');
    }
    
    // Extract job listing URLs from the search results page
    let jobUrls: string[] = [];
    
    try {
      // Try different selectors to find job listing links
      const linkSelectors = [
        // Primary: Target job links inside h3 elements within the search results
        '.tmt-haku-search-results-list h3 a',
        
      ];
      
      for (const selector of linkSelectors) {
        try {
          const links = await page.$$eval(selector, (elements) => 
            elements.map((el) => ({
              href: el.href,
              text: el.textContent?.trim() || '',
              title: el.getAttribute('title') || ''
            }))
              .filter((link) => link.href && (
                link.href.includes('tyopaikka') || 
                link.href.includes('job') || 
                link.href.includes('vacancy') ||
                link.href.includes('avoin') ||
                // Additional filters for job-like content
                link.text.length > 5 || link.title.length > 5
              ))
              .map(link => link.href)
              .slice(0, 20) // Limit results per search term
          );
          
          if (links.length > 0) {
            jobUrls = [...jobUrls, ...links];
            logger.debug(`Found job links using selector`, { selector, count: links.length });
            break; // Stop after finding results with first working selector
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      // Remove duplicates
      jobUrls = [...new Set(jobUrls)];
      
      // If no specific job links found, try to extract any links that might be job postings
      if (jobUrls.length === 0) {
        try {
          logger.debug("No job-specific links found, trying broader search");
          const allLinks = await page.$$eval('a', (elements) =>
            elements.map((el) => ({
              href: el.href,
              text: el.textContent?.toLowerCase().trim() || '',
              title: el.getAttribute('title')?.toLowerCase() || ''
            }))
            .filter(link =>
              link.href &&
              link.href.includes('tyomarkkinatori.fi') &&
              (link.text.length > 10 || link.title.length > 10) && // Has meaningful content
              (link.text.includes('työ') || link.text.includes('job') ||
               link.text.includes('haku') || link.text.includes('avoin') ||
               link.title.includes('työ') || link.title.includes('job'))
            )
            .map(link => link.href)
            .slice(0, 15)
          );

          jobUrls = allLinks;
          logger.debug(`Found potential job-related links`, { count: allLinks.length });
        } catch (e) {
          logger.warn("Could not extract any links");
        }
      }
    } catch (error) {
      logger.error("Error extracting job URLs", {
        error: error instanceof Error ? error.message : error
      });
    }

    logger.debug(`Total unique job URLs found`, { searchTerm, count: jobUrls.length });
    await browser.close();
    logger.browserOperation('close');
    return jobUrls;

  } catch (error) {
    logger.error(`Error searching for jobs`, {
      searchTerm,
      error: error instanceof Error ? error.message : error
    });
    recordCrawlerError('mol', error instanceof Error ? error.message : String(error));
    await browser.close();
    return [];
  }
}