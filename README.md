# API Pulse

<p align="center">
  An API monitoring dashboard built with Node.js, Express, PostgreSQL, and vanilla JavaScript.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white" alt="CSS3">
</p>

<p align="center">
  <img src="api-pulse.gif" alt="API Pulse demo" width="900">
</p>

API Pulse lets you register public API endpoints, checks them automatically every 10 seconds, stores the results in PostgreSQL, and displays their status, response time, uptime, and recent check history in a clean browser dashboard.

## Features

- Add API monitors from the dashboard
- Check registered APIs automatically every 10 seconds
- Save check history in PostgreSQL
- Track HTTP status, response time, and uptime
- Mark checks as `auto` or `manual`
- Five-second timeout for external API requests
- Database health endpoint
- Express serves both the frontend and backend API
- Always-visible monitor form with a **Clear** action
- Always-open recent check tables for quick scanning
- Responsive, minimalist dashboard layout

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

The monitor form is visible when the dashboard opens. Enter an API name and URL, then select **Add API**. Use **Clear** to reset both fields and dismiss the latest form message.

- The API is checked automatically every 10 seconds.
- Each monitor displays its current status, response time, uptime, and recent check table.
- Use **Delete** to remove a monitor.
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

Start the application with `npm start` from the project root and open `http://localhost:3000`. Do not open `frontend/index.html` directly because Express serves the dashboard and API routes together.

### `EADDRINUSE: port 3000`

Another process is using port `3000`. Stop it or change `PORT` in `.env`, then restart the server.

### Database authentication failed

Check that PostgreSQL is running and that `DATABASE_URL` contains the correct username, password, host, port, and database name.

### Duplicate API URL

Each monitor URL must be unique. Use the existing monitor or add a different URL.
