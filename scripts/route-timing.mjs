const baseUrl = process.env.PERMET_BASE_URL ?? "http://localhost:3000";
const samples = Number(process.env.PERMET_ROUTE_SAMPLES ?? 3);

const sampleDeck = {
  name: "Route Timing Probe",
  main: { "ST01-001": 4, "ST01-002": 4 },
  resource: { "R-001": 10 },
  art: {},
  prints: {
    main: {
      "ST01-001": { standard: 4 },
      "ST01-002": { standard: 4 },
    },
    resource: { "R-001": { standard: 10 } },
  },
};

async function time(label, run) {
  const timings = [];

  for (let index = 0; index < samples; index += 1) {
    const start = performance.now();
    const response = await run();
    const elapsed = Math.round(performance.now() - start);
    timings.push(elapsed);

    if (!response.ok) {
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

console.table([
  home,
  { label: "POST /api/decks", min: saveElapsed, median: saveElapsed, max: saveElapsed },
  load,
  sharedPage,
]);
