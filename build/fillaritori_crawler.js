"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const dotenv_1 = require("dotenv");
const utils_1 = require("./utils");
// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;
// Parse command line arguments
const args = process.argv.slice(2);
const openInBrowser = args.includes('--open');
(async () => {
    (0, dotenv_1.config)();
    // console.log(process.env.TELEGRAM_API_KEY);
    // console.log(process.env.TELEGRAM_CHAT_ID);
    const subcategory_urls = [
        'https://www.fillaritori.com/forum/85-maasto/', // sähkö
        'https://www.fillaritori.com/forum/55-cyclocrossgravel/',
        'https://www.fillaritori.com/forum/54-maantie/'
    ];
    const urls = [];
    for await (const item of subcategory_urls) {
        const i = await searchItems(item);
        console.log(i);
        urls.push(...i);
    }
    console.log(urls);
    await (0, utils_1.storeDb)(urls, openInBrowser);
})();
async function searchItems(url) {
    console.log("Starting browser");
    let date = Date.now().toString();
    const browser = await playwright_1.chromium.launch({ headless: HEADLESS });
    let page = await browser.newPage();
    await page.goto(url);
    await page.locator('button:has-text("HYVÄKSY")').click();
    console.log('keksit hyväksytty');
    // console.log('Found items: ',await page.$$eval('a[href^="https"]').);
    const urls = await page.$$eval('a[href^="https://www.fillaritori.com/topic/"]', (elements) => elements.map((el) => el.href));
    await browser.close();
    console.log("done and browser closed");
    return urls;
}
