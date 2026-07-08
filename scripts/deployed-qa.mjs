const baseUrl = process.env.PERMET_DEPLOYED_BASE_URL ?? "https://permetlink.com";
const expectedCanonical =
  process.env.PERMET_EXPECTED_CANONICAL_ORIGIN ?? "https://permetlink.com";
const writeCanaryEnabled = process.env.PERMET_DEPLOYED_WRITE_QA === "1";
const redirectOrigins = (
  process.env.PERMET_REDIRECT_ORIGINS ?? "https://www.permetlink.com"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function absolute(path, origin = baseUrl) {
  return new URL(path, origin).toString();
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function read(path, expectedStatus = 200) {
  const response = await fetchWithTimeout(absolute(path));
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}`);
  }
  return {
    response,
    text: await response.text(),
  };
}

function assertIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`${label} did not include ${expected}`);
  }
}

function assertMatch(text, pattern, label) {
  if (!pattern.test(text)) {
    throw new Error(`${label} did not match ${pattern}`);
  }
}

async function assertHomeMetadata() {
  const { text } = await read("/");
  assertIncludes(text, "Permet Link", "home HTML");
  assertMatch(
    text,
    new RegExp(
      `<link rel="canonical" href="${expectedCanonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?"`,
    ),
    "home canonical",
  );
  assertIncludes(
    text,
    '<meta property="og:type" content="website"',
    "Open Graph type",
  );
  assertIncludes(
    text,
    '<meta name="twitter:card" content="summary_large_image"',
    "Twitter card",
  );
  assertIncludes(
    text,
    '<script type="application/ld+json"',
    "structured data",
  );
  assertIncludes(text, "WebApplication", "structured data");
}

async function assertTextAsset(path, expected) {
  const { text } = await read(path);
  expected.forEach((snippet) => assertIncludes(text, snippet, path));
}

async function assertJsonAsset(path, validate) {
  const { text } = await read(path);
  validate(JSON.parse(text));
}

async function assertDeck404() {
  const { text } = await read("/decks/not-a-real-deck-id", 404);
  assertIncludes(text, "Shared Deck Not Found", "shared deck 404");
  assertIncludes(text, "Open Builder", "shared deck 404");
}

async function assertCronProtected() {
  const response = await fetchWithTimeout(absolute("/api/cron/maintenance"));
  if (response.status !== 401) {
    throw new Error(`GET /api/cron/maintenance returned ${response.status}, expected 401`);
  }
}

async function assertImageOptimizer() {
  const response = await fetchWithTimeout(
    absolute("/_next/image?url=%2Fpermet-link-logo-header.webp&w=640&q=75"),
  );
  if (response.status !== 200) {
    throw new Error(`Next image optimizer returned ${response.status}, expected 200`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Next image optimizer returned ${contentType || "no content-type"}`);
  }
}

async function assertShareCanary() {
  const deck = {
    name: `Deployed QA ${Date.now()}`,
    main: { "ST01-001": 1 },
    resource: { "R-001": 1 },
    art: {},
    prints: {
      main: { "ST01-001": { standard: 1 } },
      resource: { "R-001": { p4: 1 } },
    },
  };
  const saveResponse = await fetchWithTimeout(absolute("/api/decks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deck),
  });
  if (saveResponse.status !== 201) {
    throw new Error(`POST /api/decks returned ${saveResponse.status}, expected 201`);
  }
  const saved = await saveResponse.json();
  if (!saved.id || !saved.shareUrl) {
    throw new Error("Share canary response did not include id/shareUrl.");
  }

  const apiResponse = await fetchWithTimeout(absolute(`/api/decks/${saved.id}`));
  if (apiResponse.status !== 200) {
    throw new Error(`GET /api/decks/${saved.id} returned ${apiResponse.status}`);
  }
  const apiJson = await apiResponse.json();
  if (apiJson.deck?.name !== deck.name) {
    throw new Error("Share canary API payload did not round-trip.");
  }

  const { text } = await read(saved.shareUrl);
  assertIncludes(text, deck.name, "share canary deck page");
  assertIncludes(text, 'name="robots" content="noindex, follow"', "share noindex");

  return saved.id;
}

async function assertRedirects() {
  for (const origin of redirectOrigins) {
    const response = await fetchWithTimeout(absolute("/", origin), {
      redirect: "manual",
    });
    if (![301, 302, 307, 308].includes(response.status)) {
      throw new Error(`${origin} returned ${response.status}, expected redirect`);
    }
    const location = response.headers.get("location") ?? "";
    if (location !== `${expectedCanonical}/`) {
      throw new Error(`${origin} redirected to ${location}, expected ${expectedCanonical}/`);
    }
  }
}

await assertHomeMetadata();
await assertTextAsset("/robots.txt", [
  "User-Agent: *",
  "Allow: /",
  "Disallow: /api/",
  "User-Agent: OAI-SearchBot",
  "User-Agent: PerplexityBot",
  `Sitemap: ${expectedCanonical}/sitemap.xml`,
]);
await assertTextAsset("/sitemap.xml", [
  `<loc>${expectedCanonical}/</loc>`,
  `<loc>${expectedCanonical}/guide</loc>`,
  `<loc>${expectedCanonical}/cards</loc>`,
  `<loc>${expectedCanonical}/cards/eb01</loc>`,
]);
await assertTextAsset("/guide", [
  "Gundam Card Game deck builder guide",
  "Common questions",
  "FAQPage",
]);
await assertTextAsset("/cards", [
  "Gundam Card Game card library",
  "Crawlable Card Reference",
  "CollectionPage",
]);
await assertTextAsset("/cards/eb01", [
  "EB01 Gundam Card Game cards",
  "Set Card Reference",
  "Gundam Astray Red Frame Custom",
  "CollectionPage",
]);
await assertTextAsset("/llms.txt", [
  "# Permet Link",
  `Canonical URL: ${expectedCanonical}/`,
  `${expectedCanonical}/guide`,
  `${expectedCanonical}/cards`,
  `${expectedCanonical}/cards/{set}`,
  `${expectedCanonical}/llms-full.txt`,
  "TCGplayer print lists",
]);
await assertTextAsset("/llms-full.txt", [
  "# Permet Link Full AI Context",
  `${expectedCanonical}/cards/eb01`,
  "## Card Index Format",
  "number | name | color | type",
]);
await assertJsonAsset("/manifest.webmanifest", (manifest) => {
  if (manifest.name !== "Permet Link") {
    throw new Error(`manifest name was ${manifest.name}`);
  }
  if (manifest.start_url !== "/") {
    throw new Error(`manifest start_url was ${manifest.start_url}`);
  }
});
await assertDeck404();
await assertCronProtected();
await assertImageOptimizer();
const shareCanaryId = writeCanaryEnabled ? await assertShareCanary() : null;
await assertRedirects();

assertMatch(baseUrl, /^https?:\/\//, "base URL");
console.log(
  JSON.stringify(
    {
      status: "ok",
      baseUrl,
      expectedCanonical,
      redirectOrigins,
      writeCanaryEnabled,
      shareCanaryId,
    },
    null,
    2,
  ),
);
