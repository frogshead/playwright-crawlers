import { chromium } from 'playwright';
import { config } from "dotenv";
import { storeDb} from './utils';


(async () => {
  config();
  // console.log(process.env.TELEGRAM_API_KEY);
  // console.log(process.env.TELEGRAM_CHAT_ID);
  
  const items = [ 'yale doorman', 'oskilloskooppi', 'rasberry pi', 'arduino', 'genelec', 'kaiuttimet', 'pyörän kattoteline', 'agilent', 'rigol', 'tektronix', 'lecroy', 'sähkökitara' ]
  
  const urls: string[] =  [];
  
  for await (const item of items) {
    const i = await searchItems(item);
    console.log(i);
    urls.push(...i)
  }

  console.log(urls)
  storeDb(urls)
})();



async function searchItems(items:string): Promise<string[]> {
  console.log("Starting browser");
  let date = Date.now().toString();
  const browser = await chromium.launch({headless: true});
  let page = await browser.newPage(); 
  await page.goto('https://www.tori.fi/');
  await page.frameLocator('#sp_message_iframe_886669').locator('text=Hyväksy kaikki evästeet').click();
  await page.locator('input').first().fill(items);
  await page.locator('input').first().press('Enter');
  try {
    await page.waitForSelector('.list_mode_thumb');
    
  } catch (error) {
    console.log("Error: ", error)
  }
  
  console.log('Found items: ',await page.locator('.list_mode_thumb > a').count());
  const urls = await page.$$eval('.list_mode_thumb > a', (elements) => 
  elements.map((el)=> el.href),
  )
  await browser.close();
  console.log("done and browser closed")
  return urls 
}
