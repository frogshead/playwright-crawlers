"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const dotenv_1 = require("dotenv");
const utils_1 = require("./utils");
// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;
(async () => {
    (0, dotenv_1.config)();
    console.log("Starting browser...");
    const browser = await playwright_1.chromium.launch({ headless: HEADLESS });
    let page = await browser.newPage();
    await page.goto('https://krapinpaja.fi/ohjelmisto/');
    // a.tiketti-list-item:nth-child(3)
    const urls = await page.$$eval('.project > a', (elements) => elements.map((el) => el.href));
    // console.log(urls)
    (0, utils_1.storeDb)(urls);
    await browser.close();
})();
