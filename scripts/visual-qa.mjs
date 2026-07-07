import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = process.env.PERMET_BASE_URL ?? "http://localhost:3000";
const outputDir = join(process.cwd(), "qa-screenshots");
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1280, height: 720 },
  { name: "wide", width: 1440, height: 900 },
];

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

      return {
        title: document.title,
        overflow,
        visibleButtons,
        hasMobileNav: window.matchMedia("(max-width: 1279px)").matches
          ? Boolean(document.querySelector("nav"))
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

      return {
        title: document.title,
        overflow,
        visibleButtons,
        hasMobileNav: window.matchMedia("(max-width: 1279px)").matches
          ? Boolean(document.querySelector("nav"))
          : true,
      };
    });
  }
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Permet Link", exact: true }).waitFor({
      state: "visible",
      timeout: 15000,
    });
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
    if (!audit.hasMobileNav) {
      throw new Error(`${viewport.name}: missing mobile cockpit nav`);
    }
    if (audit.visibleButtons < 4) {
      throw new Error(`${viewport.name}: expected visible controls`);
    }

    await page.close();
  }

  console.log(`Visual QA passed. Screenshots saved to ${outputDir}`);
} finally {
  await browser.close();
}
