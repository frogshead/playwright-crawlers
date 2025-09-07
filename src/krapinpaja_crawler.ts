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
    await page.goto('https://krapinpaja.fi/ohjelmisto/');
    // a.tiketti-list-item:nth-child(3)
    const urls = await page.$$eval('.project > a', (elements) => elements.map((el) => el.href));
    // console.log(urls)
    await storeDb(urls);
    await browser.close();
})();