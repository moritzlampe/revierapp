import { chromium } from 'playwright';

const pages = [
  { name: '1-login', url: 'http://localhost:3000/login' },
  { name: '2-signup', url: 'http://localhost:3000/signup' },
  { name: '3-join', url: 'http://localhost:3000/join/TESTCODE' },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });

  for (const p of pages) {
    const page = await context.newPage();
    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
    } catch {
      await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `screenshots/${p.name}.png`, fullPage: true });
    console.log(`Screenshot: ${p.name}`);
    await page.close();
  }

  await browser.close();
  console.log('Done!');
})();
