import { chromium } from 'playwright';
import { config } from "dotenv";
import { storeDb} from './utils';

// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;

(async () => {
  config();
  // console.log(process.env.TELEGRAM_API_KEY);
  // console.log(process.env.TELEGRAM_CHAT_ID);
  
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
    console.log(i);
    urls.push(...i)
  }

  console.log(urls)
  await storeDb(urls)
})();



async function searchItems(items:string): Promise<string[]> {
  console.log("Starting browser");
  const browser = await chromium.launch({headless: HEADLESS});
  let page = await browser.newPage(); 
  
  try {
    // Navigate directly to search results URL with shorter timeout
    const searchUrl = `https://www.tori.fi/koko_suomi?q=${encodeURIComponent(items)}`;
    console.log(`Searching for: ${items}`);
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
        console.log("Cookie consent handled or not needed");
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
      console.log("No /vi/ links found, trying alternative patterns...");
      
      // Try other link patterns
      try {
        urls = await page.$$eval('a[href*="tori.fi"]', (elements) => 
          elements.map((el) => el.href)
            .filter((href) => href && href.includes('tori.fi') && href.includes('/'))
            .slice(0, 10)
        );
      } catch (e) {
        console.log("No tori.fi links found");
      }
    }
    
    console.log(`Found ${urls.length} URLs for ${items}`);
    await browser.close();
    console.log("done and browser closed");
    return urls;
    
  } catch (error) {
    console.log(`Error processing ${items}:`, error instanceof Error ? error.message : error);
    await browser.close();
    return [];
  }
}
