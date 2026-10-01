# API Monitor

A small full-stack API monitoring dashboard built with Node.js, Express, PostgreSQL, and vanilla JavaScript. 


The application lets you add public API endpoints, checks them automatically every 10 seconds, stores the results in PostgreSQL, and displays their status, response time, uptime, and recent check history in a browser dashboard.

## Features

- Add API monitors from the dashboard
- Check registered APIs automatically every 10 seconds
- Run an immediate manual check with **Check now**
- Save check history in PostgreSQL
- Track HTTP status, response time, and uptime
- Mark checks as `auto` or `manual`
- Five-second timeout for external API requests
- Database health endpoint
- Express serves both the frontend and backend API

## Project structure

```text
api-pulse/
├── backend/
│   └── server.js
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── .env
├── .gitignore
└── package.json
```

## Requirements

- Node.js 18 or newer
- PostgreSQL
- A PostgreSQL database named `apipulse`

Node.js 18 or newer is recommended because the server uses the built-in `fetch` API.

## Setup

Install the dependencies from the project root:

```powershell
npm install
```

Create a root `.env` file:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/apipulse
PORT=3000
```

Keep `.env` private. It is excluded by `.gitignore`.

## Run the application

Start the server from the project root:

```powershell
npm start
```

Open the dashboard:

```text
http://localhost:3000
```

The server creates the `apis` and `checks` tables automatically when it starts. It also adds the default demo monitors if they are not already present.

## Dashboard behavior

Use **+ Add monitor** to register an API with a name and URL. After it is saved:

- The API is checked automatically every 10 seconds.
- Expand its card and click **Check now** for an immediate check.
- Scheduled checks are labeled `auto`.
- Button-triggered checks are labeled `manual`.

An API is considered **UP** when its HTTP status is between `200` and `399`. Timeouts, network errors, and status codes `400` or higher are considered **DOWN**.

## API routes

| Method     | Route                   | Description                      |
| ---------- | ----------------------- | -------------------------------- |
| `GET`    | `/`                   | Serves the dashboard             |
| `GET`    | `/health`             | Checks the database connection   |
| `GET`    | `/api/apis`           | Lists registered monitors        |
| `POST`   | `/api/apis`           | Adds a monitor                   |
| `DELETE` | `/api/apis/:id`       | Deletes a monitor                |
| `POST`   | `/api/apis/:id/check` | Runs a manual check              |
| `GET`    | `/api/checks`         | Returns recent checks and uptime |

Example manual check request:

```powershell
Invoke-WebRequest `
  -Uri http://localhost:3000/api/apis/1/check `
  -Method Post
```

## Default demo APIs

The application seeds these public test endpoints:

- `https://jsonplaceholder.typicode.com/users`
- `https://dummyjson.com/products`
- `https://httpbin.org/status/500`
- `https://httpbin.org/status/200,500`

The `Broken` endpoint intentionally returns `500`. The `Flaky` endpoint is intended to simulate changing results.

## Troubleshooting

### `Cannot GET /`

Start the application with `npm start` from the project root and open `http://localhost:3000`. Do not open `frontend/index.html` directly.

### `EADDRINUSE: port 3000`

Another process is using port `3000`. Stop it or change `PORT` in `.env`, then restart the server.

### Database authentication failed

Check that PostgreSQL is running and that `DATABASE_URL` contains the correct username, password, host, port, and database name.

### Duplicate API URL

Each monitor URL must be unique. Use the existing monitor or add a different URL.
