import { chromium  } from "playwright";
import { config } from "dotenv";
import { storeDb } from "./utils";
import { createLogger } from "./logger";
import {
    startCrawlerMonitoring,
    completeCrawlerMonitoring,
    recordCrawlerMetrics,
    recordCrawlerError,
    monitor
} from "./monitoring";

// Set to false to run with browser window visible (for debugging)
const HEADLESS = true;

const logger = createLogger('theseus');

// Parse command line arguments
const args = process.argv.slice(2);
const openInBrowser = args.includes('--open');

(async () => {
    config();

    const crawlerName = 'theseus';

    // Start monitoring and system monitoring
    startCrawlerMonitoring(crawlerName);
    const systemMonitorInterval = monitor.startSystemMonitoring();

    logger.crawlerStart();

    const items = [
        'https://www.theseus.fi/discover?filtertype_1=koulutusala&filter_relational_operator_1=equals&filter_1=fi%3DElektroniikka%7Csv%3DElektronik%7Cen%3DElectronic+Engineering%7C&rpp=100&sort_by=dc.date.issued_dt&order=desc',
        // Logistiikka:
        'https://www.theseus.fi/discover?filtertype_1=koulutusala&filter_relational_operator_1=equals&filter_1=fi%3DLogistiikka%7Csv%3DLogistik%7Cen%3DLogistics%7C&submit_apply_filter=&query=&rpp=100&sort_by=dc.date.issued_dt&order=desc',

        // Liikunta
        'https://www.theseus.fi/discover?filtertype_1=koulutusala&filter_relational_operator_1=equals&filter_1=fi%3DLiikunta-ala%7Csv%3DIdrottsbranschen%7Cen%3DSports+studies%7C&submit_apply_filter=&query=&rpp=100&sort_by=dc.date.issued_dt&order=desc',

        // Tietojenkäsittely
        'https://www.theseus.fi/discover?filtertype_1=koulutusala&filter_relational_operator_1=equals&filter_1=fi%3DTietojenk%C3%A4sittely%7Csv%3DInformationsbehandling%7Cen%3DBusiness+Information+Technology%7C&submit_apply_filter=&query=&rpp=100&sort_by=dc.date.issued_dt&order=desc',

        // Rust
        'https://www.theseus.fi/discover?filtertype_1=subjects&filter_relational_operator_1=contains&filter_1=rust&submit_apply_filter=&query=&rpp=100&sort_by=dc.date.issued_dt&order=desc',

        // ROS
        'https://www.theseus.fi/discover?filtertype_1=subjects&filter_relational_operator_1=contains&filter_1=ros&submit_apply_filter=&query=&rpp=100&sort_by=dc.date.issued_dt&order=desc'

    ];

    const allUrls: string[] = [];

    for (const item of items){
        try {
            logger.browserOperation('launch', { headless: HEADLESS });
            const browser = await chromium.launch({headless: HEADLESS});
            let page = await browser.newPage();

            logger.debug('Navigating to URL', { url: item });
            await page.goto(item);

            const urls = await page.$$eval('.thumbnail > a', (elements) => elements.map((el) => el.href));
            logger.info('Found URLs for category', { urlCount: urls.length });

            recordCrawlerMetrics(crawlerName, item, urls.length);
            allUrls.push(...urls);

            await browser.close();
            logger.browserOperation('close');
        } catch (error) {
            logger.error('Error processing category', {
                url: item,
                error: error instanceof Error ? error.message : error
            });
            recordCrawlerError(crawlerName, error instanceof Error ? error.message : String(error));
        }
    }

    logger.crawlerComplete(allUrls.length, items.length);

    await storeDb(allUrls, openInBrowser);

    // Complete monitoring
    completeCrawlerMonitoring(crawlerName);
    clearInterval(systemMonitorInterval);
})();

