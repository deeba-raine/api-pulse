const { Pool } = require("pg"); // NEW
const pool = new Pool({ connectionString: "postgres://postgres:user@localhost:5432/apipulse" }); // NEW

const apis = [
  { name: "Users", url: "https://jsonplaceholder.typicode.com/users" },
  { name: "Products", url: "https://dummyjson.com/products" },
  { name: "Broken", url: "https://httpbin.org/status/500" },
  { name: "Flaky", url: "https://httpbin.org/status/200,500" },
];

const history = [];
const lastUp = {};

async function check(api) {
  const start = Date.now();
  let status = 0;
  try {
    const res = await fetch(api.url);
    status = res.status;
  } catch (err) {}

  const up = status >= 200 && status < 400;

  history.push({
    name: api.name,
    status: status,
    ms: Date.now() - start,
    up: up,
    time: new Date().toLocaleTimeString(),
  });

  // NEW: also save this result in the database
  await pool.query(
    "INSERT INTO checks (api, status, ms, up) VALUES ($1, $2, $3, $4)",
    [api.name, status, Date.now() - start, up]
  );

  if (lastUp[api.name] !== undefined && lastUp[api.name] !== up) {
    console.log(`>>> ALERT: ${api.name} is ${up ? "back UP" : "DOWN"} (status ${status})`);
  }
  lastUp[api.name] = up;
}

async function uptime(name) {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE up)::int AS ups FROM checks WHERE api = $1",
    [name]
  );
  const { total, ups } = result.rows[0];
  return Math.round((ups / total) * 100);
}

async function checkAll() {
  await Promise.all(apis.map(check));

  console.log("--- " + new Date().toLocaleTimeString() + " ---");
  for (const api of apis) {
    const last = history.filter((h) => h.name === api.name).at(-1);
    const percent = await uptime(api.name);
    console.log(`${api.name}: ${last.up ? "UP" : "DOWN"} | ${last.status} | ${last.ms} ms | uptime ${percent}%`);
  }
}

checkAll();
setInterval(checkAll, 10000);