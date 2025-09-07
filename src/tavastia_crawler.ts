import { chromium  } from "playwright";
import { config } from "dotenv";
import { storeDb } from "./utils";

// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;

(async () => {
    config();
    console.log("Starting browser...");
    const browser = await chromium.launch({headless: HEADLESS});
    let page = await browser.newPage();
    await page.goto('https://tavastiaklubi.fi/?show_all=1');
    // a.tiketti-list-item:nth-child(3)
    const urls = await page.$$eval('.tiketti-list-item', (elements) => elements.map((el) => el.href));
    
    await storeDb(urls);
    await browser.close();
})();