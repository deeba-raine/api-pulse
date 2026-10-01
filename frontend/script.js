const monitorList = document.getElementById("monitor-list");

const clearButton = document.getElementById("clear-button");
const apiForm = document.getElementById("api-form");
const apiMessage = document.getElementById("api-message");


// -------------------------
// Add API form
// -------------------------

clearButton.addEventListener("click", () => {
    apiForm.reset();
    apiMessage.className = "api-message hidden";
    apiMessage.textContent = "";
    document.getElementById("api-name").focus();
});

function showApiMessage(message, type) {
    apiMessage.textContent = message;
    apiMessage.className = `api-message ${type}`;
}

apiForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("api-name").value;
    const url = document.getElementById("api-url").value;

    try {
        const response = await fetch("/api/apis", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name,
                url
            })
        });

        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || `Unable to add API (${response.status})`);
        }

        apiForm.reset();
        showApiMessage("API monitor added successfully.", "success");

        await loadMonitors();

    } catch (error) {
        console.error(error);
        showApiMessage(error.message, "error");
    }
});


// -------------------------
// Formatting
// -------------------------

function formatTime(value) {
    return new Date(value).toLocaleTimeString();
}


// -------------------------
// Create monitor card
// -------------------------

function createMonitorCard(monitor) {

    const card = document.createElement("div");

    card.className = "card";
    const latestCheck = monitor.checks[0];
    const lastCheck = latestCheck
        ? `Last check: ${formatTime(latestCheck.created_at)}`
        : "Not checked yet";

    const checksHTML = monitor.checks.map((check) => `
        <div class="check">

            <div class="check-left">

                <span class="check-time">
                    ${formatTime(check.created_at)}
                </span>

                <span class="auto">
                    ${check.trigger === "manual" ? "manual" : "auto"}
                </span>

            </div>

            <div class="check-right">

                <span class="${check.up ? "success" : "failure"}">
                    ${check.status}
                </span>

                <span>
                    ${check.ms} ms
                </span>

            </div>

        </div>
    `).join("");


    card.innerHTML = `
        <div class="card-header">

            <div class="card-top">

                <div>

                    <div class="api-name">
                        ${monitor.name} API
                    </div>

                    <div class="api-url">
                        ${monitor.url}
                    </div>

                </div>

                <span class="arrow">
                    ▶
                </span>

                <button class="button delete-api-button" type="button">
                    Delete
                </button>

            </div>


            <div class="status-line">

                <span class="badge ${monitor.status}">
                    ${monitor.status === "up" ? "UP" : "DOWN"}
                </span>

                <span>
                    ${monitor.response} ms
                </span>

                <span>
                    ${monitor.uptime}% uptime
                </span>

                <span>
                    ${lastCheck}
                </span>

            </div>

        </div>


        <div class="collapsed-hint">
            Click to expand
        </div>


        <div class="card-details">

            <div class="checks-title">
                Recent checks
            </div>

            <div class="checks">

                <div class="checks-header">
                    auto = scheduled check
                </div>

                ${checksHTML}

            </div>

        </div>
    `;


    card.querySelector(".card-header").addEventListener("click", (event) => {
        if (event.target.closest(".delete-api-button")) {
            return;
        }
        card.classList.toggle("open");
    });

    card.querySelector(".delete-api-button").addEventListener("click", async (event) => {
        event.stopPropagation();
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Deleting...";

        try {
            const response = await fetch(`/api/apis/${monitor.id}`, {
                method: "DELETE"
            });

            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.error || `Unable to delete API (${response.status})`);
            }

            await loadMonitors();
        } catch (error) {
            console.error(error);
            button.disabled = false;
            button.textContent = "Delete";
        }
    });


    return card;
}


// -------------------------
// Load monitors
// -------------------------

async function loadMonitors() {

    // Get APIs
    const apisResponse = await fetch("/api/apis");

    if (!apisResponse.ok) {
        throw new Error(
            `APIs request failed: ${apisResponse.status}`
        );
    }

    const apis = await apisResponse.json();


    // Get checks
    const checksResponse = await fetch("/api/checks");

    if (!checksResponse.ok) {
        throw new Error(
            `Checks request failed: ${checksResponse.status}`
        );
    }

    const rows = await checksResponse.json();


    // Group checks by API name
    const grouped = new Map();

    rows.forEach((row) => {

        if (!grouped.has(row.api)) {
            grouped.set(row.api, []);
        }

        grouped.get(row.api).push(row);

    });


    // Create monitor objects
    const monitors = apis
        .sort((first, second) => second.id - first.id)
        .map((api) => {

        const checks = grouped.get(api.name) || [];

        return {
            id: api.id,
            name: api.name,
            url: api.url,

            status: checks.length && checks[0].up
                ? "up"
                : "down",

            response: checks.length
                ? checks[0].ms
                : 0,

            uptime: checks.length
                ? checks[0].uptime
                : 0,

            checks
        };
    });


    // -------------------------
    // Statistics
    // -------------------------

    document.getElementById("total-apis").textContent =
        monitors.length;


    document.getElementById("healthy-apis").textContent =
        monitors.filter(
            (monitor) => monitor.status === "up"
        ).length;


    document.getElementById("down-apis").textContent =
        monitors.filter(
            (monitor) => monitor.status === "down"
        ).length;


    const monitorsWithChecks =
        monitors.filter(
            (monitor) => monitor.checks.length > 0
        );


    document.getElementById("average-response").textContent =
        monitorsWithChecks.length
            ? Math.round(
                monitorsWithChecks.reduce(
                    (total, monitor) =>
                        total + monitor.response,
                    0
                ) / monitorsWithChecks.length
            )
            : 0;


    // -------------------------
    // Display cards
    // -------------------------

    monitorList.replaceChildren(
        ...monitors.map(createMonitorCard)
    );


    if (monitorList.firstElementChild) {
        monitorList.firstElementChild.classList.add("open");
    }
}


// -------------------------
// Initial load
// -------------------------

loadMonitors().catch((error) => {

    console.error(error);

    monitorList.textContent =
        "Unable to load monitor data.";

});


// -------------------------
// Refresh every 10 seconds
// -------------------------

setInterval(() => {

    loadMonitors().catch((error) => {
        console.error(error);
    });

}, 10000);