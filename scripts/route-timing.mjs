const baseUrl = process.env.PERMET_BASE_URL ?? "http://localhost:3000";
const samples = Number(process.env.PERMET_ROUTE_SAMPLES ?? 3);
const baseHost = new URL(baseUrl).hostname;
const isLocalBase = ["localhost", "127.0.0.1", "::1"].includes(baseHost);
const writesAllowed = isLocalBase || process.env.PERMET_ROUTE_ALLOW_WRITE === "1";

const sampleDeck = {
  name: "Route Timing Probe",
  main: {
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
  },
  resource: { "R-001": 10 },
  art: {},
  prints: { main: {}, resource: { "R-001": { p4: 10 } } },
};

async function time(label, run, expectedStatuses = [200]) {
  const timings = [];

  for (let index = 0; index < samples; index += 1) {
    const start = performance.now();
    const response = await run();
    const elapsed = Math.round(performance.now() - start);
    timings.push(elapsed);

    if (!expectedStatuses.includes(response.status)) {
      throw new Error(`${label} returned ${response.status}`);
    }
  }

  timings.sort((a, b) => a - b);
  return {
    label,
    min: timings[0],
    median: timings[Math.floor(timings.length / 2)],
    max: timings[timings.length - 1],
  };
}

const home = await time("GET /", () => fetch(baseUrl));
const rows = [home];

if (writesAllowed) {
  const saveStart = performance.now();
  const saveResponse = await fetch(new URL("/api/decks", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sampleDeck),
  });

  if (!saveResponse.ok) {
    throw new Error(`POST /api/decks returned ${saveResponse.status}`);
  }

  const saved = await saveResponse.json();
  const saveElapsed = Math.round(performance.now() - saveStart);
  const load = await time(`GET /api/decks/${saved.id}`, () =>
    fetch(new URL(`/api/decks/${saved.id}`, baseUrl)),
  );
  const sharedPage = await time(`GET /decks/${saved.id}`, () =>
    fetch(new URL(`/decks/${saved.id}`, baseUrl)),
  );

  rows.push(
    { label: "POST /api/decks", min: saveElapsed, median: saveElapsed, max: saveElapsed },
    load,
    sharedPage,
  );
} else {
  console.log(
    "Read-only route timing mode. Set PERMET_ROUTE_ALLOW_WRITE=1 to include production share writes.",
  );
  rows.push(
    await time("GET /api/decks/routeprobe", () =>
      fetch(new URL("/api/decks/routeprobe", baseUrl)),
    [404]),
    await time("GET /decks/routeprobe", () =>
      fetch(new URL("/decks/routeprobe", baseUrl)),
    [404]),
  );
}

console.table(rows);
