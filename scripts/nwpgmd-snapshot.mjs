#!/usr/bin/env node
// Snapshot the NHS England – North West (nwpgmd.nhs.uk) pages TraineeHQ copies
// contacts and documents from, so a later run can say what changed.
//
//   node scripts/nwpgmd-snapshot.mjs content/nwpgmd/pages.txt out.json
//
// The site sits behind a JavaScript bot check, so pages are loaded in headless
// Chromium (Playwright). Each entry keeps the page's main text, its links and
// its "Page last updated" line. CHROMIUM_PATH overrides the browser binary.

import fs from "node:fs";
import { chromium } from "playwright";

const [listFile, outFile] = process.argv.slice(2);
if (!listFile || !outFile) {
  console.error("usage: nwpgmd-snapshot.mjs <urls.txt> <out.json>");
  process.exit(2);
}
const urls = fs.readFileSync(listFile, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

const executablePath = process.env.CHROMIUM_PATH
  ?? ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => fs.existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await (await browser.newContext()).newPage();

const pages = [];
for (const url of urls) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    for (let i = 0; i < 10 && page.url().includes("/challenge"); i++) await page.waitForTimeout(2000);
    const main = await page.evaluate(() => {
      const el = document.querySelector("main, #main-content, .region-content, #content") || document.body;
      return {
        text: el.innerText.replace(/\n\s*\n+/g, "\n").trim(),
        links: [...el.querySelectorAll("a[href]")].map((a) => [a.innerText.trim().replace(/\s+/g, " "), a.href]),
      };
    });
    const updated = main.text.match(/Page last updated:?\s*([^\n]+)/i)?.[1]?.trim() ?? null;
    pages.push({ url, finalUrl: page.url(), lastUpdated: updated, ...main });
    console.log(`ok   ${url}${updated ? `  (updated ${updated})` : ""}`);
  } catch (e) {
    pages.push({ url, error: String(e) });
    console.log(`FAIL ${url}  ${e}`);
  }
}
await browser.close();
fs.writeFileSync(outFile, JSON.stringify({ taken: new Date().toISOString(), pages }, null, 1));
