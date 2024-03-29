import { chromium  } from "playwright";
import { config } from "dotenv";
import { storeDb } from "./utils";

(async () => {
    config();
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

    ]
    console.log("Starting browser...");
    for (const item of items){

        const browser = await chromium.launch({headless: true});
        let page = await browser.newPage();
        await page.goto(item);
        const urls = await page.$$eval('.thumbnail > a', (elements) => elements.map((el) => el.href));
        // console.log(urls)
        storeDb(urls);
        await browser.close();
    }
})();

