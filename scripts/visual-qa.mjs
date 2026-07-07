import { chromium } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = process.env.PERMET_BASE_URL ?? "http://localhost:3000";
const outputDir = join(process.cwd(), "qa-screenshots");
const viewports = [
  { name: "compact", width: 320, height: 680 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1280, height: 720 },
  { name: "wide", width: 1440, height: 900 },
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

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

const browser = await launchBrowser();

async function waitForVisibleCardImages(page) {
  await page.waitForFunction(
    () => {
      const images = Array.from(document.querySelectorAll('img[alt$=" card"]')).filter(
        (image) => {
          const rect = image.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
        },
      );
      const eagerImages = images.filter((image) => image.loading === "eager");
      const loadedImages = images.filter((image) => image.complete && image.naturalWidth > 0);

      return (
        loadedImages.length > 0 &&
        eagerImages.every((image) => image.complete && image.naturalWidth > 0)
      );
    },
    null,
    { timeout: 15000 },
  );
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
}

async function assertLocalCardImagesStayLocal(page, viewportName) {
  const remoteLocalImages = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img[src^="/card-images/"]'))
      .filter((image) => /product-images\.tcgplayer\.com/i.test(image.getAttribute("srcset") ?? ""))
      .map((image) => ({
        alt: image.getAttribute("alt") ?? "",
        src: image.getAttribute("src") ?? "",
        srcset: image.getAttribute("srcset") ?? "",
      }))
      .slice(0, 3),
  );

  if (remoteLocalImages.length) {
    throw new Error(
      `${viewportName}: local card images include remote TCGplayer srcset ${JSON.stringify(
        remoteLocalImages,
      )}`,
    );
  }
}

async function readAudit(page) {
  try {
    return await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth - viewportWidth;
      const visibleButtons = Array.from(document.querySelectorAll("button")).filter(
        (button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        },
      ).length;
      const overflowOffenders = Array.from(document.body.querySelectorAll("*"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return {
            tag: element.tagName.toLowerCase(),
            text: element.textContent?.trim().slice(0, 60) ?? "",
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > 0 &&
              rect.top < window.innerHeight &&
              style.visibility !== "hidden" &&
              style.display !== "none",
          };
        })
        .filter(
          (item) =>
            item.visible && (item.left < -1 || item.right > viewportWidth + 1),
        )
        .slice(0, 5);

      return {
        title: document.title,
        overflow,
        overflowOffenders,
        visibleButtons,
        hasMobileNav: window.matchMedia("(max-width: 1279px)").matches
          ? Boolean(document.querySelector('nav[aria-label="Mobile workspace views"]'))
          : true,
      };
    });
  } catch {
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
    return page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth - viewportWidth;
      const visibleButtons = Array.from(document.querySelectorAll("button")).filter(
        (button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        },
      ).length;
      const overflowOffenders = Array.from(document.body.querySelectorAll("*"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return {
            tag: element.tagName.toLowerCase(),
            text: element.textContent?.trim().slice(0, 60) ?? "",
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > 0 &&
              rect.top < window.innerHeight &&
              style.visibility !== "hidden" &&
              style.display !== "none",
          };
        })
        .filter(
          (item) =>
            item.visible && (item.left < -1 || item.right > viewportWidth + 1),
        )
        .slice(0, 5);

      return {
        title: document.title,
        overflow,
        overflowOffenders,
        visibleButtons,
        hasMobileNav: window.matchMedia("(max-width: 1279px)").matches
          ? Boolean(document.querySelector('nav[aria-label="Mobile workspace views"]'))
          : true,
      };
    });
  }
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Permet Link", exact: true }).waitFor({
      state: "visible",
      timeout: 15000,
    });
    await waitForVisibleCardImages(page);
    await assertLocalCardImagesStayLocal(page, viewport.name);
    await page.screenshot({
      caret: "initial",
      path: join(outputDir, `permet-${viewport.name}.png`),
      fullPage: false,
    });

    const audit = await readAudit(page);

    if (audit.title !== "Permet Link") {
      throw new Error(`${viewport.name}: unexpected title ${audit.title}`);
    }
    if (audit.overflow > 1) {
      throw new Error(`${viewport.name}: horizontal overflow ${audit.overflow}px`);
    }
    if (audit.overflowOffenders.length) {
      throw new Error(
        `${viewport.name}: visible child overflow ${JSON.stringify(audit.overflowOffenders)}`,
      );
    }
    if (!audit.hasMobileNav) {
      throw new Error(`${viewport.name}: missing mobile cockpit nav`);
    }
    if (audit.visibleButtons < 4) {
      throw new Error(`${viewport.name}: expected visible controls`);
    }
    const blockingConsoleErrors = consoleErrors.filter((message) =>
      /(hydration|Minified React error #418|did not match|Text content does not match)/i.test(message),
    );
    if (blockingConsoleErrors.length) {
      throw new Error(
        `${viewport.name}: hydration console errors ${JSON.stringify(blockingConsoleErrors.slice(0, 3))}`,
      );
    }

    if (viewport.width <= 360) {
      const compactActionAudit = await page.evaluate(() => {
        const actions = document.querySelector(".library-card-actions");
        const nav = document.querySelector('nav[aria-label="Mobile workspace views"]');
        if (!actions || !nav) return null;
        const actionsRect = actions.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        return {
          actionsBottom: Math.round(actionsRect.bottom),
          navTop: Math.round(navRect.top),
          overlap: Math.max(0, Math.round(actionsRect.bottom - navRect.top)),
        };
      });

      if (!compactActionAudit) {
        throw new Error(`${viewport.name}: missing compact library action controls`);
      }

      if (compactActionAudit.overlap > 1) {
        throw new Error(
          `${viewport.name}: first library card actions overlap bottom nav by ${compactActionAudit.overlap}px`,
        );
      }
    }

    if (viewport.width < 1280) {
      await page.getByRole("tab", { name: "Show Card" }).click();
      const cardAudit = await readAudit(page);
      if (cardAudit.overflow > 1 || cardAudit.overflowOffenders.length) {
        throw new Error(
          `${viewport.name} card: overflow ${cardAudit.overflow}px ${JSON.stringify(
            cardAudit.overflowOffenders,
          )}`,
        );
      }
      if (viewport.width <= 480) {
        const selectedScan = await page.locator(".selected-card-scan").boundingBox();
        const expectedWidth =
          viewport.height <= 700
            ? Math.min(viewport.width * 0.5, 180)
            : Math.min(viewport.width * 0.68, 230);
        if (!selectedScan || selectedScan.width < expectedWidth) {
          throw new Error(
            `${viewport.name} card: selected scan too small ${Math.round(
              selectedScan?.width ?? 0,
            )}px, expected at least ${Math.round(expectedWidth)}px`,
          );
        }
      }

      await page.getByRole("tab", { name: "Show Deck" }).click();
      const deckAudit = await readAudit(page);
      if (deckAudit.overflow > 1 || deckAudit.overflowOffenders.length) {
        throw new Error(
          `${viewport.name} deck: overflow ${deckAudit.overflow}px ${JSON.stringify(
            deckAudit.overflowOffenders,
          )}`,
        );
      }

      await page.getByRole("tab", { name: "Show Stats" }).click();
      const statsAudit = await readAudit(page);
      if (statsAudit.overflow > 1 || statsAudit.overflowOffenders.length) {
        throw new Error(
          `${viewport.name} stats: overflow ${statsAudit.overflow}px ${JSON.stringify(
            statsAudit.overflowOffenders,
          )}`,
        );
      }

      await page.getByRole("tab", { name: "Show Library" }).click();
      await page.getByRole("button", { name: /Filters/i }).first().click();
      const filtersAudit = await readAudit(page);
      if (filtersAudit.overflow > 1 || filtersAudit.overflowOffenders.length) {
        throw new Error(
          `${viewport.name} filters: overflow ${filtersAudit.overflow}px ${JSON.stringify(
            filtersAudit.overflowOffenders,
          )}`,
        );
      }

      await page.getByRole("button", { name: /Filters/i }).first().click();
      await page.getByRole("button", { name: /Open large view of/i }).first().click();
      const lightboxAudit = await readAudit(page);
      if (lightboxAudit.overflow > 1 || lightboxAudit.overflowOffenders.length) {
        throw new Error(
          `${viewport.name} lightbox: overflow ${lightboxAudit.overflow}px ${JSON.stringify(
            lightboxAudit.overflowOffenders,
          )}`,
        );
      }
      await page.keyboard.press("Escape");
    }

    await page.close();
  }

  console.log(`Visual QA passed. Screenshots saved to ${outputDir}`);
} finally {
  await browser.close();
}
