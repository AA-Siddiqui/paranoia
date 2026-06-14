const puppeteer = require('puppeteer');
const { Pool } = require("pg")
const sessionKeep = "SPRING 2026";

const escapeToZero = (num) => {
  if (isNaN(num) || num === null || num === undefined) {
    return 0;
  }
  return num;
}

const waitOnPage = (page, selector, length) => {
  return page.evaluate(async (selector, length) => {
    while (Array.from(document.querySelectorAll(selector)).length < length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return true;
  }, selector, length);
}


const main = async (rollNo) => {
  const browser = await puppeteer.launch({
    browser: 'firefox',
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: {
      width: 1316,
      height: 728
    },
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(600000);

  try {

    await page.goto('https://erp.superior.edu.pk/web/login', { waitUntil: 'networkidle2' });

    const usernameSelector = '#login';
    const passwordSelector = '#password';

    await page.waitForSelector(usernameSelector);
    await page.type(usernameSelector, rollNo);

    await page.waitForSelector(passwordSelector);
    await page.type(passwordSelector, "12345678");

    await Promise.all([
      // waitOnPage(page, "#hierarchical-show a", 3),
      page.click('button[type="submit"]'),
    ]);
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (page.url() === "https://erp.superior.edu.pk/web/login") {
      console.log(`Login failed for ${rollNo}`);
      return;
    }
    await page.goto("https://erp.superior.edu.pk/student/results", { waitUntil: 'networkidle2' });
    await waitOnPage(page, "#hierarchical-show a", 0);

    const links = await page.evaluate(async (sessionKeep) => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return Array.from(
        document.querySelectorAll("#hierarchical-show a")
      ).filter(
        (a) => {
          const startsWith = a.href.startsWith("https://erp.superior.edu.pk/student/results/id/");
          const session = document.querySelector("div.md-card.md-card-hover > div.uk-badge.md-bg-blue-50.md-color-grey-900.uk-position-absolute.uk-position-bottom-right").innerText.toLowerCase().trim() === sessionKeep.toLowerCase();
          return startsWith && session;
        }
      ).map(
        (a) => ({
          link: a.href,
          name: a.querySelector("span.md-list-heading").innerText,
          submitted: a.parentElement.lastElementChild.querySelector("span.uk-badge").innerText.toLowerCase().trim() !== "class in progress"
        })
      ).filter(e => e.name.toLowerCase() === "Final Year Project-II".toLowerCase());
    }, sessionKeep);

    async function processLink(urlObj) {
      const url = urlObj.link;
      const name = urlObj.name;
      const submitted = urlObj.submitted;
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(600000);
      try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        await waitOnPage(page, "li.uk-active table", 1);
        const results = await page.evaluate(async () => {
          const tables = document.querySelectorAll('tbody');
          const tbody = tables[0];
          try {
            const results = [];
            Array.from(tbody.children).forEach((e, i) => {
              if (e.className === "table-parent-row show_child_row") {
                const isPublic = !!(Number(tbody.children.item(i + 2)?.children.item(1)?.innerHTML?.trim()) ?? null);
                results.push(
                  {
                    name: e.children.item(0).children.item(0).innerHTML.trim(),
                    weight: isPublic ? Number(tbody.children.item(i + 2).children.item(1).innerHTML.trim()) : 0,
                    obtained: 0,
                    total: 0,
                    detailed: []
                  }
                );
              } else if (e.className === "table-child-row md-bg-blue-grey-800 md-color-grey-50") {
              } else {
                results[results.length - 1].detailed.push({
                  name: e.children.item(0).innerHTML.trim(),
                  obtained: Number(e.children.item(2).innerHTML.trim()),
                  total: Number(e.children.item(1).innerHTML.trim()),
                });
                results[results.length - 1].obtained += Number(e.children.item(2).innerHTML.trim());
                results[results.length - 1].total += Number(e.children.item(1).innerHTML.trim());
              }
            });

            return results;
          } catch (e) { console.log(e); return null }
        });
        return { name, submitted, results, total: results.reduce((acc, curr) => acc + curr.weight, 0), obtained: results.reduce((acc, curr) => acc + (curr.obtained / curr.total * curr.weight), 0) ?? 0 };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed on ${url}:`, errorMessage);
        return null;
      } finally {
        await page.close();
      }
    }

    const data = await Promise.all(links.map(url => processLink(url)));


    console.log(rollNo, data);

  } catch (error) {
    console.error(error);
    process.exit(1); // Fail the run if something breaks
  } finally {
    await browser.close();
  }
};

const runner = async () => {
  for (let i = 1; i <= 350; i++) { 
    await main("SU92-BSSEM-F22-" + String(i).padStart(3, '0'));
  }
}

runner();
