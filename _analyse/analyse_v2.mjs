// RevierApp Analyse-Script v2 — Playwright
// Besucht alle 14 Seiten, macht Desktop Screenshots (1920x1080), dokumentiert Status

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = { width: 1920, height: 1080 };
const BASE = 'http://localhost:3000';
const WAIT = 3000; // ms to wait for rendering

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

async function visitPage(page, pg, desktopDir) {
  const info = { label: pg.label, url: pg.url, status: null, error: null, notes: [], elements: {} };

  try {
    await page.setViewportSize(DESKTOP);
    const resp = await page.goto(`${BASE}${pg.url}`, { waitUntil: 'networkidle', timeout: 20000 });
    const status = resp ? resp.status() : 'no response';
    info.status = status;

    if (status >= 400) {
      info.error = `HTTP ${status}`;
      info.notes.push(`Seite liefert HTTP ${status}`);
    }

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

    // Count key elements
    info.elements.leafletMap = await page.locator('.leaflet-container').count();
    info.elements.markers = await page.locator('.leaflet-marker-icon, .leaflet-marker-pane img, .leaflet-marker-pane > *').count();
    info.elements.polygons = await page.locator('.leaflet-overlay-pane path, .leaflet-overlay-pane svg path').count();
    info.elements.tables = await page.locator('table').count();
    info.elements.buttons = await page.locator('button').count();
    info.elements.inputs = await page.locator('input, select, textarea').count();
    info.elements.modals = await page.locator('[role="dialog"], .modal, [class*="Dialog"]').count();
    info.elements.toasts = await page.locator('[class*="toast"], [class*="Toast"], [data-sonner-toast]').count();
    info.elements.badges = await page.locator('[class*="badge"], [class*="Badge"]').count();
    info.elements.cards = await page.locator('[class*="card"], [class*="Card"]').count();

    // Page-specific checks
    if (pg.name === '02_revierkarte') {
      info.elements.sidebar = await page.locator('aside, [class*="sidebar"], [class*="Sidebar"]').count();
      info.elements.toolbar = await page.locator('[class*="toolbar"], [class*="Toolbar"]').count();
      info.elements.layerButtons = await page.locator('button:has-text("Karte"), button:has-text("Luftbild"), button:has-text("Flurstück"), button:has-text("Hybrid")').count();
      info.elements.rightPanel = await page.locator('[class*="panel"], [class*="Panel"]').count();
      info.elements.poiItems = await page.locator('[class*="poi"], [class*="POI"], [class*="object"]').count();
      // Check for marker popups
      info.elements.popups = await page.locator('.leaflet-popup').count();
    }

    if (pg.name === '12_gastelink') {
      // Check if guest page has actual content beyond loading text
      const hasMap = await page.locator('.leaflet-container').count();
      const loadingText = await page.locator('text="Karte wird geladen"').count();
      info.elements.hasMap = hasMap;
      info.elements.loadingStuck = loadingText > 0 && hasMap === 0;
      info.elements.navButton = await page.locator('button:has-text("Navigation"), a:has-text("Navigation")').count();
    }

    if (pg.name === '13_rsvp') {
      const loadingText = await page.locator('text="wird geladen"').count();
      info.elements.loadingStuck = loadingText > 0;
      info.elements.formFields = await page.locator('input, select, textarea, [role="radio"], [role="checkbox"]').count();
    }

    if (pg.name === '14_nachsuche') {
      const loadingText = await page.locator('text="werden geladen"').count();
      info.elements.loadingStuck = loadingText > 0;
      const hasMap = await page.locator('.leaflet-container').count();
      info.elements.hasMap = hasMap;
    }

    info.desktop = await screenshot(page, pg.name, desktopDir);

  } catch (err) {
    info.error = err.message;
    info.notes.push(`Fehler: ${err.message}`);
    try { await screenshot(page, pg.name, desktopDir); } catch {}
  }

  return info;
}

async function testRevierkarte(page, desktopDir) {
  const extras = [];

  await page.setViewportSize(DESKTOP);
  await page.goto(`${BASE}/revier/demo`, { waitUntil: 'networkidle', timeout: 20000 });
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
      await page.waitForTimeout(1500);
      await screenshot(page, `sidebar_${slug}`, desktopDir);
      extras.push({ action: `Sidebar Klick: "${text.trim()}"`, success: true });
    } catch (err) {
      extras.push({ action: `Sidebar Klick ${i}`, success: false, error: err.message });
    }
  }

  // Go back to map view
  await page.goto(`${BASE}/revier/demo`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(WAIT);

  // Test layer switcher
  const layerButtons = await page.locator('button:has-text("Karte"), button:has-text("Luftbild"), button:has-text("Flurstück"), button:has-text("Hybrid")').all();
  console.log(`Layer buttons found: ${layerButtons.length}`);

  for (const btn of layerButtons) {
    try {
      const text = await btn.innerText();
      await btn.click();
      await page.waitForTimeout(2000);
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

  // Check for marker popups
  const popups = await page.locator('.leaflet-popup').count();
  extras.push({ action: `Marker-Popups: ${popups} gefunden`, success: popups > 0 });

  // Test clicking a marker if available
  const firstMarker = page.locator('.leaflet-marker-icon').first();
  if (await firstMarker.count() > 0) {
    try {
      await firstMarker.click();
      await page.waitForTimeout(1000);
      const popupAfterClick = await page.locator('.leaflet-popup').count();
      extras.push({ action: `Marker-Klick -> Popup: ${popupAfterClick > 0}`, success: popupAfterClick > 0 });
      await screenshot(page, 'marker_popup', desktopDir);
    } catch (err) {
      extras.push({ action: 'Marker-Klick', success: false, error: err.message });
    }
  }

  // Test share modal
  const shareButton = page.locator('button:has-text("Revier teilen"), button:has-text("teilen")').first();
  if (await shareButton.count() > 0) {
    try {
      await shareButton.click();
      await page.waitForTimeout(1000);
      const modal = await page.locator('[role="dialog"], .modal, [class*="Dialog"]').count();
      extras.push({ action: `Share-Modal geöffnet: ${modal > 0}`, success: modal > 0 });
      await screenshot(page, 'share_modal', desktopDir);
      // Close modal
      const closeBtn = page.locator('[role="dialog"] button:has-text("Abbrechen"), [role="dialog"] button:has-text("Schließen"), button[aria-label="Close"]').first();
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    } catch (err) {
      extras.push({ action: 'Share-Modal', success: false, error: err.message });
    }
  }

  // Test mobile sidebar
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await screenshot(page, 'mobile_revierkarte', desktopDir);

  const hamburger = await page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], button:has(.lucide-menu), [class*="hamburger"]').count();
  extras.push({ action: `Mobile Hamburger-Button: ${hamburger > 0}`, success: hamburger > 0 });

  const sidebarVisible = await page.locator('aside:visible, [class*="sidebar"]:visible').count();
  extras.push({ action: `Mobile Sidebar versteckt: ${sidebarVisible === 0}`, success: sidebarVisible === 0 });

  // Test mobile sidebar toggle
  if (hamburger > 0) {
    try {
      await page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], button:has(.lucide-menu), [class*="hamburger"]').first().click();
      await page.waitForTimeout(500);
      await screenshot(page, 'mobile_sidebar_open', desktopDir);
      extras.push({ action: 'Mobile Sidebar öffnet sich', success: true });
    } catch (err) {
      extras.push({ action: 'Mobile Sidebar Toggle', success: false, error: err.message });
    }
  }

  return extras;
}

async function main() {
  const desktopDir = path.join(__dirname, 'screenshots_v2');
  fs.mkdirSync(desktopDir, { recursive: true });

  console.log('Starting RevierApp analysis v2...');
  console.log(`Desktop: ${DESKTOP.width}x${DESKTOP.height}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Visit all pages
  for (const pg of PAGES) {
    console.log(`Visiting: ${pg.label} (${pg.url})`);
    const info = await visitPage(page, pg, desktopDir);
    results.push(info);
    console.log(`  Status: ${info.status}, Elements: map=${info.elements.leafletMap} markers=${info.elements.markers} tables=${info.elements.tables} buttons=${info.elements.buttons}`);
    if (info.notes.length > 0) console.log(`  Notes: ${info.notes.join(', ')}`);
  }

  // Extra tests on Revierkarte
  console.log('\nTesting Revierkarte interactions...');
  const karteExtras = await testRevierkarte(page, desktopDir);
  for (const e of karteExtras) {
    console.log(`  ${e.success ? 'OK' : 'FAIL'}: ${e.action}${e.error ? ` (${e.error})` : ''}`);
  }

  await browser.close();

  // Write results JSON
  const report = { pages: results, karteExtras, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(__dirname, 'results_v2.json'), JSON.stringify(report, null, 2));

  console.log('\nDone! Screenshots saved to _analyse/screenshots_v2/');
  console.log(`Pages tested: ${results.length}`);
  console.log(`Errors: ${results.filter(r => r.error).length}`);
  console.log(`Karte extras: ${karteExtras.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
