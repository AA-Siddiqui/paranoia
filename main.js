const puppeteer = require('puppeteer');
const sessionKeep = "FALL 2025";
let prevHash = null;

const escapeToZero = (num) => {
  if (isNaN(num) || num === null || num === undefined) {
    return 0;
  }
  return num;
}

async function sendResults(data) {
  const webhookUrl = process.env.WEBHOOK;
  const embeds = data.map(entry => {
    const resultLines = entry.results.map(r => {
      const detailed = r.detailed
        .map(d => `• ${d.name}: ${d.obtained}/${d.total}`)
        .join("\n");

      return [
        `**${r.name}**`,
        `Weight: ${r.weight}`,
        `Score: ${escapeToZero(r.obtained)}/${r.total}`,
        detailed ? `Details:\n${detailed}` : ""
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    return {
      title: entry.name,
      color: entry.submitted ? 3066993 : 15158332,
      fields: [
        {
          name: "Status",
          value: entry.submitted ? "Submitted" : "Not Submitted",
          inline: true
        },
        {
          name: "Total",
          value: `${entry.obtained ?? "N/A"}/${entry.total}`,
          inline: true
        },
        {
          name: "Results",
          value: resultLines || "No results"
        }
      ]
    };
  });

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ embeds })
  });
}

async function hashObject(object) {
  const objectString = JSON.stringify(object);
  const msgBuffer = new TextEncoder().encode(objectString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('');

  return hashHex;
}

const waitOnPage = (page, selector, length) => {
  return page.evaluate(async (selector, length) => {
    while (Array.from(document.querySelectorAll(selector)).length < length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return true;
  }, selector, length);
}

const main = async () => {
  const browser = await puppeteer.launch({
    browser: 'firefox',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(600000);

  try {

    await page.goto('https://erp.superior.edu.pk/web/login', { waitUntil: 'networkidle2' });

    const usernameSelector = '#login';
    const passwordSelector = '#password';

    await page.waitForSelector(usernameSelector);
    await page.type(usernameSelector, process.env.ROLL_NO);

    await page.waitForSelector(passwordSelector);
    await page.type(passwordSelector, process.env.PASSWORD);

    await Promise.all([
      waitOnPage(page, "#hierarchical-show a", 3),
      page.click('button[type="submit"]')
    ]);

    const links = await page.evaluate(async (sessionKeep) => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return Array.from(
        document.querySelectorAll("#hierarchical-show a")
      ).filter(
        (a) => {
          const startsWith = a.href.startsWith("https://erp.superior.edu.pk/student/results/id/");
          const session = a.querySelector("span.uk-text-small").innerText === sessionKeep;
          return startsWith && session;
        }
      ).map(
        (a) => ({
          link: a.href,
          name: Array.from(a.children).filter((e) => e instanceof HTMLSpanElement)[0].innerText,
          submitted: Array.from(a.querySelectorAll("span.md-color-blue-grey-600")).filter((e) => e.className === "md-color-blue-grey-600")[0].innerText !== "Active Class"
        })
      );
    }, sessionKeep);
    console.log("collecting links done");

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
                  obtained: Number(e.children.item(3).innerHTML.trim()),
                  total: Number(e.children.item(2).innerHTML.trim()),
                });
                results[results.length - 1].obtained += Number(e.children.item(3).innerHTML.trim());
                results[results.length - 1].total += Number(e.children.item(2).innerHTML.trim());
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
    const hash = await hashObject(data);
    const hashOfEmpty = await hashObject([]);

    if (hash === hashOfEmpty) {
      return main();
    }

    if (hash === prevHash) {
      console.log("No changes detected.");
      return;
    }
    prevHash = hash;
    // const filteredData = data.filter(entry => entry.obtained < 85);
    await sendResults(data);
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error(error);
    process.exit(1); // Fail the run if something breaks
  } finally {
    await browser.close();
  }
};

main()