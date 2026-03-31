// RevierApp Analyse-Script — Playwright
// Besucht alle Seiten, macht Desktop + Mobile Screenshots, dokumentiert Fehler

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = { width: 1920, height: 1080 };
const MOBILE = { width: 390, height: 844 };
const BASE = 'http://localhost:3000';
const WAIT = 2500; // ms to wait for rendering

const PAGES = [
  { url: '/', name: '01_startseite', label: 'Startseite' },
  { url: '/revier/demo', name: '02_revierkarte', label: 'Revierkarte' },
  { url: '/revier/demo/strecke', name: '03_streckenbuch', label: 'Streckenbuch' },
  { url: '/revier/demo/beobachtungen', name: '04_beobachtungen', label: 'Beobachtungen' },
  { url: '/revier/demo/gaeste', name: '05_gaeste', label: 'Gäste' },
  { url: '/revier/demo/jes', name: '06_jes', label: 'JES' },
  { url: '/revier/demo/drueckjagd', name: '07_drueckjagd', label: 'Drückjagd' },
  { url: '/revier/demo/kalender', name: '08_kalender', label: 'Kalender' },
  { url: '/revier/demo/settings', name: '09_einstellungen', label: 'Einstellungen' },
  { url: '/login', name: '10_login', label: 'Login' },
  { url: '/jes-login', name: '11_jes_login', label: 'JES Login' },
  { url: '/r/demo', name: '12_gastelink', label: 'Gästelink' },
  { url: '/rsvp/demo', name: '13_rsvp', label: 'RSVP' },
  { url: '/ns/demo', name: '14_nachsuche', label: 'Nachsuche' },
];

const results = [];

async function screenshot(page, name, dir) {
  const filePath = path.join(dir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function visitPage(page, pg, desktopDir, mobileDir) {
  const info = { label: pg.label, url: pg.url, desktop: null, mobile: null, error: null, notes: [] };

  try {
    // Desktop
    await page.setViewportSize(DESKTOP);
    const resp = await page.goto(`${BASE}${pg.url}`, { waitUntil: 'networkidle', timeout: 15000 });
    const status = resp ? resp.status() : 'no response';
    info.status = status;

    if (status >= 400) {
      info.error = `HTTP ${status}`;
      info.notes.push(`Seite liefert HTTP ${status}`);
    }

    // Wait for rendering (Leaflet etc.)
    await page.waitForTimeout(WAIT);

    // Check for Next.js error overlay
    const hasErrorOverlay = await page.locator('#__next-build-error, [data-nextjs-dialog], .nextjs-container-errors-body').count();
    if (hasErrorOverlay > 0) {
      info.notes.push('Next.js Fehler-Overlay sichtbar');
    }

    // Check for error text on page
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (bodyText.includes('404') || bodyText.includes('not found') || bodyText.includes('Not Found')) {
      info.notes.push('404 / Not Found auf der Seite');
    }
    if (bodyText.includes('error') || bodyText.includes('Error')) {
      info.notes.push('Fehlermeldung auf der Seite sichtbar');
    }

    info.desktop = await screenshot(page, pg.name, desktopDir);

    // Mobile
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(800);
    info.mobile = await screenshot(page, pg.name, mobileDir);

  } catch (err) {
    info.error = err.message;
    info.notes.push(`Fehler: ${err.message}`);
    // Try screenshot anyway
    try { await screenshot(page, pg.name, desktopDir); } catch {}
    try { await screenshot(page, pg.name, mobileDir); } catch {}
  }

  return info;
}

async function testRevierkarte(page, desktopDir) {
  const extras = [];

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE}/revier/demo`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(WAIT);

  // Test sidebar navigation items
  const sidebarLinks = await page.locator('nav a, aside a, [class*="sidebar"] a, [class*="nav"] a').all();
  console.log(`Sidebar links found: ${sidebarLinks.length}`);

  // Click each sidebar nav item and take screenshot
  for (let i = 0; i < sidebarLinks.length; i++) {
    try {
      const text = await sidebarLinks[i].innerText().catch(() => `link_${i}`);
      const slug = text.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20) || `link_${i}`;
      await sidebarLinks[i].click();
      await page.waitForTimeout(1000);
      await screenshot(page, `sidebar_${slug}`, desktopDir);
      extras.push({ action: `Sidebar Klick: "${text.trim()}"`, success: true });
    } catch (err) {
      extras.push({ action: `Sidebar Klick ${i}`, success: false, error: err.message });
    }
  }

  // Go back to map view
  await page.goto(`${BASE}/revier/demo`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(WAIT);

  // Test layer switcher
  const layerButtons = await page.locator('button:has-text("Karte"), button:has-text("Luftbild"), button:has-text("Flurstück"), button:has-text("Hybrid")').all();
  console.log(`Layer buttons found: ${layerButtons.length}`);

  for (const btn of layerButtons) {
    try {
      const text = await btn.innerText();
      await btn.click();
      await page.waitForTimeout(1500);
      const slug = text.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      await screenshot(page, `layer_${slug}`, desktopDir);
      extras.push({ action: `Layer "${text.trim()}"`, success: true });
    } catch (err) {
      extras.push({ action: 'Layer Klick', success: false, error: err.message });
    }
  }

  // Check Leaflet map presence
  const leafletContainer = await page.locator('.leaflet-container').count();
  extras.push({ action: 'Leaflet Container vorhanden', success: leafletContainer > 0 });

  // Check markers
  const markers = await page.locator('.leaflet-marker-icon, .leaflet-marker-pane img, .leaflet-marker-pane > *').count();
  extras.push({ action: `Karten-Marker: ${markers} gefunden`, success: markers > 0 });

  // Check polygon (Reviergrenze)
  const polygons = await page.locator('.leaflet-overlay-pane path, .leaflet-overlay-pane svg path').count();
  extras.push({ action: `Reviergrenze (Polygone): ${polygons} gefunden`, success: polygons > 0 });

  // Check right panel
  const rightPanel = await page.locator('[class*="panel"], [class*="Panel"]').count();
  extras.push({ action: `Rechtes Panel vorhanden: ${rightPanel > 0}`, success: rightPanel > 0 });

  // Check toolbar
  const toolbar = await page.locator('[class*="toolbar"], [class*="Toolbar"]').count();
  extras.push({ action: `Toolbar vorhanden: ${toolbar > 0}`, success: toolbar > 0 });

  return extras;
}

async function main() {
  const desktopDir = path.join(__dirname, 'screenshots');
  const mobileDir = path.join(__dirname, 'screenshots', 'mobile');
  fs.mkdirSync(desktopDir, { recursive: true });
  fs.mkdirSync(mobileDir, { recursive: true });

  console.log('Starting RevierApp analysis...');
  console.log(`Desktop: ${DESKTOP.width}x${DESKTOP.height}`);
  console.log(`Mobile: ${MOBILE.width}x${MOBILE.height}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Visit all pages
  for (const pg of PAGES) {
    console.log(`Visiting: ${pg.label} (${pg.url})`);
    const info = await visitPage(page, pg, desktopDir, mobileDir);
    results.push(info);
  }

  // Extra tests on Revierkarte
  console.log('\nTesting Revierkarte interactions...');
  const karteExtras = await testRevierkarte(page, desktopDir);

  await browser.close();

  // Write results JSON for reference
  const report = { pages: results, karteExtras, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(report, null, 2));

  console.log('\nDone! Screenshots saved to _analyse/screenshots/');
  console.log(`Pages tested: ${results.length}`);
  console.log(`Errors: ${results.filter(r => r.error).length}`);
  console.log(`Karte extras: ${karteExtras.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
