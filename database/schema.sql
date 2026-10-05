-- API Pulse schema (PostgreSQL)
-- Run with: psql -U <user> -d apipulse -f schema.sql

CREATE TABLE IF NOT EXISTS apis (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checks (
  id         SERIAL PRIMARY KEY,
  api        TEXT NOT NULL,                 -- name of the API that was checked
  status     INT NOT NULL,                  -- HTTP status code (0 = no response)
  ms         INT NOT NULL,                  -- response time in milliseconds
  up         BOOLEAN NOT NULL,              -- true when status is 200-399
  trigger    TEXT NOT NULL DEFAULT 'auto',  -- 'auto' (scheduled) or 'manual'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Speeds up "latest checks per API" queries
CREATE INDEX IF NOT EXISTS idx_checks_api_id ON checks (api, id DESC);

-- Sample APIs to monitor
INSERT INTO apis (name, url) VALUES
  ('Users',    'https://jsonplaceholder.typicode.com/users'),
  ('Products', 'https://dummyjson.com/products'),
  ('Broken',   'https://httpbin.org/status/500'),
  ('Flaky',    'https://httpbin.org/status/200,500')
ON CONFLICT (url) DO NOTHING;