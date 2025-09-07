import { chromium } from 'playwright';
import { config } from "dotenv";
import { storeDb } from './utils';

// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;

(async () => {
  config();
  
  const searchTerms = [ 
    'ohjelmistokehittäjä',
    'developer',
    'software',
    'rust',
    'embedded',
    'devops',
    'test automation',
    'testiautomaatio',
    'devops'

  ];

  const jobUrls: string[] = [];
  
  for await (const term of searchTerms) {
    const urls = await searchJobs(term);
    console.log(`Found ${urls.length} jobs for "${term}"`);
    jobUrls.push(...urls);
    
    // Add delay between searches to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log(`Total job URLs found: ${jobUrls.length}`);
  if (jobUrls.length > 0) {
    storeDb(jobUrls);
  }
})();

async function searchJobs(searchTerm: string): Promise<string[]> {
  console.log("Starting browser for job search");
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();
  
  try {
    console.log(`Searching for jobs: ${searchTerm}`);
    
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
      console.log("Cookie consent handled or not needed");
    }
    
    // Wait for search results to load
    await page.waitForTimeout(8000);
    
    // Debug: Check for search results containers
    const tmtSearchResults = await page.$('.tmt-haku-search-results-list');
    const switchableResults = await page.$('.SwitchableLayoutSearchResultsList');
    
    if (tmtSearchResults) {
      console.log('Found tmt-haku-search-results-list container');
    } else if (switchableResults) {
      console.log('Found SwitchableLayoutSearchResultsList container');
    } else {
      console.log('Neither search results container found, trying alternative selectors');
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
            console.log(`Found ${links.length} job links using selector: ${selector}`);
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
          console.log("No job-specific links found, trying broader search...");
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
          console.log(`Found ${allLinks.length} potential job-related links`);
        } catch (e) {
          console.log("Could not extract any links");
        }
      }
    } catch (error) {
      console.log("Error extracting job URLs:", error instanceof Error ? error.message : error);
    }
    
    console.log(`Total unique job URLs found for "${searchTerm}": ${jobUrls.length}`);
    await browser.close();
    return jobUrls;
    
  } catch (error) {
    console.log(`Error searching for ${searchTerm}:`, error instanceof Error ? error.message : error);
    await browser.close();
    return [];
  }
}