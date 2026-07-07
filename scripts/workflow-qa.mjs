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

const legalMain = {
  "ST01-001": 4,
  "ST01-002": 3,
  "ST01-003": 4,
  "ST01-004": 4,
  "ST01-005": 4,
  "ST01-006": 3,
  "ST01-007": 3,
  "ST01-008": 2,
  "ST01-009": 1,
  "ST01-010": 4,
  "ST01-011": 3,
  "ST01-012": 3,
  "ST01-013": 2,
  "ST01-014": 4,
  "ST01-015": 3,
  "ST01-016": 3,
};

function legalDeck(overrides = {}) {
  return {
    name: "Workflow QA Legal Deck",
    main: legalMain,
    resource: { "R-001": 10 },
    art: {},
    prints: { main: {}, resource: { "R-001": { standard: 10 } } },
    ...overrides,
  };
}

async function assertSharePreservesPrints() {
  const deck = legalDeck({
    name: "Workflow QA Alt Print",
    art: { "ST01-001": "p1" },
    prints: {
      main: { "ST01-001": { p1: 4 } },
      resource: { "R-001": { standard: 10 } },
    },
  });

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

async function assertShareDropsPendingRulesCards() {
  const deck = legalDeck({
    name: "Workflow QA Pending Rules",
    main: { "EB01-001": 4, ...legalMain },
    art: { "EB01-001": "standard" },
    prints: {
      main: { "EB01-001": { standard: 4 } },
      resource: { "R-001": { standard: 10 } },
    },
  });

  const saveResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deck),
  });

  if (!saveResponse.ok) {
    throw new Error(`POST /api/decks pending-rules probe failed with ${saveResponse.status}`);
  }

  const saved = await saveResponse.json();
  const loadResponse = await fetch(absoluteUrl(`/api/decks/${saved.id}`));
  if (!loadResponse.ok) {
    throw new Error(`GET /api/decks/${saved.id} failed with ${loadResponse.status}`);
  }

  const loaded = await loadResponse.json();
  if (loaded.deck?.main?.["EB01-001"]) {
    throw new Error("Shared deck sanitizer kept pending-rules EB01-001 in the main deck");
  }

  if (loaded.deck?.art?.["EB01-001"]) {
    throw new Error("Shared deck sanitizer kept orphan art for pending-rules EB01-001");
  }

  if (loaded.deck?.prints?.main?.["EB01-001"]) {
    throw new Error("Shared deck sanitizer kept orphan prints for pending-rules EB01-001");
  }

  if (loaded.deck?.resource?.["R-001"] !== 10) {
    throw new Error("Shared deck sanitizer dropped valid resource cards");
  }
}

async function assertSharePrunesOrphanArt() {
  const deck = legalDeck({
    name: "Workflow QA Orphan Art",
    main: { "EB01-001": 4, ...legalMain },
    art: { "EB01-001": "standard", "ST01-001": "p1" },
    prints: {
      main: {
        "EB01-001": { standard: 4 },
        "ST01-001": { p1: 4 },
      },
      resource: { "R-001": { standard: 10 } },
    },
  });

  const saveResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deck),
  });

  if (!saveResponse.ok) {
    throw new Error(`POST /api/decks orphan-art probe failed with ${saveResponse.status}`);
  }

  const saved = await saveResponse.json();
  const loadResponse = await fetch(absoluteUrl(`/api/decks/${saved.id}`));
  if (!loadResponse.ok) {
    throw new Error(`GET /api/decks/${saved.id} failed with ${loadResponse.status}`);
  }

  const loaded = await loadResponse.json();
  if (loaded.deck?.main?.["EB01-001"] || loaded.deck?.art?.["EB01-001"]) {
    throw new Error("Shared deck sanitizer kept orphan pending-rules card/art data");
  }

  if (loaded.deck?.art?.["ST01-001"] !== "p1") {
    throw new Error("Shared deck sanitizer dropped valid surviving art choice");
  }
}

async function assertShareRejectsNonJsonContentType() {
  const response = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(legalDeck({ name: "Workflow QA Text Plain" })),
  });

  if (response.status !== 415) {
    throw new Error(`Expected text/plain share POST to return 415, got ${response.status}`);
  }

  const fakeJsonResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "text/not-really+json" },
    body: JSON.stringify(legalDeck({ name: "Workflow QA Fake JSON" })),
  });

  if (fakeJsonResponse.status !== 415) {
    throw new Error(
      `Expected fake +json share POST to return 415, got ${fakeJsonResponse.status}`,
    );
  }
}

async function assertShareRejectsIncompleteDecksAndMalformedQuantities() {
  const incompleteResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Workflow QA Incomplete", resource: { "R-001": 1 } }),
  });
  if (incompleteResponse.status !== 400) {
    throw new Error(`Expected incomplete share to return 400, got ${incompleteResponse.status}`);
  }

  const boolQuantityResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      legalDeck({
        name: "Workflow QA Bool Quantity",
        main: { ...legalMain, "ST01-001": true, "ST02-001": 3 },
      }),
    ),
  });
  if (boolQuantityResponse.status !== 400) {
    throw new Error(`Expected bool quantity share to return 400, got ${boolQuantityResponse.status}`);
  }

  const arrayQuantityResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      legalDeck({
        name: "Workflow QA Array Quantity",
        main: { ...legalMain, "ST01-001": [4] },
      }),
    ),
  });
  if (arrayQuantityResponse.status !== 400) {
    throw new Error(`Expected array quantity share to return 400, got ${arrayQuantityResponse.status}`);
  }
}

async function assertSharePreservesPreferredAltWhenTrimmingPrints() {
  const deck = legalDeck({
    name: "Workflow QA Alt Trim",
    art: { "ST01-001": "p7" },
    prints: {
      main: { "ST01-001": { p7: 4, p5: 999 } },
      resource: { "R-001": { standard: 10 } },
    },
  });

  const saveResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deck),
  });
  if (!saveResponse.ok) {
    throw new Error(`POST /api/decks alt-trim probe failed with ${saveResponse.status}`);
  }

  const saved = await saveResponse.json();
  const loadResponse = await fetch(absoluteUrl(`/api/decks/${saved.id}`));
  if (!loadResponse.ok) {
    throw new Error(`GET /api/decks/${saved.id} failed with ${loadResponse.status}`);
  }

  const loaded = await loadResponse.json();
  if (loaded.deck?.art?.["ST01-001"] !== "p7") {
    throw new Error("Shared deck sanitizer dropped preferred p7 art choice");
  }
  if (loaded.deck?.prints?.main?.["ST01-001"]?.p7 !== 4) {
    throw new Error("Shared deck sanitizer trimmed preferred p7 print copies first");
  }
}

async function assertInvalidShareBlocked(page) {
  const invalidDeck = {
    name: "Workflow QA Empty Deck",
    main: {},
    resource: {},
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

async function assertLocalStorageDropsPendingRulesCards(page) {
  const invalidDeck = {
    name: "Workflow QA Local Pending Rules",
    main: { "EB01-001": 4 },
    resource: { "R-001": 10 },
    art: { "EB01-001": "standard" },
    prints: {
      main: { "EB01-001": { standard: 4 } },
      resource: { "R-001": { standard: 10 } },
    },
  };

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate((deck) => {
    window.localStorage.setItem("gundam-deck-builder-v1", JSON.stringify(deck));
  }, invalidDeck);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => {
      const stored = window.localStorage.getItem("gundam-deck-builder-v1");
      if (!stored) return false;
      const deck = JSON.parse(stored);
      return (
        deck.name === "Workflow QA Local Pending Rules" &&
        !deck.main?.["EB01-001"] &&
        !deck.art?.["EB01-001"] &&
        !deck.prints?.main?.["EB01-001"] &&
        deck.resource?.["R-001"] === 10
      );
    },
    null,
    { timeout: 15000 },
  );
}

async function assertLocalStorageCapsLongDeckNames(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.localStorage.setItem(
      "gundam-deck-builder-v1",
      JSON.stringify({
        name: "X".repeat(120000),
        main: { "ST01-001": 1 },
        resource: { "R-001": 1 },
        art: {},
        prints: { main: {}, resource: {} },
      }),
    );
  });
  await page.reload({ waitUntil: "networkidle" });
  const name = await page.locator("input").first().inputValue();
  if (name.length > 80) {
    throw new Error(`Imported deck name was not capped: ${name.length} characters`);
  }
}

async function assertLibraryRowAddsFromBlankDeck(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start a new deck" }).click();
  await page.getByPlaceholder("Name, #, text").fill("ST01-001");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Add one Gundam ST01-001 main copy/i }).first().click();
  await page.waitForFunction(
    () => {
      const stored = window.localStorage.getItem("gundam-deck-builder-v1");
      if (!stored) return false;
      return JSON.parse(stored).main?.["ST01-001"] === 1;
    },
    null,
    { timeout: 15000 },
  );

  await page.getByPlaceholder("Name, #, text").fill("R-001");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Add one Resource R-001 resource copy/i }).first().click();
  await page.waitForFunction(
    () => {
      const stored = window.localStorage.getItem("gundam-deck-builder-v1");
      if (!stored) return false;
      return JSON.parse(stored).resource?.["R-001"] === 1;
    },
    null,
    { timeout: 15000 },
  );
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

async function assertMobileActionSheetFocusTrap(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator('button[title="More deck actions"]').click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("title") === "Load sample deck",
    null,
    { timeout: 15000 },
  );

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const focusInsideSheet = await page.evaluate(() => {
      const sheet = document.querySelector("#mobile-action-sheet");
      return Boolean(sheet?.contains(document.activeElement));
    });
    if (!focusInsideSheet) {
      throw new Error(`Mobile action sheet lost focus after Tab ${index + 1}`);
    }
  }

  await page.keyboard.press("Shift+Tab");
  const reverseFocusInsideSheet = await page.evaluate(() => {
    const sheet = document.querySelector("#mobile-action-sheet");
    return Boolean(sheet?.contains(document.activeElement));
  });
  if (!reverseFocusInsideSheet) {
    throw new Error("Mobile action sheet lost focus after Shift+Tab");
  }

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#mobile-action-sheet"));
}

async function assertResourceSearchRanksResourceCards(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Name, #, text").fill("Resource");
  try {
    await page.waitForFunction(
      () => {
        const firstCard = document.querySelector(".library-result");
        if (!firstCard) return false;
        return Array.from(firstCard.querySelectorAll("span")).some((chip) =>
          ["RESOURCE", "EX RESOURCE"].includes(chip.textContent?.trim() ?? ""),
        );
      },
      null,
      { timeout: 15000 },
    );
  } catch {
    // The detailed assertion below reports the stale/non-resource card title.
  }

  const firstResult = await page.locator(".library-result").first().evaluate((card) => {
    const chips = Array.from(card.querySelectorAll("span")).map((chip) =>
      chip.textContent?.trim(),
    );
    const typeChip = chips.find((chip) => chip === "RESOURCE" || chip === "EX RESOURCE");
    return {
      title: card.querySelector("h3")?.textContent?.trim() ?? "",
      typeChip,
    };
  });

  if (!firstResult.typeChip) {
    throw new Error(
      `Resource search first result is not a Resource card: ${firstResult.title}`,
    );
  }
}

async function assertMarketCatalogOnlyCardsAreLabeled(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Name, #, text").fill("EB01-001");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });
  await page.getByText("Catalog only").first().waitFor({ timeout: 15000 });
  await page.getByText("Rules pending").first().waitFor({ timeout: 15000 });

  await page.getByRole("button", { name: /Filters/i }).click();
  await page.getByLabel("Build").selectOption("Deck Ready");
  await page.getByText("No cards found").waitFor({ timeout: 15000 });

  await page.getByLabel("Build").selectOption("Catalog Only");
  await page.getByText("Catalog only").first().waitFor({ timeout: 15000 });
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
  const filterGeometry = await page.evaluate(() => {
    const popover = document.querySelector(".library-filters-popover");
    const nav = document.querySelector('nav[aria-label="Mobile workspace views"]');
    if (!popover || !nav) return { top: 0, navOverlap: 0 };
    const popoverRect = popover.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    return {
      top: popoverRect.top,
      navOverlap: Math.max(0, popoverRect.bottom - navRect.top),
    };
  });
  if (filterGeometry.top < 0) {
    throw new Error(`320px mobile filters start offscreen: top=${filterGeometry.top}`);
  }
  if (filterGeometry.navOverlap > 1) {
    throw new Error(`Mobile filters overlap bottom nav by ${filterGeometry.navOverlap}px`);
  }

  await page.getByRole("button", { name: /Filters/i }).click();
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Filters/i }).click();
  await page.locator(".library-filters-popover").waitFor({ timeout: 15000 });
  const landscapeTop = await page.locator(".library-filters-popover").evaluate(
    (popover) => popover.getBoundingClientRect().top,
  );
  if (landscapeTop < 0) {
    throw new Error(`Landscape mobile filters start offscreen: top=${landscapeTop}`);
  }

  await page.getByRole("button", { name: /Filters/i }).click();
  await page.setViewportSize({ width: 320, height: 680 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
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
  await page.locator('.card-lightbox button[aria-pressed="false"]').first().click();
  await page.waitForFunction(
    () => (document.querySelector(".card-lightbox")?.scrollTop ?? 999) <= 2,
    null,
    { timeout: 15000 },
  );
  const stageGeometry = await page.locator(".lightbox-card-stage").evaluate((stage) => {
    const rect = stage.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
    };
  });
  if (stageGeometry.top < 0 || stageGeometry.bottom > stageGeometry.viewportHeight + 1) {
    throw new Error(
      `Lightbox alt switch left card cropped: top=${stageGeometry.top}, bottom=${stageGeometry.bottom}, viewport=${stageGeometry.viewportHeight}`,
    );
  }
  await page.locator(".lightbox-close").click();
}

async function assertShortMobileControlsClearNav(page) {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => window.localStorage.removeItem("gundam-deck-builder-v1"));
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const libraryOverlap = await page.evaluate(() => {
    const actions = document.querySelector(".library-card-actions");
    const nav = document.querySelector('nav[aria-label="Mobile workspace views"]');
    if (!actions || !nav) return 0;
    return Math.max(0, actions.getBoundingClientRect().bottom - nav.getBoundingClientRect().top);
  });
  if (libraryOverlap > 1) {
    throw new Error(`320x568 library actions overlap bottom nav by ${libraryOverlap}px`);
  }

  await page.getByRole("button", { name: /Filters/i }).click();
  await page.locator(".library-filters-popover").waitFor({ timeout: 15000 });
  await page.locator(".library-filters-popover").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const budgetOverlap = await page.locator('input[type="number"]').evaluate((input) => {
    const nav = document.querySelector('nav[aria-label="Mobile workspace views"]');
    if (!nav) return 0;
    return Math.max(0, input.getBoundingClientRect().bottom - nav.getBoundingClientRect().top);
  });
  if (budgetOverlap > 1) {
    throw new Error(`320x568 filter budget control overlaps bottom nav by ${budgetOverlap}px`);
  }
  await page.getByRole("button", { name: /Filters/i }).click();

  await page.getByRole("tab", { name: "Show Deck" }).click();
  const deckOverlap = await page.evaluate(() => {
    const actions = document.querySelector(".deck-card-actions");
    const nav = document.querySelector('nav[aria-label="Mobile workspace views"]');
    if (!actions || !nav) return 0;
    return Math.max(0, actions.getBoundingClientRect().bottom - nav.getBoundingClientRect().top);
  });
  if (deckOverlap > 1) {
    throw new Error(`320x568 deck actions overlap bottom nav by ${deckOverlap}px`);
  }

  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const landscapeCardOverlap = await page.evaluate(() => {
    const firstCardButton = document.querySelector('.library-result button[aria-label^="Open large view"]');
    const nav = document.querySelector('nav[aria-label="Mobile workspace views"]');
    if (!firstCardButton || !nav) return 0;
    const cardRect = firstCardButton.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const xOverlap = Math.max(0, Math.min(cardRect.right, navRect.right) - Math.max(cardRect.left, navRect.left));
    const yOverlap = Math.max(0, Math.min(cardRect.bottom, navRect.bottom) - Math.max(cardRect.top, navRect.top));
    return xOverlap * yOverlap;
  });
  if (landscapeCardOverlap > 1) {
    throw new Error(`667x375 first library card overlaps mobile nav by ${landscapeCardOverlap}px^2`);
  }

  await page.getByRole("button", { name: /Filters/i }).click();
  const filterOpen = await page.locator(".library-filters-popover").isVisible();
  if (!filterOpen) {
    throw new Error("667x375 landscape filters did not open from the Library view");
  }
  const duplicateFilterLabels = await page.evaluate(() => ({
    color: document.querySelectorAll('select[aria-label="Color"]').length,
    type: document.querySelectorAll('select[aria-label="Type"]').length,
  }));
  if (duplicateFilterLabels.color !== 1 || duplicateFilterLabels.type !== 1) {
    throw new Error(
      `Duplicate filter aria labels found: ${JSON.stringify(duplicateFilterLabels)}`,
    );
  }
}

async function main() {
  await assertSharePreservesPrints();
  await assertShareDropsPendingRulesCards();
  await assertSharePrunesOrphanArt();
  await assertShareRejectsNonJsonContentType();
  await assertShareRejectsIncompleteDecksAndMalformedQuantities();
  await assertSharePreservesPreferredAltWhenTrimmingPrints();

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const missingPageResponse = await page.goto(absoluteUrl("/decks/not-a-real-deck-id").toString(), {
      waitUntil: "networkidle",
    });
    if (missingPageResponse?.status() !== 404) {
      throw new Error(`Missing shared deck page returned ${missingPageResponse?.status()}`);
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
    await assertMobileActionSheetFocusTrap(page);

    await assertMobileLibraryLayout(page);
    await assertShortMobileControlsClearNav(page);

    await page.setViewportSize({ width: 320, height: 680 });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Show Deck" }).click();
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
    await assertLocalStorageDropsPendingRulesCards(desktop);
    await assertLocalStorageCapsLongDeckNames(desktop);
    await assertLibraryRowAddsFromBlankDeck(desktop);
    await assertArtUpgradeKeepsBuyList(desktop);
    await assertResourceSearchRanksResourceCards(desktop);
    await assertMarketCatalogOnlyCardsAreLabeled(desktop);

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
