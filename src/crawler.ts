import { chromium } from 'playwright';
import { Database, OPEN_CREATE, OPEN_READWRITE } from "sqlite3";
import { config } from "dotenv";

(async () => {
  config();
  console.log(process.env.TELEGRAM_API_KEY);
  console.log(process.env.TELEGRAM_CHAT_ID);
  
  const items = [ 'yale doorman', 'oskilloskooppi', 'rasberry pi', 'tärylätkä']
  
  const urls: string[] =  [];
  
  for await (const item of items) {
    const i = await searchItems(item);
    console.log(i);
    urls.push(...i)
  }

  console.log(urls)
  storeDb(urls)
})();

function storeDb(urls:string[]) {
  const db = new Database('tori.db',
    OPEN_READWRITE | OPEN_CREATE,
    (err) => {
      if (err){
        console.log(err.message);
      }
      else{
        console.log("Connected to Database");
        db.run("CREATE TABLE IF NOT EXISTS links (url TEXT UNIQUE)");
        const stmt = db.prepare("INSERT INTO links VALUES (?)");
        urls.forEach(url => {
          stmt.run(url, (err) => {
            if (err){
              console.log(err.message)
            }
            else{
              console.log("Added url: ", url);
              const TelegramBot = require('node-telegram-bot-api');
              const bot= new TelegramBot(process.env.TELEGRAM_API_KEY);
              
              bot.sendMessage(process.env.TELEGRAM_CHAT_ID, url);


            }
          });
        });
        stmt.finalize();
      }
    } 
  )
}

async function searchItems(items:string): Promise<string[]> {
  console.log("Starting browser");
  let date = Date.now().toString();
  const browser = await chromium.launch({headless: true});
  let page = await browser.newPage();
  await page.goto('https://www.tori.fi/');
  const acceptCookies = await page.$$('button:has-text("Hyväksy kaikki evästeet")')
  if (acceptCookies) {
    await page.frameLocator('#sp_message_iframe_433571').locator('button:has-text("Hyväksy kaikki evästeet")').click();
  }
  await page.locator('input').first().fill(items);
  await page.locator('input').first().press('Enter');
  await page.waitForSelector('.list_mode_thumb');
  console.log('Found items: ',await page.locator('.list_mode_thumb > a').count());
  const urls = await page.$$eval('.list_mode_thumb > a', (elements) => 
    elements.map((el)=> el.href),
  )
  await browser.close();
  console.log("done and browser closed")
  // console.log(urls)
  return urls 
}