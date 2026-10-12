import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const jobs = [
  { html: "og.html", w: 1200, h: 630, out: "og.png" },
  { html: "banner.html", w: 1200, h: 264, out: "banner.png" },
];
for (const job of jobs) {
  const page = await browser.newPage({
    viewport: { width: job.w, height: job.h },
    deviceScaleFactor: 1,
  });
  await page.goto(`file:///workspace/.grok/brand/${job.html}`, { waitUntil: "load" });
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`);
  });
  const box = await page.evaluate(() => {
    const el = document.querySelector(".plaque, .lockup");
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  });
  console.log(job.out, fonts, box);
  await page.screenshot({ path: `/workspace/.grok/brand/${job.out}`, type: "png" });
  await page.close();
}
await browser.close();
