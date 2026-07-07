const baseUrl = process.env.PERMET_DEPLOYED_BASE_URL ?? "https://permetlink.com";
const expectedCanonical =
  process.env.PERMET_EXPECTED_CANONICAL_ORIGIN ?? "https://permetlink.com";
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
  `Sitemap: ${expectedCanonical}/sitemap.xml`,
]);
await assertTextAsset("/sitemap.xml", [`<loc>${expectedCanonical}/</loc>`]);
await assertTextAsset("/llms.txt", [
  "# Permet Link",
  `Canonical URL: ${expectedCanonical}/`,
  "TCGplayer print lists",
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
await assertRedirects();

assertMatch(baseUrl, /^https?:\/\//, "base URL");
console.log(
  JSON.stringify(
    {
      status: "ok",
      baseUrl,
      expectedCanonical,
      redirectOrigins,
    },
    null,
    2,
  ),
);
