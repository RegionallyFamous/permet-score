import { chromium } from "@playwright/test";

const baseUrl = process.env.PERMET_BASE_URL ?? "http://localhost:3000";

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    try {
      return await chromium.launch({ channel: "chromium" });
    } catch {
      return chromium.launch();
    }
  }
}

function absoluteUrl(path) {
  return new URL(path, baseUrl);
}

async function assertSharePreservesPrints() {
  const deck = {
    name: "Workflow QA Alt Print",
    main: { "ST01-001": 4 },
    resource: { "R-001": 10 },
    art: { "ST01-001": "p1" },
    prints: {
      main: { "ST01-001": { p1: 4 } },
      resource: { "R-001": { standard: 10 } },
    },
  };

  const saveResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deck),
  });

  if (!saveResponse.ok) {
    throw new Error(`POST /api/decks failed with ${saveResponse.status}`);
  }

  const saved = await saveResponse.json();
  const loadResponse = await fetch(absoluteUrl(`/api/decks/${saved.id}`));
  if (!loadResponse.ok) {
    throw new Error(`GET /api/decks/${saved.id} failed with ${loadResponse.status}`);
  }

  const loaded = await loadResponse.json();
  const printQuantity = loaded.deck?.prints?.main?.["ST01-001"]?.p1;
  if (printQuantity !== 4) {
    throw new Error(`Shared deck lost ST01-001 p1 prints: ${printQuantity}`);
  }
}

async function assertInvalidShareBlocked(page) {
  const invalidDeck = {
    name: "Workflow QA Invalid Deck",
    main: {
      "ST01-001": 4,
      "ST01-002": 3,
      "ST01-003": 4,
      "ST01-004": 4,
      "ST01-005": 4,
      "ST01-006": 3,
      "ST01-007": 3,
      "ST01-008": 2,
      "ST01-009": 2,
      "ST01-010": 4,
      "ST01-011": 3,
      "ST01-012": 3,
      "ST01-013": 2,
      "ST01-014": 4,
      "ST01-015": 3,
      "ST01-016": 3,
    },
    resource: { "R-001": 10 },
    art: {},
    prints: { main: {}, resource: {} },
    collection: {},
  };

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate((deck) => {
    window.localStorage.setItem("gundam-deck-builder-v1", JSON.stringify(deck));
  }, invalidDeck);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByText("Share blocked").waitFor({ timeout: 15000 });
}

async function assertArtUpgradeKeepsBuyList(page) {
  await page.evaluate(() => window.localStorage.removeItem("gundam-deck-builder-v1"));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('button[title="Upgrade deck art budget"]').click();
  await page.locator('button[title="Open missing prints buy list"]').click();
  await page.getByRole("heading", { name: "Buy List" }).waitFor({ timeout: 15000 });
  const buyList = await page.locator("textarea").inputValue();
  if (!/ST01-\d{3}/.test(buyList) || buyList.length < 100) {
    throw new Error(`Art upgrade cleared the buy list: ${buyList.slice(0, 80)}`);
  }
  await page.locator('button[aria-label="Close fallback panel"]').click();
}

async function assertMobileLibraryLayout(page) {
  await page.setViewportSize({ width: 320, height: 680 });
  await page.evaluate(() => window.localStorage.removeItem("gundam-deck-builder-v1"));
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const tcgClipping = await page
    .locator('.library-result a[aria-label^="Search TCGplayer"]')
    .first()
    .evaluate((link) => {
      const linkRect = link.getBoundingClientRect();
      const cardRect = link.closest(".library-result").getBoundingClientRect();
      return Math.max(0, linkRect.right - cardRect.right);
    });
  if (tcgClipping > 1) {
    throw new Error(`320px library TCG button clips by ${tcgClipping}px`);
  }

  await page.getByRole("button", { name: /Filters/i }).click();
  await page.locator(".library-filters-popover").waitFor({ timeout: 15000 });
  const filterOverlap = await page.evaluate(() => {
    const popover = document.querySelector(".library-filters-popover");
    const nav = document.querySelector("nav");
    if (!popover || !nav) return 0;
    return Math.max(0, popover.getBoundingClientRect().bottom - nav.getBoundingClientRect().top);
  });
  if (filterOverlap > 1) {
    throw new Error(`Mobile filters overlap bottom nav by ${filterOverlap}px`);
  }

  await page.getByRole("button", { name: /Filters/i }).click();
  await page.getByRole("button", { name: /Open large view of/i }).first().click();
  await page.locator(".card-lightbox").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const closeTop = await page.locator(".lightbox-close").evaluate(
    (button) => button.getBoundingClientRect().top,
  );
  if (closeTop < 0) {
    throw new Error(`Lightbox close button scrolled out of reach: top=${closeTop}`);
  }
  await page.locator(".lightbox-close").click();
}

async function main() {
  await assertSharePreservesPrints();

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(absoluteUrl("/decks/not-a-real-deck-id").toString(), {
      waitUntil: "networkidle",
    });
    await page.getByText("Shared Deck Not Found").waitFor({ timeout: 15000 });
    const missingDeckName = await page.locator("input").first().inputValue();
    if (/Heroic Beginnings Shell/i.test(missingDeckName)) {
      throw new Error(`Missing shared deck still shows starter deck: ${missingDeckName}`);
    }

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('button[title="More deck actions"]').click();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("title") === "Load sample deck",
      null,
      { timeout: 15000 },
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#mobile-action-sheet"));

    await assertMobileLibraryLayout(page);

    await page.setViewportSize({ width: 320, height: 680 });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Show Deck" }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) {
      throw new Error(`320px deck view has ${overflow}px horizontal overflow`);
    }

    const desktop = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      acceptDownloads: true,
    });
    await assertInvalidShareBlocked(desktop);
    await assertArtUpgradeKeepsBuyList(desktop);

    await desktop.goto(baseUrl, { waitUntil: "networkidle" });
    const downloadPromise = desktop.waitForEvent("download", { timeout: 20000 });
    await desktop.getByRole("button", { name: "Export deck image" }).click();
    await downloadPromise;
    await desktop.getByText(/Deck sheet exported/i).waitFor({ timeout: 20000 });
    const toast = await desktop.getByText(/print rows rendered/i).textContent();
    if (/placeholder/i.test(toast ?? "")) {
      throw new Error(`Sheet export still used placeholders: ${toast}`);
    }
  } finally {
    await browser.close();
  }

  console.log("Workflow QA passed.");
}

await main();
