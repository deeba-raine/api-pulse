const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});
const { Pool } = require("pg");
const cron = require("node-cron");
const express = require("express");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const port = Number.parseInt(process.env.PORT || "3000", 10);
const requestTimeoutMs = 5000;

const lastUp = {};

// Check one API
async function check(api, trigger = "auto") {
  const start = Date.now();
  let status = 0;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    requestTimeoutMs
  );

  try {
    const response = await fetch(api.url, {
      signal: controller.signal
    });

    status = response.status;
  } catch (error) {
    console.error(`Unable to check ${api.name}:`, error.message);
  } finally {
    clearTimeout(timeout);
  }

  const up = status >= 200 && status < 400;
  const responseTime = Date.now() - start;

  await pool.query(
    `INSERT INTO checks (api, status, ms, up, trigger)
     VALUES ($1, $2, $3, $4, $5)`,
    [api.name, status, responseTime, up, trigger]
  );

  // Basic alert
  if (
    lastUp[api.name] !== undefined &&
    lastUp[api.name] !== up
  ) {
    console.log(
      `>>> ALERT: ${api.name} is ${
        up ? "back UP" : "DOWN"
      } (status ${status})`
    );
  }

  lastUp[api.name] = up;
}

// Check all registered APIs
async function checkAll() {
  const result = await pool.query(
    "SELECT id, name, url FROM apis"
  );

  await Promise.all(
    result.rows.map(api => check(api))
  );

  console.log(
    `--- ${new Date().toLocaleTimeString()} ---`
  );
}

// Create database tables
async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS apis (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await pool.query(`
    INSERT INTO apis (name, url)
    VALUES
      ('Users', 'https://jsonplaceholder.typicode.com/users'),
      ('Products', 'https://dummyjson.com/products'),
      ('Broken', 'https://httpbin.org/status/500'),
      ('Flaky', 'https://httpbin.org/status/200,500')
    ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS checks (
      id SERIAL PRIMARY KEY,
      api TEXT NOT NULL,
      status INT NOT NULL,
      ms INT NOT NULL,
      up BOOLEAN NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'auto',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE checks
    ADD COLUMN IF NOT EXISTS trigger TEXT NOT NULL DEFAULT 'auto'
  `);

  await pool.query(`
    UPDATE checks
    SET trigger = 'auto'
    WHERE trigger IS NULL
       OR trigger NOT IN ('auto', 'manual')
  `);
}

async function start() {
  await initialize();

  const app = express();

  app.use(express.json());

  app.use(
    express.static(
      path.join(__dirname, "..", "frontend")
    )
  );

  // Server/database health
  app.get("/health", async (req, res) => {
    try {
      await pool.query("SELECT 1");

      res.json({
        status: "ok",
        database: "connected"
      });
    } catch (error) {
      console.error("Health check failed:", error);

      res.status(503).json({
        status: "error",
        database: "disconnected"
      });
    }
  });

  // Get registered APIs
  app.get("/api/apis", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM apis ORDER BY id DESC"
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Unable to load APIs:", error);

      res.status(500).json({
        error: "Unable to load APIs"
      });
    }
  });

  // Add a new API
  app.post("/api/apis", async (req, res) => {
    const { name, url } = req.body;

    if (!name || !url) {
      return res.status(400).json({
        error: "Name and URL are required"
      });
    }

    try {
      new URL(url);

      const result = await pool.query(
        `INSERT INTO apis (name, url)
         VALUES ($1, $2)
         RETURNING *`,
        [name, url]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Unable to add API:", error);

      if (error.code === "23505") {
        return res.status(409).json({
          error: "An API with this URL already exists"
        });
      }

      if (error instanceof TypeError) {
        return res.status(400).json({
          error: "URL must be valid"
        });
      }

      res.status(500).json({
        error: "Unable to add API"
      });
    }
  });

  app.post("/api/apis/:id/check", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, name, url FROM apis WHERE id = $1",
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "API not found" });
      }

      const api = result.rows[0];
      await check(api, "manual");

      const latest = await pool.query(
        `SELECT id, api, status, ms, up, trigger, created_at
         FROM checks
         WHERE api = $1
         ORDER BY id DESC
         LIMIT 1`,
        [api.name]
      );

      res.json(latest.rows[0]);
    } catch (error) {
      console.error("Unable to run manual check:", error);
      res.status(500).json({ error: "Unable to run manual check" });
    }
  });

  // Delete an API
  app.delete("/api/apis/:id", async (req, res) => {
    try {
      const apiResult = await pool.query(
        "SELECT name FROM apis WHERE id = $1",
        [req.params.id]
      );

      if (apiResult.rows.length === 0) {
        return res.status(404).json({ error: "API not found" });
      }

      await pool.query("DELETE FROM checks WHERE api = $1", [
        apiResult.rows[0].name
      ]);
      await pool.query("DELETE FROM apis WHERE id = $1", [req.params.id]);

      res.json({
        message: "API deleted"
      });
    } catch (error) {
      console.error("Unable to delete API:", error);

      res.status(500).json({
        error: "Unable to delete API"
      });
    }
  });

  // Get monitoring results
  app.get("/api/checks", async (req, res) => {
    try {
      const result = await pool.query(`
        WITH ranked AS (
          SELECT
            id,
            api,
            status,
            ms,
            up,
            trigger,
            created_at,
            ROW_NUMBER() OVER (
              PARTITION BY api
              ORDER BY id DESC
            ) AS position
          FROM checks
        ),
        uptime AS (
          SELECT
            api,
            ROUND(
              100.0 * COUNT(*) FILTER (WHERE up) /
              NULLIF(COUNT(*), 0)
            )::int AS uptime
          FROM checks
          GROUP BY api
        )
        SELECT
          ranked.id,
          ranked.api,
          ranked.status,
          ranked.ms,
          ranked.up,
          ranked.trigger,
          ranked.created_at,
          uptime.uptime
        FROM ranked
        JOIN uptime
          ON uptime.api = ranked.api
        WHERE ranked.position <= 5
        ORDER BY ranked.api, ranked.id DESC
      `);

      res.json(result.rows);
    } catch (error) {
      console.error("Unable to load checks:", error);

      res.status(500).json({
        error: "Unable to load checks"
      });
    }
  });

  app.listen(port, () => {
    console.log(
      `Server running at http://localhost:${port}`
    );
  });

  // Run once when server starts
  await checkAll();

  // Run every 10 seconds
  cron.schedule("*/10 * * * * *", () => {
    checkAll().catch(error =>
      console.error(
        "Scheduled check failed:",
        error
      )
    );
  });
}

start().catch(error => {
  console.error(
    "Monitor failed to start:",
    error
  );

  process.exitCode = 1;
});