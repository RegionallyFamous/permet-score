import { chromium } from "@playwright/test";
import { access } from "node:fs/promises";
import { CARD_POOL } from "../app/card-pool.ts";

const baseUrl = process.env.PERMET_BASE_URL ?? "http://localhost:3000";
const baseHost = new URL(baseUrl).hostname;
const isLocalBase = ["localhost", "127.0.0.1", "::1"].includes(baseHost);
const libraryCount = CARD_POOL.length;

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

function absoluteUrl(path) {
  return new URL(path, baseUrl);
}

async function waitForAppShell(page) {
  await page.locator("main.app-shell").waitFor({ timeout: 15000 });
  await page.locator(".app-content-shell header").waitFor({ timeout: 15000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.permetHydrated === "true",
    null,
    { timeout: 15000 },
  );
}

async function gotoApp(page, url = baseUrl) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForAppShell(page);
}

async function reloadApp(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAppShell(page);
}

async function assertLocalShareFileExists(id) {
  if (!isLocalBase) return;
  await access(`.local/shared-decks/${id}.json`);
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

function legalMainReplacing(replacements) {
  const next = { ...legalMain };
  Object.keys(replacements).forEach((number) => {
    if (!(number in next)) delete next["ST01-001"];
  });
  Object.assign(next, replacements);
  return next;
}

async function assertSharePreservesPrints() {
  const deck = legalDeck({
    name: "Workflow QA Parallel Print",
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
  await assertLocalShareFileExists(saved.id);
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

async function assertShareAcceptsOfficialRulesCards() {
  const deck = legalDeck({
    name: "Workflow QA Official Rules",
    main: legalMainReplacing({ "EB01-001": 4 }),
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
    throw new Error(`Expected official-rules share POST to pass, got ${saveResponse.status}`);
  }
}

async function assertShareRejectsNonDeckResourceObjects() {
  const deck = legalDeck({
    name: "Workflow QA Non Deck Resource",
    resource: { "EXR-003": 10 },
    prints: { main: {}, resource: { "EXR-003": { standard: 10 } } },
  });

  const saveResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deck),
  });

  if (saveResponse.status !== 400) {
    throw new Error(
      `Expected non-deck-resource share POST to return 400, got ${saveResponse.status}`,
    );
  }
}

async function assertShareRejectsOrphanArt() {
  const deck = legalDeck({
    name: "Workflow QA Orphan Art",
    main: legalMainReplacing({ "EB01-001": 4 }),
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

  if (saveResponse.status !== 400) {
    throw new Error(`Expected orphan-art share POST to return 400, got ${saveResponse.status}`);
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

async function assertShareRejectsOversizedPayloads() {
  const oversizedBody = JSON.stringify({
    ...legalDeck({ name: "Workflow QA Oversized" }),
    extra: "x".repeat(70_000),
  });
  const oversizedResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: oversizedBody,
  });

  if (oversizedResponse.status !== 413) {
    throw new Error(`Expected oversized share to return 413, got ${oversizedResponse.status}`);
  }

  const encoder = new TextEncoder();
  const chunkedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(oversizedBody.slice(0, 2048)));
      controller.enqueue(encoder.encode(oversizedBody.slice(2048)));
      controller.close();
    },
  });
  const chunkedOversizedResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: chunkedBody,
    duplex: "half",
  });

  if (chunkedOversizedResponse.status !== 413) {
    throw new Error(
      `Expected chunked oversized share to return 413, got ${chunkedOversizedResponse.status}`,
    );
  }
}

async function assertShareRejectsOverflowingPrintQuantities() {
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
  if (saveResponse.status !== 400) {
    throw new Error(
      `Expected overflowing print quantities to return 400, got ${saveResponse.status}`,
    );
  }
}

async function assertInvalidShareBlocked(page) {
  await gotoApp(page);
  await page.getByRole("button", { name: "Start a new deck" }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes("0/50") && document.body.innerText.includes("0/10"),
    null,
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByText("Share needs cards").waitFor({ timeout: 15000 });

  await page.getByPlaceholder("Name, #, text").fill("ST01-001");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });
  await page.locator(".library-result").first().getByLabel(/Add one/i).click();
  await page.getByRole("button", { name: "Share" }).click();
  await page
    .locator(".toast-shell", { hasText: /Share link|Shared link|Deck link/i })
    .waitFor({ timeout: 15000 });
}

async function assertLocalStorageDropsNonDeckCards(page) {
  const invalidDeck = {
    name: "Workflow QA Local Non Deck",
    main: { "T-025": 4 },
    resource: { "R-001": 10 },
    art: { "T-025": "standard" },
    prints: {
      main: { "T-025": { standard: 4 } },
      resource: { "R-001": { standard: 10 } },
    },
  };

  await gotoApp(page);
  await page.evaluate((deck) => {
    window.localStorage.setItem("gundam-deck-builder-v1", JSON.stringify(deck));
  }, invalidDeck);
  await reloadApp(page);
  await page.waitForFunction(
    () => {
      const stored = window.localStorage.getItem("gundam-deck-builder-v1");
      if (!stored) return false;
      const deck = JSON.parse(stored);
      return (
        !deck.main?.["T-025"] &&
        !deck.art?.["T-025"] &&
        !deck.prints?.main?.["T-025"]
      );
    },
    null,
    { timeout: 15000 },
  );
}

async function assertLocalStorageCapsLongDeckNames(page) {
  await gotoApp(page);
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
  await reloadApp(page);
  const name = await page.locator("input").first().inputValue();
  if (name.length > 80) {
    throw new Error(`Imported deck name was not capped: ${name.length} characters`);
  }
}

async function assertLibraryRowAddsFromBlankDeck(page) {
  await gotoApp(page);
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

async function assertImportRejectsEmptyObject(page) {
  await gotoApp(page);
  const startingName = await page.locator("input").first().inputValue();
  await page.locator('input[type="file"]').setInputFiles({
    name: "empty-object.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await page.getByText("Import failed").waitFor({ timeout: 15000 });
  const currentName = await page.locator("input").first().inputValue();
  if (currentName !== startingName) {
    throw new Error(`Empty object import replaced deck "${startingName}" with "${currentName}"`);
  }
}

async function writeClipboard(page, text) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(baseUrl).origin,
  });
  await page.evaluate(async (value) => navigator.clipboard.writeText(value), text);
}

async function assertJsonImportDoesNotFallThroughToText(page) {
  await gotoApp(page);
  await page.getByRole("button", { name: "Load sample deck" }).click();
  const startingName = await page.locator("input").first().inputValue();
  await page.locator('input[type="file"]').setInputFiles({
    name: "not-a-deck.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ note: "ST01-001" })),
  });
  await page.getByText("Import failed").waitFor({ timeout: 15000 });
  const currentName = await page.locator("input").first().inputValue();
  if (currentName !== startingName) {
    throw new Error(`Non-deck JSON fell through to text import as "${currentName}"`);
  }
}

async function assertPasteConfirmsBeforeReplacingDeck(page) {
  await gotoApp(page);
  await page.getByRole("button", { name: "Load sample deck" }).click();
  const startingName = await page.locator("input").first().inputValue();
  await writeClipboard(page, "Name: Tiny Paste\nMain\n1 ST01-001\nResource\n1 R-001");

  const dialogPromise = page.waitForEvent("dialog", { timeout: 15000 }).then(async (dialog) => {
    const message = dialog.message();
    await dialog.dismiss();
    return message;
  });
  const [message] = await Promise.all([
    dialogPromise,
    page.getByRole("button", { name: "Paste decklist" }).click(),
  ]);

  if (!/replace the current deck/i.test(String(message))) {
    throw new Error(`Paste replacement dialog was not explicit: ${message}`);
  }

  const currentName = await page.locator("input").first().inputValue();
  if (currentName !== startingName) {
    throw new Error(`Paste replaced deck after dismissing confirmation: ${currentName}`);
  }
}

async function assertPlainTextImportPreservesPrintIds(page) {
  await gotoApp(page);
  await page.getByRole("button", { name: "Start a new deck" }).click();
  await writeClipboard(
    page,
    "Name: Parallel Text Import\nMain\n1 ST01-001 Gundam [ST01-001 P1] [print:p1]\nResource\n1 R-001 Resource [print:standard]",
  );
  await page.getByRole("button", { name: "Paste decklist" }).click();
  await page.waitForFunction(
    () => {
      const stored = window.localStorage.getItem("gundam-deck-builder-v1");
      if (!stored) return false;
      const deck = JSON.parse(stored);
      return deck.prints?.main?.["ST01-001"]?.p1 === 1;
    },
    null,
    { timeout: 15000 },
  );
}

async function assertPlainTextImportIgnoresRulesDigits(page) {
  await gotoApp(page);
  await page.getByRole("button", { name: "Start a new deck" }).click();
  await writeClipboard(
    page,
    [
      "Name: Rules Digits Import",
      "Main",
      "ST01-001 Gundam Lv 2",
      "ST01-002 x2 Gundam MA Form",
      "Resource",
      "R-001 Resource Lv 3",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Paste decklist" }).click();
  await page.waitForFunction(
    () => {
      const stored = window.localStorage.getItem("gundam-deck-builder-v1");
      if (!stored) return false;
      const deck = JSON.parse(stored);
      return (
        deck.name === "Rules Digits Import" &&
        deck.main?.["ST01-001"] === 1 &&
        deck.main?.["ST01-002"] === 2 &&
        deck.resource?.["R-001"] === 1
      );
    },
    null,
    { timeout: 15000 },
  );
}

async function assertBlockedKeyboardAddReportsConstraint(page) {
  await gotoApp(page);
  await page.getByRole("button", { name: "Start a new deck" }).click();
  await page.getByPlaceholder("Name, #, text").fill("ST01-001");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });
  for (let index = 0; index < 4; index += 1) {
    await page.locator(".library-result").first().getByLabel(/^Add one/i).click();
  }
  await page
    .getByLabel("Card inspector")
    .getByRole("heading", { name: /^Gundam$/i })
    .waitFor({ timeout: 15000 });
  await page.waitForFunction(
    () => {
      const deck = JSON.parse(window.localStorage.getItem("gundam-deck-builder-v1") ?? "{}");
      return deck.main?.["ST01-001"] === 4;
    },
    null,
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("=");
  await page.getByText("Add blocked").waitFor({ timeout: 15000 });
  const quantity = await page.evaluate(() => {
    const deck = JSON.parse(window.localStorage.getItem("gundam-deck-builder-v1") ?? "{}");
    return deck.main?.["ST01-001"];
  });
  if (quantity !== 4) {
    throw new Error(`Blocked keyboard add changed quantity to ${quantity}`);
  }
}

async function assertStartPanelVisibleOnMobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.localStorage.removeItem("gundam-deck-builder-v1"));
  await gotoApp(page);

  const audit = await page.evaluate(() => {
    const panel = document.querySelector(".start-build-panel");
    const browse = Array.from(document.querySelectorAll("button")).find((button) =>
      /^Browse$/i.test(button.textContent?.trim() ?? ""),
    );
    if (!panel || !browse) return { height: 0, hitText: "", browseVisible: false };
    const panelRect = panel.getBoundingClientRect();
    const browseRect = browse.getBoundingClientRect();
    const hit = document.elementFromPoint(
      browseRect.left + browseRect.width / 2,
      browseRect.top + browseRect.height / 2,
    );
    return {
      height: panelRect.height,
      hitText: hit?.closest("button")?.textContent?.trim() ?? "",
      browseVisible: browseRect.width > 0 && browseRect.height > 0,
    };
  });

  if (audit.height < 120 || !audit.browseVisible || audit.hitText !== "Browse") {
    throw new Error(`Start panel is collapsed or covered on mobile: ${JSON.stringify(audit)}`);
  }
}

async function assertEmptyDeckArtButtonsExplainNoOp(page) {
  await gotoApp(page);
  await page.getByRole("button", { name: "Start a new deck" }).click();
  await page.getByRole("button", { name: "Upgrade deck art budget" }).click();
  await page.getByText("No prints to tune").waitFor({ timeout: 15000 });
}

async function assertSelectedCardArtButtonsTrackMixedPrints(page) {
  await page.evaluate(() => window.localStorage.removeItem("gundam-deck-builder-v1"));
  await gotoApp(page);
  await page.getByRole("button", { name: "Start a new deck" }).click();
  await page.getByPlaceholder("Name, #, text").fill("ST01-001");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });

  const addMain = page
    .getByRole("button", { name: /Add one Gundam ST01-001 main copy/i })
    .first();
  for (let index = 0; index < 4; index += 1) {
    await addMain.click();
  }
  await page.waitForFunction(
    () => JSON.parse(window.localStorage.getItem("gundam-deck-builder-v1") ?? "{}").main?.["ST01-001"] === 4,
    null,
    { timeout: 15000 },
  );

  await page.locator('button[title="Upgrade deck art budget"]').click();
  const down = page.getByRole("button", { name: "Downgrade art cost" });
  await down.click();
  if (await down.isDisabled()) {
    throw new Error("Selected-card art Down disabled while upgraded copies remain");
  }
  for (let index = 0; index < 3; index += 1) {
    await down.click();
  }
  if (!(await down.isDisabled())) {
    throw new Error("Selected-card art Down stayed enabled after all copies reached standard");
  }

  const deckArtUp = page.locator('button[title="Upgrade deck art budget"]').first();
  for (let index = 0; index < 6; index += 1) {
    await deckArtUp.click();
  }
  const up = page.getByRole("button", { name: "Upgrade art cost" });
  await up.click();
  if (await up.isDisabled()) {
    throw new Error("Selected-card art Up disabled while lower-tier copies remain");
  }
}

async function assertSampleDeckClearsLibraryFilters(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoApp(page);
  await page.getByPlaceholder("Name, #, text").fill("<script>alert(1)</script> ST01-001");
  await page.getByText("No cards found").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Load sample deck" }).click();
  await page.waitForFunction(
    () => document.querySelector('input[aria-label="Search cards"]')?.value === "",
    null,
    { timeout: 15000 },
  );
  await page.waitForFunction(
    (expected) => document.querySelector(".library-pager")?.textContent?.includes(expected),
    `1-6of ${libraryCount}`,
    { timeout: 15000 },
  );
  await page.getByRole("heading", { name: "Gundam", exact: true }).first().waitFor({
    timeout: 15000,
  });
}

async function assertNoResultSearchShowsRecovery(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoApp(page);
  await page.locator("#card-panel h2", { hasText: "Gundam" }).first().waitFor({
    timeout: 15000,
  });
  await page.getByPlaceholder("Name, #, text").fill("definitely-not-a-real-card");
  await page.getByText("No cards found").waitFor({ timeout: 15000 });
  await page.locator("#card-panel h2", { hasText: "No Card Selected" }).waitFor({
    timeout: 15000,
  });
  await page.locator("#card-panel").getByRole("button", { name: "Clear All" }).click();
  await page.waitForFunction(
    (expected) => document.querySelector(".library-pager")?.textContent?.includes(expected),
    `1-6of ${libraryCount}`,
    { timeout: 15000 },
  );
  if (!(await page.locator("#card-panel h2", { hasText: "Gundam" }).first().isVisible())) {
    throw new Error("Clear All from empty inspector did not restore the selected card");
  }
}

async function assertLibraryMicroInteractions(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoApp(page);

  await page.getByPlaceholder("Name, #, text").fill("gundam blue");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });
  await page.locator(".library-result").first().getByRole("heading", { name: /Gundam/i }).waitFor({
    timeout: 15000,
  });

  await page.getByRole("button", { name: "Clear search" }).click();
  await page.waitForFunction(
    () => document.querySelector('input[aria-label="Search cards"]')?.value === "",
    null,
    { timeout: 15000 },
  );

  await page.getByPlaceholder("Name, #, text").fill("ST01-002");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });
  await page.locator(".library-result").first().getByRole("heading").click();
  const selectedPressed = await page
    .locator(".library-result")
    .first()
    .getByRole("button", { name: /Select/i })
    .getAttribute("aria-pressed");
  if (selectedPressed !== "true") {
    throw new Error(`Library row click did not select first result: ${selectedPressed}`);
  }

  await page.locator(".library-result").first().dblclick();
  await page.getByRole("dialog", { name: /Gundam/i }).waitFor({ timeout: 15000 });
  const beforePrint = await page.locator('[role="dialog"] [aria-pressed="true"]').first().getAttribute("aria-label");
  await page.keyboard.press("ArrowRight");
  const afterPrint = await page.locator('[role="dialog"] [aria-pressed="true"]').first().getAttribute("aria-label");
  if (!afterPrint || afterPrint === beforePrint) {
    throw new Error(`Lightbox next print did not change active print: ${beforePrint} -> ${afterPrint}`);
  }
  await page.keyboard.press("Escape");
}

async function assertSharedPreviewRequiresCloneBeforeEditing(page) {
  const deck = legalDeck({ name: "Workflow QA Shared Preview" });
  const saveResponse = await fetch(absoluteUrl("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deck),
  });
  if (!saveResponse.ok) {
    throw new Error(`POST /api/decks shared-preview probe failed with ${saveResponse.status}`);
  }

  const saved = await saveResponse.json();
  await assertLocalShareFileExists(saved.id);
  await gotoApp(page, absoluteUrl(`/decks/${saved.id}`).toString());
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute("href");
  const expectedCanonical = `https://permetlink.com/decks/${saved.id}`;
  if (canonical !== expectedCanonical) {
    throw new Error(`Shared deck canonical was ${canonical}, expected ${expectedCanonical}`);
  }

  async function assertDisabled(control, message) {
    if (!(await control.isDisabled())) {
      throw new Error(message);
    }
  }

  const copiedSharedLinks = [];
  await page.exposeFunction("captureSharedPreviewClipboard", (value) => {
    copiedSharedLinks.push(value);
  });
  await gotoApp(page, absoluteUrl(`/decks/${saved.id}?debug=1#frag`).toString());
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value) => globalThis.captureSharedPreviewClipboard(value),
      },
    });
  });

  let sharedPreviewPostCount = 0;
  await page.route("**/api/decks", async (route) => {
    if (route.request().method() === "POST") {
      sharedPreviewPostCount += 1;
      await route.fulfill({
        status: 599,
        contentType: "application/json",
        body: JSON.stringify({ error: "Shared preview should not create a new share" }),
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Copy current shared deck link" }).click();
  await page.waitForTimeout(400);
  await page.unroute("**/api/decks");
  if (sharedPreviewPostCount !== 0) {
    throw new Error("Shared preview Share posted a new /api/decks record instead of copying the current URL");
  }
  const expectedShareUrl = absoluteUrl(`/decks/${saved.id}`).toString();
  if (copiedSharedLinks.at(-1) !== expectedShareUrl) {
    throw new Error(
      `Shared preview copied ${copiedSharedLinks.at(-1)}, expected clean URL ${expectedShareUrl}`,
    );
  }

  const desktopLockedControls = [
    [page.getByRole("button", { name: "Start a new deck" }), "new deck button"],
    [page.getByRole("button", { name: "Load sample deck" }), "sample deck button"],
    [page.getByRole("button", { name: "Import deck" }), "import button"],
    [page.getByRole("button", { name: "Paste decklist" }), "paste button"],
    [page.getByRole("button", { name: "Mark Deck Prints Owned" }), "mark-owned button"],
    [page.getByRole("button", { name: "Add owned selected print" }), "owned increment button"],
    [page.getByRole("button", { name: "Remove owned selected print" }), "owned decrement button"],
    [
      page.locator("#library-panel .library-result").first().locator(".mini-stepper button").first(),
      "library decrement button",
    ],
    [
      page.locator("#library-panel .library-result").first().locator(".mini-stepper button").last(),
      "library increment button",
    ],
    [
      page.locator("#deck-panel .deck-card-actions").first().locator(".mini-stepper button").first(),
      "deck row decrement button",
    ],
    [
      page.locator("#deck-panel .deck-card-actions").first().locator(".mini-stepper button").last(),
      "deck row increment button",
    ],
    [
      page.locator("#deck-panel .deck-card-actions").first().locator("button").last(),
      "deck row remove button",
    ],
    [
      page.locator("#card-panel .quantity-stepper").first().locator("button").first(),
      "inspector main decrement button",
    ],
    [
      page.locator("#card-panel .quantity-stepper").first().locator("button").last(),
      "inspector main increment button",
    ],
    [
      page.locator("#card-panel .quantity-stepper").nth(1).locator("button").first(),
      "inspector resource decrement button",
    ],
    [
      page.locator("#card-panel .quantity-stepper").nth(1).locator("button").last(),
      "inspector resource increment button",
    ],
    [page.locator('#card-panel button[title="Clone to edit"]').first(), "inspector art down button"],
    [page.locator('#card-panel button[title="Clone to edit"]').nth(1), "inspector art up button"],
  ];
  for (const [control, label] of desktopLockedControls) {
    await assertDisabled(control, `Shared preview exposes an enabled mutating desktop control: ${label}`);
  }

  const name = await page.locator("input").first().inputValue();
  if (name !== deck.name) {
    throw new Error(`Shared preview was mutated before clone: ${name}`);
  }
  if (!/\/decks\//.test(page.url())) {
    throw new Error(`Shared preview unexpectedly navigated away: ${page.url()}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await reloadApp(page);
  await page.getByRole("button", { name: "More deck actions" }).click();
  await page.getByText("Shared preview · clone to edit").waitFor({ timeout: 15000 });
  const mobileLockedControls = [
    [page.getByRole("button", { name: "Start a new deck" }), "mobile new deck button"],
    [page.getByRole("button", { name: "Load sample deck" }), "mobile sample deck button"],
    [page.getByRole("button", { name: "Import deck" }), "mobile import button"],
    [page.getByRole("button", { name: "Paste decklist" }), "mobile paste button"],
    [page.getByRole("button", { name: "Downgrade deck art budget" }), "mobile art down button"],
    [page.getByRole("button", { name: "Upgrade deck art budget" }), "mobile art up button"],
  ];
  for (const [control, label] of mobileLockedControls) {
    await assertDisabled(control, `Shared preview exposes an enabled mutating mobile action: ${label}`);
  }
}

async function assertAccessibleControlNames(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoApp(page);

  const desktopAudit = await page.evaluate(() => {
    const filterButton = Array.from(document.querySelectorAll("button")).find((button) =>
      /\bFilters\b/i.test(button.textContent ?? ""),
    );
    const largeViewButtons = Array.from(
      document.querySelectorAll('button[aria-label^="Open large view"]'),
    ).filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const labels = largeViewButtons.map((button) => button.getAttribute("aria-label") ?? "");
    return {
      filterControls: filterButton?.getAttribute("aria-controls") ?? null,
      filterPanelMounted: Boolean(document.querySelector("#library-advanced-filters")),
      duplicateLabels: labels.filter((label, index) => labels.indexOf(label) !== index),
    };
  });

  if (desktopAudit.filterControls || desktopAudit.filterPanelMounted) {
    throw new Error(
      `Closed filters should not point at an unmounted panel: ${JSON.stringify(desktopAudit)}`,
    );
  }
  await page.getByRole("button", { name: /Filters/i }).click();
  const openFilterControls = await page
    .getByRole("button", { name: /Filters/i })
    .getAttribute("aria-controls");
  if (openFilterControls !== "library-advanced-filters") {
    throw new Error(`Open filters dropped aria-controls: ${openFilterControls}`);
  }
  if (desktopAudit.duplicateLabels.length) {
    throw new Error(
      `Visible large-card buttons have duplicate labels: ${desktopAudit.duplicateLabels.join(", ")}`,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  const closedMobileMoreControls = await page
    .locator('button[title="More deck actions"]')
    .getAttribute("aria-controls");
  if (closedMobileMoreControls) {
    throw new Error(`Closed mobile More button points at unmounted panel: ${closedMobileMoreControls}`);
  }
  await page.locator('button[title="More deck actions"]').click();
  await page.getByRole("dialog", { name: "More deck actions" }).waitFor({
    timeout: 15000,
  });
  const mobileMoreControls = await page
    .locator('button[title="More deck actions"]')
    .getAttribute("aria-controls");
  if (mobileMoreControls !== "mobile-action-sheet") {
    throw new Error(`Mobile More button dropped aria-controls: ${mobileMoreControls}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#mobile-action-sheet"));

  await page.setViewportSize({ width: 1280, height: 720 });
}

async function assertArtUpgradeKeepsBuyList(page) {
  await page.evaluate(() => window.localStorage.removeItem("gundam-deck-builder-v1"));
  await gotoApp(page);
  await page.locator('button[title="Upgrade deck art budget"]').click();
  await page.locator('button[title="Open TCG print list"]').click();
  await page.getByRole("heading", { name: "TCG List" }).waitFor({ timeout: 15000 });
  const buyList = await page.locator("textarea").inputValue();
  if (!/ST01-\d{3}/.test(buyList) || buyList.length < 100) {
    throw new Error(`Art upgrade cleared the TCG list: ${buyList.slice(0, 80)}`);
  }
  await page.locator('button[aria-label="Close fallback panel"]').click();
}

async function assertMobileActionSheetFocusTrap(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await page.getByRole("button", { name: "More deck actions" }).click();
  await page.locator("#mobile-action-sheet").waitFor({ timeout: 15000 });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("title") === "Close more deck actions",
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
  await gotoApp(page);
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
  await gotoApp(page);
  await page.getByPlaceholder("Name, #, text").fill("T-025");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });
  await page.getByText("Catalog only").first().waitFor({ timeout: 15000 });
  const tokenChipVisible = await page.locator(".library-result").first().evaluate((card) =>
    Array.from(card.querySelectorAll("span")).some(
      (chip) => chip.textContent?.trim() === "UNIT TOKEN",
    ),
  );
  if (!tokenChipVisible) {
    throw new Error("Catalog-only token result is missing the visible UNIT TOKEN type chip.");
  }

  await page.getByRole("button", { name: /Filters/i }).click();
  await page.getByLabel("Card Data").selectOption("Deck Ready");
  await page.getByText("No cards found").waitFor({ timeout: 15000 });

  await page.getByLabel("Card Data").selectOption("Catalog Only");
  await page.getByText("Catalog only").first().waitFor({ timeout: 15000 });
}

async function assertMobileLibraryLayout(page) {
  await page.setViewportSize({ width: 320, height: 680 });
  await page.evaluate(() => window.localStorage.removeItem("gundam-deck-builder-v1"));
  await gotoApp(page);

  await page.getByRole("tab", { name: "Show Library" }).click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Search cards",
    null,
    { timeout: 15000 },
  );

  const tcgClipping = await page
    .locator('.library-result a[aria-label*="TCGplayer"]')
    .first()
    .evaluate((link) => {
      const linkRect = link.getBoundingClientRect();
      const cardRect = link.closest(".library-result").getBoundingClientRect();
      return Math.max(0, linkRect.right - cardRect.right);
    });
  if (tcgClipping > 1) {
    throw new Error(`320px library TCG button clips by ${tcgClipping}px`);
  }

  const mobileActionAudit = await page.evaluate(() => {
    const pagerNext = document.querySelector('button[aria-label="Next library page"]');
    const pageSize = document.querySelector('select[aria-label="Cards per library page"]');
    const actionTargets = Array.from(
      document.querySelectorAll(
        '.library-card-actions button[aria-label^="Select"], .library-card-actions button[aria-label*="details from action row"], .library-card-actions a[aria-label*="TCGplayer"]',
      ),
    ).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        label: node.getAttribute("aria-label") ?? node.textContent ?? "",
        width: rect.width,
        height: rect.height,
      };
    });
    const pagerRect = pagerNext?.getBoundingClientRect();
    const pageSizeRect = pageSize?.getBoundingClientRect();
    return {
      pagerVisible: Boolean(pagerRect && pagerRect.width > 0 && pagerRect.height > 0),
      pageSizeVisible: Boolean(
        pageSizeRect && pageSizeRect.width >= 44 && pageSizeRect.height >= 44,
      ),
      narrowActions: actionTargets.filter((target) => target.width < 44 || target.height < 44),
    };
  });
  if (!mobileActionAudit.pagerVisible) {
    throw new Error("320px library pagination next button is not visible");
  }
  if (!mobileActionAudit.pageSizeVisible) {
    throw new Error("320px library page-size selector is not visible");
  }
  if (mobileActionAudit.narrowActions.length) {
    throw new Error(
      `320px library actions below 44px: ${JSON.stringify(mobileActionAudit.narrowActions)}`,
    );
  }

  await page.getByPlaceholder("Name, #, text").fill("ST01-001");
  await page.locator(".library-result").first().waitFor({ timeout: 15000 });
  const addMain = page
    .getByRole("button", { name: /Add one Gundam ST01-001 main copy/i })
    .first();
  const addBox = await addMain.boundingBox();
  if (!addBox) throw new Error("Missing mobile add button box for press-hold test");
  await page.mouse.move(addBox.x + addBox.width / 2, addBox.y + addBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await page.waitForFunction(
    () => {
      const deck = JSON.parse(window.localStorage.getItem("gundam-deck-builder-v1") ?? "{}");
      return deck.main?.["ST01-001"] === 4;
    },
    null,
    { timeout: 15000 },
  );
  const pulseVisible = await page.locator('[data-pulse]').first().isVisible().catch(() => false);
  if (!pulseVisible) {
    throw new Error("Press-hold add did not leave a visible pulse marker");
  }
  await page.getByPlaceholder("Name, #, text").fill("");

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

  await page.getByRole("button", { name: "Done" }).click();
  await page.setViewportSize({ width: 667, height: 375 });
  await gotoApp(page);
  await page.getByRole("button", { name: /Filters/i }).click();
  await page.locator(".library-filters-popover").waitFor({ timeout: 15000 });
  const landscapeTop = await page.locator(".library-filters-popover").evaluate(
    (popover) => popover.getBoundingClientRect().top,
  );
  if (landscapeTop < 0) {
    throw new Error(`Landscape mobile filters start offscreen: top=${landscapeTop}`);
  }

  await page.getByRole("button", { name: "Done" }).click();
  await page.setViewportSize({ width: 320, height: 680 });
  await gotoApp(page);
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

async function assertMobileTouchTargets(page) {
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 620 },
    { width: 390, height: 844 },
    { width: 667, height: 375 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await gotoApp(page);
    const librarySmallTargets = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          ".library-card-actions .mini-stepper button, .library-card-actions > button, .library-card-actions > a",
        ),
      )
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label: node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "",
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((target) => target.width > 0 && target.height > 0)
        .filter((target) => target.width < 44 || target.height < 44),
    );
    if (librarySmallTargets.length) {
      throw new Error(
        `${viewport.width}x${viewport.height} library targets below 44px: ${JSON.stringify(
          librarySmallTargets,
        )}`,
      );
    }

    await page.getByRole("tab", { name: "Show Card" }).click();
    const inspectorSmallTargets = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".quantity-stepper button"))
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label: node.getAttribute("aria-label") ?? "",
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((target) => target.width > 0 && target.height > 0)
        .filter((target) => target.width < 44 || target.height < 44),
    );
    if (inspectorSmallTargets.length) {
      throw new Error(
        `${viewport.width}x${viewport.height} inspector targets below 44px: ${JSON.stringify(
          inspectorSmallTargets,
        )}`,
      );
    }

    await page.getByRole("tab", { name: "Show Deck" }).click();
    const deckSmallTargets = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          ".deck-card-actions .mini-stepper button, .deck-card-actions > a, .deck-card-actions > button",
        ),
      )
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label: node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "",
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((target) => target.width > 0 && target.height > 0)
        .filter((target) => target.width < 44 || target.height < 44),
    );
    if (deckSmallTargets.length) {
      throw new Error(
        `${viewport.width}x${viewport.height} deck targets below 44px: ${JSON.stringify(
          deckSmallTargets,
        )}`,
      );
    }
  }

  await page.setViewportSize({ width: 1280, height: 720 });
}

async function assertShortMobileControlsClearNav(page) {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => window.localStorage.removeItem("gundam-deck-builder-v1"));
  await gotoApp(page);
  await page.locator(".library-card-actions").first().evaluate((node) => {
    node.scrollIntoView({ block: "center" });
  });

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
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("tab", { name: "Show Library" }).click();
  await page.evaluate(() => {
    const scroller = document.querySelector(".app-content-shell > section");
    if (scroller) scroller.scrollTop = 760;
  });
  await page.getByRole("tab", { name: "Show Deck" }).click();
  const deckTabScroll = await page.evaluate(() => {
    const scroller = document.querySelector(".app-content-shell > section");
    const heading = document.querySelector("#deck-panel h2");
    return {
      scrollTop: scroller?.scrollTop ?? -1,
      headingTop: heading?.getBoundingClientRect().top ?? -999,
    };
  });
  if (deckTabScroll.scrollTop > 2 || deckTabScroll.headingTop < 0) {
    throw new Error(`320x568 deck tab preserved stale scroll: ${JSON.stringify(deckTabScroll)}`);
  }

  const deckOverlap = await page.evaluate(() => {
    const actions = document.querySelector(".deck-card-actions");
    const nav = document.querySelector('nav[aria-label="Mobile workspace views"]');
    if (!actions || !nav) return 0;
    return Math.max(0, actions.getBoundingClientRect().bottom - nav.getBoundingClientRect().top);
  });
  if (deckOverlap > 1) {
    throw new Error(`320x568 deck actions overlap bottom nav by ${deckOverlap}px`);
  }
  const deckActionChildOverlap = await page.evaluate(() => {
    const actions = document.querySelector(".deck-card-actions");
    if (!actions) return [];
    const children = Array.from(actions.children)
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        return {
          index,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          label: node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "",
        };
      })
      .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
    const overlaps = [];
    for (let first = 0; first < children.length; first += 1) {
      for (let second = first + 1; second < children.length; second += 1) {
        const a = children[first];
        const b = children[second];
        const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (xOverlap * yOverlap > 1) overlaps.push([a.label, b.label, xOverlap, yOverlap]);
      }
    }
    return overlaps;
  });
  if (deckActionChildOverlap.length) {
    throw new Error(`320x568 deck action children overlap: ${JSON.stringify(deckActionChildOverlap)}`);
  }

  await page.setViewportSize({ width: 430, height: 320 });
  await gotoApp(page);
  const compactLandscapeCard = await page.evaluate(() => {
    const card = document.querySelector(".library-result");
    if (!card) return { visible: 0, top: 0, headerHeight: 0 };
    const cardRect = card.getBoundingClientRect();
    const headerRect = document
      .querySelector(".app-content-shell > header")
      ?.getBoundingClientRect();
    return {
      visible: Math.max(
        0,
        Math.min(window.innerHeight, cardRect.bottom) - Math.max(0, cardRect.top),
      ),
      top: cardRect.top,
      headerHeight: headerRect?.height ?? 0,
    };
  });
  if (compactLandscapeCard.visible < 72) {
    throw new Error(
      `430x320 landscape hides first library card: ${JSON.stringify(compactLandscapeCard)}`,
    );
  }

  await page.setViewportSize({ width: 667, height: 375 });
  await gotoApp(page);
  const landscapePagerVisible = await page
    .locator('button[aria-label="Next library page"]')
    .evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  if (!landscapePagerVisible) {
    throw new Error("667x375 library pagination next button is not visible");
  }

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
  await assertShareAcceptsOfficialRulesCards();
  await assertShareRejectsNonDeckResourceObjects();
  await assertShareRejectsOrphanArt();
  await assertShareRejectsNonJsonContentType();
  await assertShareRejectsIncompleteDecksAndMalformedQuantities();
  await assertShareRejectsOversizedPayloads();
  await assertShareRejectsOverflowingPrintQuantities();

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const notFoundPageResponse = await page.goto(
      absoluteUrl("/decks/not-a-real-deck-id").toString(),
      { waitUntil: "domcontentloaded" },
    );
    if (notFoundPageResponse?.status() !== 404) {
      throw new Error(`Shared deck 404 page returned ${notFoundPageResponse?.status()}`);
    }
    await page.getByText("Shared Deck Not Found").waitFor({ timeout: 15000 });
    await page.getByRole("link", { name: /Open Builder/i }).waitFor({
      state: "visible",
      timeout: 15000,
    });

    await gotoApp(page);
    await page.getByRole("button", { name: "More deck actions" }).click();
    await page.locator("#mobile-action-sheet").waitFor({ timeout: 15000 });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#mobile-action-sheet"));
    await assertMobileActionSheetFocusTrap(page);

    await assertStartPanelVisibleOnMobile(page);
    await assertMobileLibraryLayout(page);
    await assertShortMobileControlsClearNav(page);

    await page.setViewportSize({ width: 320, height: 680 });
    await gotoApp(page);
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
    await assertLocalStorageDropsNonDeckCards(desktop);
    await assertLocalStorageCapsLongDeckNames(desktop);
    await assertLibraryRowAddsFromBlankDeck(desktop);
    await assertImportRejectsEmptyObject(desktop);
    await assertJsonImportDoesNotFallThroughToText(desktop);
    await assertPasteConfirmsBeforeReplacingDeck(desktop);
    await assertPlainTextImportPreservesPrintIds(desktop);
    await assertPlainTextImportIgnoresRulesDigits(desktop);
    await assertBlockedKeyboardAddReportsConstraint(desktop);
    await assertEmptyDeckArtButtonsExplainNoOp(desktop);
    await assertSelectedCardArtButtonsTrackMixedPrints(desktop);
    await assertSampleDeckClearsLibraryFilters(desktop);
    await assertNoResultSearchShowsRecovery(desktop);
    await assertLibraryMicroInteractions(desktop);
    await assertSharedPreviewRequiresCloneBeforeEditing(desktop);
    await assertAccessibleControlNames(desktop);
    await assertArtUpgradeKeepsBuyList(desktop);
    await assertResourceSearchRanksResourceCards(desktop);
    await assertMarketCatalogOnlyCardsAreLabeled(desktop);
    await assertMobileTouchTargets(desktop);

    await gotoApp(desktop);
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
