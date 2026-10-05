const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const cron = require("node-cron");
const express = require("express");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const port = process.env.PORT || 3000;

// Check one API (retry once, 10s timeout)
async function check(api, trigger = "auto") {
  const start = Date.now();
  let status = 0;

  for (let i = 0; i < 2 && !status; i++) {
    try {
      const res = await fetch(api.url, { signal: AbortSignal.timeout(10000) });
      status = res.status;
    } catch (err) {
      console.error(`${api.name} failed:`, err.message);
    }
  }

  await pool.query(
    "INSERT INTO checks (api, status, ms, up, trigger) VALUES ($1, $2, $3, $4, $5)",
    [api.name, status, Date.now() - start, status >= 200 && status < 400, trigger]
  );
}

async function checkAll() {
  const { rows } = await pool.query("SELECT * FROM apis");
  await Promise.all(rows.map((api) => check(api)));
  console.log(`--- ${new Date().toLocaleTimeString()} ---`);
}

async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apis (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS checks (
      id SERIAL PRIMARY KEY,
      api TEXT NOT NULL,
      status INT NOT NULL,
      ms INT NOT NULL,
      up BOOLEAN NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'auto',
      created_at TIMESTAMPTZ DEFAULT now()
    )`);

  await pool.query(`
    INSERT INTO apis (name, url) VALUES
      ('Users', 'https://jsonplaceholder.typicode.com/users'),
      ('Products', 'https://dummyjson.com/products'),
      ('Broken', 'https://httpbin.org/status/500'),
      ('Flaky', 'https://httpbin.org/status/200,500')
    ON CONFLICT (url) DO NOTHING`);
}

// Catches errors from async routes so each route doesn't need its own try/catch
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  });

async function start() {
  await initialize();

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "frontend")));

  // Server + database health
  app.get("/health", wrap(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  }));

  // List APIs
  app.get("/api/apis", wrap(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM apis ORDER BY id DESC");
    res.json(rows);
  }));

  // Add an API
  app.post("/api/apis", wrap(async (req, res) => {
    const { name, url } = req.body;

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Name and a valid URL are required" });
    }
    if (!name) {
      return res.status(400).json({ error: "Name and a valid URL are required" });
    }

    let api;
    try {
      const result = await pool.query(
        "INSERT INTO apis (name, url) VALUES ($1, $2) RETURNING *",
        [name, url]
      );
      api = result.rows[0];
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "An API with this URL already exists" });
      }
      throw err;
    }

    await check(api); // check right away
    res.status(201).json(api);
  }));

  // Manual check
  app.post("/api/apis/:id/check", wrap(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM apis WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "API not found" });

    await check(rows[0], "manual");

    const latest = await pool.query(
      "SELECT * FROM checks WHERE api = $1 ORDER BY id DESC LIMIT 1",
      [rows[0].name]
    );
    res.json(latest.rows[0]);
  }));

  // Delete an API and its checks
  app.delete("/api/apis/:id", wrap(async (req, res) => {
    const { rows } = await pool.query("SELECT name FROM apis WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "API not found" });

    await pool.query("DELETE FROM checks WHERE api = $1", [rows[0].name]);
    await pool.query("DELETE FROM apis WHERE id = $1", [req.params.id]);
    res.json({ message: "API deleted" });
  }));

  // Last 5 checks per API, plus overall uptime %
  app.get("/api/checks", wrap(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT c.*,
        (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE up) / COUNT(*))::int
         FROM checks WHERE api = c.api) AS uptime
      FROM checks c
      WHERE c.id IN (
        SELECT id FROM checks WHERE api = c.api ORDER BY id DESC LIMIT 5
      )
      ORDER BY c.api, c.id DESC`);
    res.json(rows);
  }));

  await checkAll(); // first round before the server accepts requests
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

  // Then every 10 seconds
  cron.schedule("*/10 * * * * *", () =>
    checkAll().catch((err) => console.error("Scheduled check failed:", err))
  );
}

start().catch((err) => {
  console.error("Monitor failed to start:", err);
  process.exitCode = 1;
});