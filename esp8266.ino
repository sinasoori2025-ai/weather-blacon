
"use strict";

/* ==========================================
   SINA WEATHER - MAIN APPLICATION
   ========================================== */

const CONFIG = {
    forecastRefresh: 15 * 60 * 1000,
    sensorRefresh: 5000,
    sensorTimeout: 4500,
    defaultCity: "Tehran",
    defaultIP: "192.168.1.110",
    storage: {
        schedules: "sina_weather_weekly_schedule_v2",
        mode: "sina_weather_mode_v2",
        city: "sina_weather_city_v2",
        coordinates: "sina_weather_coordinates_v2"
    }
};

const DAYS = [
    "Saturday", "Sunday", "Monday", "Tuesday",
    "Wednesday", "Thursday", "Friday"
];

const WEATHER = {
    0:  { label: "Clear sky", icon: "☀️", type: "sunny" },
    1:  { label: "Mainly clear", icon: "🌤️", type: "partly-cloudy" },
    2:  { label: "Partly cloudy", icon: "⛅", type: "partly-cloudy" },
    3:  { label: "Overcast", icon: "☁️", type: "cloudy" },
    45: { label: "Fog", icon: "🌫️", type: "fog" },
    48: { label: "Rime fog", icon: "🌫️", type: "fog" },
    51: { label: "Light drizzle", icon: "🌦️", type: "rain" },
    53: { label: "Drizzle", icon: "🌦️", type: "rain" },
    55: { label: "Heavy drizzle", icon: "🌧️", type: "rain" },
    56: { label: "Freezing drizzle", icon: "🌧️", type: "rain" },
    57: { label: "Heavy freezing drizzle", icon: "🌧️", type: "heavy-rain" },
    61: { label: "Light rain", icon: "🌦️", type: "rain" },
    63: { label: "Moderate rain", icon: "🌧️", type: "rain" },
    65: { label: "Heavy rain", icon: "🌧️", type: "heavy-rain" },
    66: { label: "Freezing rain", icon: "🌧️", type: "heavy-rain" },
    67: { label: "Heavy freezing rain", icon: "🌧️", type: "heavy-rain" },
    71: { label: "Light snow", icon: "🌨️", type: "snow" },
    73: { label: "Moderate snow", icon: "❄️", type: "snow" },
    75: { label: "Heavy snow", icon: "❄️", type: "heavy-snow" },
    77: { label: "Snow grains", icon: "❄️", type: "snow" },
    80: { label: "Rain showers", icon: "🌦️", type: "rain" },
    81: { label: "Moderate showers", icon: "🌧️", type: "rain" },
    82: { label: "Violent showers", icon: "🌧️", type: "heavy-rain" },
    85: { label: "Snow showers", icon: "🌨️", type: "snow" },
    86: { label: "Heavy snow showers", icon: "❄️", type: "heavy-snow" },
    95: { label: "Thunderstorm", icon: "⛈️", type: "thunderstorm" },
    96: { label: "Thunderstorm with hail", icon: "⛈️", type: "thunderstorm" },
    99: { label: "Heavy thunderstorm", icon: "⛈️", type: "thunderstorm" }
};

const $ = (selector) => document.querySelector(selector);

const state = {
    city: CONFIG.defaultCity,
    latitude: 35.6892,
    longitude: 51.3890,
    timezone: "auto",
    forecast: null,
    schedules: [],
    selectedDay: getPersianWeekday(),
    mode: "automatic",
    sensorIP: CONFIG.defaultIP,
    sensorConnected: false,
    sensorData: null,
    forecastTimer: null,
    sensorTimer: null
};

/* ==========================================
   BASIC HELPERS
   ========================================== */

function safeNumber(value, suffix = "", digits = 0) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "N/A";
    }
    return `${Number(value).toFixed(digits)}${suffix}`;
}

function getPersianWeekday(date = new Date()) {
    // JS: Sunday=0. Our schedule: Saturday=0 ... Friday=6.
    return (date.getDay() + 1) % 7;
}

function getWeather(code) {
    return WEATHER[Number(code)] || {
        label: "Unknown conditions",
        icon: "🌡️",
        type: "cloudy"
    };
}

function getRainIntensity(mm) {
    if (!Number.isFinite(Number(mm)) || Number(mm) <= 0) return "No precipitation";
    if (mm < 1) return "Very light";
    if (mm < 2.5) return "Light";
    if (mm < 7.5) return "Moderate";
    if (mm < 15) return "Heavy";
    return "Very heavy";
}

function formatHour(value) {
    if (!value) return "--:--";
    const match = value.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : value;
}

function formatDate(value, options = {}) {
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat("en-US", options).format(date);
}

function showMessage(selector, message) {
    const element = $(selector);
    if (element) element.textContent = message;
}

/* ==========================================
   CLOCK
   ========================================== */

function updateClock() {
    const now = new Date();

    showMessage("#clockLabel",
        now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        })
    );

    showMessage("#dateLabel",
        now.toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        })
    );
}

/* ==========================================
   CITY SEARCH
   ========================================== */

async function searchCity() {
    const input = $("#cityInput");
    const query = input.value.trim();

    if (!query) {
        showMessage("#weatherUpdated", "Enter a city name first.");
        return;
    }

    showMessage("#weatherUpdated", "Searching city...");

    try {
        const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
        url.search = new URLSearchParams({
            name: query,
            count: "1",
            language: "en",
            format: "json"
        });

        const response = await fetch(url);
        if (!response.ok) throw new Error("City search failed");

        const result = await response.json();
        if (!result.results || !result.results.length) {
            throw new Error("City not found. Try another spelling.");
        }

        const place = result.results[0];

        state.city = place.name;
        state.latitude = place.latitude;
        state.longitude = place.longitude;
        state.timezone = place.timezone || "auto";

        localStorage.setItem(CONFIG.storage.city, state.city);
        localStorage.setItem(CONFIG.storage.coordinates, JSON.stringify({
            latitude: state.latitude,
            longitude: state.longitude,
            timezone: state.timezone
        }));

        showMessage("#cityName",
            [place.name, place.admin1, place.country]
                .filter(Boolean).join(", ")
        );

        await loadForecast();
    } catch (error) {
        showMessage("#weatherUpdated", error.message);
    }
}

/* ==========================================
   FORECAST API
   ========================================== */

async function loadForecast() {
    showMessage("#weatherUpdated", "Updating forecast...");

    const hourly = [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "precipitation_probability",
        "precipitation",
        "rain",
        "showers",
        "snowfall",
        "weather_code",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m"
    ].join(",");

    const daily = [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "rain_sum",
        "showers_sum",
        "snowfall_sum",
        "precipitation_probability_max",
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "wind_direction_10m_dominant"
    ].join(",");

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
        latitude: state.latitude,
        longitude: state.longitude,
        hourly,
        daily,
        current: [
            "temperature_2m",
            "relative_humidity_2m",
            "apparent_temperature",
            "precipitation",
            "rain",
            "snowfall",
            "weather_code",
            "wind_speed_10m",
            "wind_direction_10m",
            "wind_gusts_10m"
        ].join(","),
        forecast_days: "7",
        timezone: state.timezone || "auto",
        wind_speed_unit: "kmh",
        precipitation_unit: "mm",
        temperature_unit: "celsius"
    });

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Forecast request failed (${response.status})`);

        const data = await response.json();

        if (!data.hourly || !data.daily || !data.current) {
            throw new Error("Weather provider returned incomplete data.");
        }

        state.forecast = data;

        renderCurrentWeather();
        renderHourlyForecast();
        renderWeeklyForecast();
        renderPrecipitation();
        showMessage("#weatherUpdated",
            `Updated ${new Date().toLocaleTimeString()}`
        );
    } catch (error) {
        showMessage("#weatherUpdated", `Forecast error: ${error.message}`);
        console.error("Forecast error:", error);
    }
}

/* ==========================================
   CURRENT WEATHER
   ========================================== */

function renderCurrentWeather() {
    if (!state.forecast) return;

    const current = state.forecast.current;
    const weather = getWeather(current.weather_code);

    const temp = safeNumber(current.temperature_2m, "", 0);
    const humidity = safeNumber(current.relative_humidity_2m, "%");
    const wind = safeNumber(current.wind_speed_10m, " km/h");
    const rain = safeNumber(current.precipitation, " mm", 1);

    $("#heroTemp").textContent = temp;
    $("#heroCondition").textContent = weather.label;
    $("#heroIcon").textContent = weather.icon;
    $("#weatherDescription").textContent =
        `Current conditions in ${state.city}`;

    $("#feelsLike").textContent =
        safeNumber(current.apparent_temperature, "°", 0);
    $("#heroHumidity").textContent = humidity;
    $("#heroWind").textContent = wind;
    $("#heroRain").textContent = rain;

    $("#rightTemperature").textContent = `${temp}°`;
    $("#rightHumidity").textContent = humidity;
    $("#rightWind").textContent = wind;

    $("#weatherApp").dataset.weather = weather.type;

    renderWeatherScene(weather.type);

    const windValue = Number(current.wind_speed_10m) || 0;
    $("#windTree").style.animationDuration =
        `${Math.max(0.45, 3.5 - windValue / 18)}s`;

    showMessage("#windDescription",
        `Wind speed: ${safeNumber(windValue, " km/h")}`
    );
}

/* ==========================================
   WEATHER ANIMATIONS
   ========================================== */

function renderWeatherScene(type) {
    const scene = $("#weatherScene");
    scene.innerHTML = "";

    if (type === "sunny") return;

    if (["cloudy", "partly-cloudy", "rain", "heavy-rain",
         "thunderstorm", "snow", "heavy-snow"].includes(type)) {
        for (let i = 0; i < 3; i++) {
            const cloud = document.createElement("div");
            cloud.className = `weather-cloud cloud-${i % 2 ? "two" : "one"}`;
            cloud.style.top = `${18 + i * 23}%`;
            cloud.style.animationDelay = `${-i * 7}s`;
            scene.appendChild(cloud);
        }
    }

    if (type === "rain" || type === "heavy-rain" || type === "thunderstorm") {
        const count = type === "rain" ? 55 : 115;
        for (let i = 0; i < count; i++) {
            const drop = document.createElement("i");
            drop.className = "rain-drop";
            drop.style.left = `${Math.random() * 100}%`;
            drop.style.animationDelay = `${Math.random() * 1.5}s`;
            drop.style.animationDuration =
                `${type === "rain" ? .9 : .42 + Math.random() * .3}s`;
            scene.appendChild(drop);
        }
    }

    if (type === "snow" || type === "heavy-snow") {
        const count = type === "snow" ? 45 : 100;
        for (let i = 0; i < count; i++) {
            const flake = document.createElement("span");
            flake.className = "snow-flake";
            flake.textContent = "❄";
            flake.style.left = `${Math.random() * 100}%`;
            flake.style.animationDelay = `${Math.random() * 6}s`;
            flake.style.animationDuration = `${4 + Math.random() * 5}s`;
            scene.appendChild(flake);
        }
    }

    if (type === "fog") {
        for (let i = 0; i < 2; i++) {
            const fog = document.createElement("div");
            fog.className = "fog-band";
            scene.appendChild(fog);
        }
    }

    if (type === "thunderstorm") {
        const flash = document.createElement("div");
        flash.className = "lightning-flash";
        scene.appendChild(flash);
    }

    if (type === "windy") {
        for (let i = 0; i < 12; i++) {
            const streak = document.createElement("div");
            streak.className = "wind-streak";
            streak.style.top = `${Math.random() * 100}%`;
            streak.style.animationDelay = `${Math.random() * 3}s`;
            scene.appendChild(streak);
        }
    }
}

/* ==========================================
   HOURLY FORECAST - NEXT 12 HOURS
   ========================================== */

function renderHourlyForecast() {
    const container = $("#hourlyForecast");
    const hourly = state.forecast.hourly;

    const now = state.forecast.current.time;
    let startIndex = hourly.time.findIndex(time => time >= now);

    if (startIndex < 0) startIndex = 0;

    const entries = [];

    for (let i = startIndex; i < Math.min(startIndex + 12, hourly.time.length); i++) {
        const code = hourly.weather_code[i];
        const weather = getWeather(code);
        const precipitation = Number(hourly.precipitation[i]) || 0;
        const probability = hourly.precipitation_probability[i];

        entries.push({
            time: hourly.time[i],
            icon: weather.icon,
            condition: weather.label,
            temperature: hourly.temperature_2m[i],
            probability,
            precipitation,
            snowfall: hourly.snowfall[i],
            wind: hourly.wind_speed_10m[i],
            gust: hourly.wind_gusts_10m[i],
            type: weather.type
        });
    }

    container.innerHTML = entries.map((item, index) => `
        <article class="hour-card">
            <div class="hour-time">${index === 0 ? "Now" : formatHour(item.time)}</div>
            <div class="hour-icon">${item.icon}</div>
            <div class="hour-temp">${safeNumber(item.temperature, "°")}</div>
            <div class="hour-rain">💧 ${safeNumber(item.probability, "%")}</div>
            <div class="hour-extra">${safeNumber(item.precipitation, " mm", 1)} precip.</div>
            <div class="hour-extra">❄ ${safeNumber(item.snowfall, " cm", 1)}</div>
            <div class="hour-extra">Wind ${safeNumber(item.wind, " km/h")}</div>
            <div class="hour-extra">${getRainIntensity(item.precipitation)}</div>
        </article>
    `).join("");
}

/* ==========================================
   7-DAY FORECAST
   ========================================== */

function renderWeeklyForecast() {
    const container = $("#weeklyForecast");
    const daily = state.forecast.daily;

    container.innerHTML = daily.time.map((date, i) => {
        const weather = getWeather(daily.weather_code[i]);
        const rain = Number(daily.rain_sum[i]) || 0;
        const showers = Number(daily.showers_sum[i]) || 0;
        const snow = Number(daily.snowfall_sum[i]) || 0;
        const totalPrecip = Number(daily.precipitation_sum[i]) || 0;
        const probability = daily.precipitation_probability_max[i];

        const dayName = i === 0
            ? "Today"
            : formatDate(date, { weekday: "long" });

        return `
            <article class="day-card">
                <div class="day-name">${dayName}</div>
                <div class="day-icon">${weather.icon}</div>
                <div class="day-condition">${weather.label}</div>
                <div class="day-rain">
                    💧 ${safeNumber(probability, "%")}
                    <br>
                    ${safeNumber(totalPrecip, " mm", 1)} total
                    <br>
                    Rain ${safeNumber(rain + showers, " mm", 1)}
                    · Snow ${safeNumber(snow, " cm", 1)}
                    <br>
                    ${getRainIntensity(totalPrecip)}
                </div>
                <div class="day-temperatures">
                    ${safeNumber(daily.temperature_2m_max[i], "°")}
                    <span>${safeNumber(daily.temperature_2m_min[i], "°")}</span>
                    <br>
                    <small>Wind ${safeNumber(daily.wind_speed_10m_max[i], " km/h")}</small>
                </div>
            </article>
        `;
    }).join("");
}

/* ==========================================
   PRECIPITATION SUMMARY
   ========================================== */

function renderPrecipitation() {
    const daily = state.forecast.daily;
    const hourly = state.forecast.hourly;

    $("#todayRain").textContent =
        safeNumber((daily.rain_sum[0] || 0) + (daily.showers_sum[0] || 0), " mm", 1);

    $("#todaySnow").textContent =
        safeNumber(daily.snowfall_sum[0], " cm", 1);

    $("#todayRainProbability").textContent =
        safeNumber(daily.precipitation_probability_max[0], "%");

    $("#todayMaxWind").textContent =
        safeNumber(daily.wind_speed_10m_max[0], " km/h");

    const chart = $("#rainChart");
    const start = Math.max(0, hourly.time.findIndex(t => t >= state.forecast.current.time));

    const values = [];
    for (let i = start; i < Math.min(start + 12, hourly.time.length); i++) {
        values.push({
            time: formatHour(hourly.time[i]),
            value: Number(hourly.precipitation[i]) || 0
        });
    }

    const max = Math.max(1, ...values.map(v => v.value));

    chart.innerHTML = values.map(item => {
        const height = Math.max(3, item.value / max * 90);
        return `<div class="rain-bar" style="height:${height}%">
            <span>${item.time}</span>
        </div>`;
    }).join("");
}

/* ==========================================
   WEEKLY MANUAL SCHEDULE
   ========================================== */

function loadLocalSettings() {
    try {
        state.schedules = JSON.parse(
            localStorage.getItem(CONFIG.storage.schedules) || "[]"
        );
    } catch {
        state.schedules = [];
    }

    state.mode = localStorage.getItem(CONFIG.storage.mode) || "automatic";
    state.sensorIP = localStorage.getItem("sina_weather_esp_ip") || CONFIG.defaultIP;

    const savedCity = localStorage.getItem(CONFIG.storage.city);
    const savedCoordinates = localStorage.getItem(CONFIG.storage.coordinates);

    if (savedCity) {
        state.city = savedCity;
        $("#cityInput").value = savedCity;
    }

    if (savedCoordinates) {
        try {
            const coords = JSON.parse(savedCoordinates);
            state.latitude = coords.latitude;
            state.longitude = coords.longitude;
            state.timezone = coords.timezone || "auto";
        } catch {}
    }

    $("#sensorIP").value = state.sensorIP;
}

function saveSchedules() {
    localStorage.setItem(
        CONFIG.storage.schedules,
        JSON.stringify(state.schedules)
    );
}

function renderWeekdays() {
    const container = $("#weekdaySelector");

    container.innerHTML = DAYS.map((day, index) => `
        <button type="button"
            class="weekday-button ${index === state.selectedDay ? "active" : ""}"
            data-day="${index}">
            ${day.slice(0, 3)}
        </button>
    `).join("");

    container.querySelectorAll("[data-day]").forEach(button => {
        button.addEventListener("click", () => {
            state.selectedDay = Number(button.dataset.day);
            renderWeekdays();
            renderScheduleList();
        });
    });
}

function renderScheduleList() {
    const dayEvents = state.schedules
        .filter(event => event.day === state.selectedDay)
        .sort((a, b) => a.time.localeCompare(b.time));

    $("#selectedDayTitle").textContent = DAYS[state.selectedDay];
    $("#selectedDayEventCount").textContent =
        `${dayEvents.length} scheduled event${dayEvents.length === 1 ? "" : "s"}`;

    const container = $("#scheduleList");

    if (!dayEvents.length) {
        container.innerHTML =
            `<div class="empty-state">No events scheduled for this day.</div>`;
        return;
    }

    container.innerHTML = dayEvents.map(event => {
        const weather = Object.values(WEATHER).find(w => w.type === event.condition);
        const icons = {
            sunny: "☀️", "partly-cloudy": "🌤️", cloudy: "☁️",
            fog: "🌫️", rain: "🌧️", "heavy-rain": "🌧️",
            snow: "🌨️", "heavy-snow": "❄️",
            thunderstorm: "⛈️", windy: "💨"
        };

        return `
            <div class="schedule-event">
                <div class="event-info">
                    <span class="event-time">${event.time}</span>
                    <span>${icons[event.condition] || "🌡️"}</span>
                    <span>${event.condition.replaceAll("-", " ")}</span>
                    <span>${event.temperature}°C</span>
                    <span>${event.probability}% rain chance</span>
                    <span>${event.rainfall} mm</span>
                    <span>${event.wind} km/h</span>
                </div>
                <button class="delete-event" data-delete="${event.id}"
                        aria-label="Delete event">×</button>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-delete]").forEach(button => {
        button.addEventListener("click", () => {
            state.schedules = state.schedules.filter(
                event => event.id !== button.dataset.delete
            );
            saveSchedules();
            renderScheduleList();
        });
    });
}

function addScheduleEvent(event) {
    event.preventDefault();

    const newEvent = {
        id: crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        day: state.selectedDay,
        time: $("#eventTime").value,
        condition: $("#eventCondition").value,
        temperature: Number($("#eventTemp").value),
        probability: Number($("#eventProbability").value),
        rainfall: Number($("#eventRainfall").value),
        wind: Number($("#eventWind").value)
    };

    if (!newEvent.time) return;

    state.schedules.push(newEvent);
    saveSchedules();
    renderScheduleList();
    updateScheduleStatus();
}

function clearSelectedDay() {
    state.schedules = state.schedules.filter(
        event => event.day !== state.selectedDay
    );

    saveSchedules();
    renderScheduleList();
    updateScheduleStatus();
}

function setMode(mode) {
    state.mode = mode;
    localStorage.setItem(CONFIG.storage.mode, mode);

    document.querySelectorAll(".mode-button").forEach(button => {
        button.classList.toggle("active", button.dataset.mode === mode);
    });

    showMessage("#modeLabel",
        mode === "automatic" ? "ONLINE FORECAST" : "MANUAL SCHEDULE"
    );

    updateScheduleStatus();
    applyScheduleForCurrentTime();
}

function updateScheduleStatus() {
    showMessage("#scheduleStatus",
        state.mode === "automatic"
            ? "Automatic mode is active. Online forecast is being displayed."
            : "Manual mode is active. Your weekly schedule has priority."
    );
}

function applyScheduleForCurrentTime() {
    if (state.mode !== "manual") return;

    const now = new Date();
    const day = getPersianWeekday(now);
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const events = state.schedules
        .filter(event => event.day === day && event.time <= currentTime)
        .sort((a, b) => b.time.localeCompare(a.time));

    const active = events[0];

    if (!active) {
        showMessage("#scheduleStatus",
            `Manual mode: no event has started today. Online forecast remains visible.`
        );
        return;
    }

    const icons = {
        sunny: "☀️", "partly-cloudy": "🌤️", cloudy: "☁️",
        fog: "🌫️", rain: "🌧️", "heavy-rain": "🌧️",
        snow: "🌨️", "heavy-snow": "❄️",
        thunderstorm: "⛈️", windy: "💨"
    };

    const names = {
        sunny: "Sunny", "partly-cloudy": "Partly cloudy",
        cloudy: "Cloudy", fog: "Fog", rain: "Rain",
        "heavy-rain": "Heavy rain", snow: "Snow",
        "heavy-snow": "Heavy snow",
        thunderstorm: "Thunderstorm", windy: "Windy"
    };

    $("#heroTemp").textContent = active.temperature;
    $("#heroCondition").textContent = names[active.condition] || active.condition;
    $("#heroIcon").textContent = icons[active.condition] || "🌡️";
    $("#weatherDescription").textContent =
        `Manual schedule · ${DAYS[day]} at ${active.time}`;

    $("#heroHumidity").textContent = "--";
    $("#heroWind").textContent = `${active.wind} km/h`;
    $("#heroRain").textContent = `${active.rainfall} mm`;
    $("#feelsLike").textContent = "--";

    $("#weatherApp").dataset.weather = active.condition;
    renderWeatherScene(active.condition);

    showMessage("#scheduleStatus",
        `Active: ${names[active.condition]} at ${active.time}. Manual schedule has priority.`
    );
}

/* ==========================================
   ESP8266 SENSOR CONNECTION
   ========================================== */

function setSensorStatus(connected, message) {
    state.sensorConnected = connected;

    const dot = $("#sensorStatus .status-dot");
    dot.classList.toggle("connected", connected);

    showMessage("#sensorStatusText", connected ? "ESP Connected" : "ESP Offline");
    showMessage("#sidebarConnectionText", connected ? "Connected" : "Disconnected");
    showMessage("#rightStationStatus", connected ? "Online" : "Offline");
    showMessage("#rightStationText", message);

    $("#sidebarStatusIndicator").classList.toggle("connected", connected);
    showMessage("#sensorFeedback", message);
}

async function fetchSensorData() {
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        CONFIG.sensorTimeout
    );

    try {
        const endpoint = `http://${state.sensorIP}/api/data`;
        showMessage("#sensorEndpoint", endpoint);

        const response = await fetch(endpoint, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        state.sensorData = data;

        if (data.temperature !== null && data.temperature !== undefined) {
            showMessage("#sensorTemperature",
                `${Number(data.temperature).toFixed(1)} °C`);
        }

        if (data.humidity !== null && data.humidity !== undefined) {
            showMessage("#sensorHumidity",
                `${Number(data.humidity).toFixed(1)} %`);
        }

        showMessage("#sensorWind",
            data.windSpeed == null ? "Not installed" : `${data.windSpeed} km/h`);

        showMessage("#sensorRainfall",
            data.rainfall == null ? "Not installed" : `${data.rainfall} mm`);

        showMessage("#sensorLastSeen",
            `Last reading: ${new Date().toLocaleTimeString()}`);

        setSensorStatus(true, "ESP8266 data received successfully.");

        // Sensor data is shown separately. It does not replace the
        // forecast provider's weather conditions.
    } catch (error) {
        setSensorStatus(false,
            error.name === "AbortError"
                ? "ESP connection timed out."
                : `Connection error: ${error.message}`
        );
    } finally {
        clearTimeout(timeout);
    }
}

function connectSensor(event) {
    if (event) event.preventDefault();

    const ip = $("#sensorIP").value.trim();

    if (!ip) {
        showMessage("#sensorFeedback", "Enter the ESP8266 IP address.");
        return;
    }

    state.sensorIP = ip.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    localStorage.setItem("sina_weather_esp_ip", state.sensorIP);

    showMessage("#sensorEndpoint",
        `http://${state.sensorIP}/api/data`);

    if (state.sensorTimer) clearInterval(state.sensorTimer);

    fetchSensorData();
    state.sensorTimer = setInterval(fetchSensorData, CONFIG.sensorRefresh);
}

/* ==========================================
   EVENT LISTENERS
   ========================================== */

function initializeEvents() {
    $("#searchCityButton").addEventListener("click", searchCity);

    $("#cityInput").addEventListener("keydown", event => {
        if (event.key === "Enter") searchCity();
    });

    $("#scheduleForm").addEventListener("submit", addScheduleEvent);
    $("#clearDayButton").addEventListener("click", clearSelectedDay);
    $("#sensorForm").addEventListener("submit", connectSensor);

    document.querySelectorAll(".mode-button").forEach(button => {
        button.addEventListener("click", () => setMode(button.dataset.mode));
    });

    document.querySelectorAll(".nav-link").forEach(link => {
        link.addEventListener("click", () => {
            document.querySelectorAll(".nav-link")
                .forEach(item => item.classList.remove("active"));
            link.classList.add("active");
        });
    });
}

/* ==========================================
   START APPLICATION
   ========================================== */

async function initializeApp() {
    loadLocalSettings();
    initializeEvents();

    renderWeekdays();
    renderScheduleList();
    updateClock();
    setMode(state.mode);

    $("#cityName").textContent = state.city;

    await loadForecast();

    connectSensor();

    setInterval(updateClock, 1000);

    state.forecastTimer = setInterval(
        loadForecast,
        CONFIG.forecastRefresh
    );

    // Check the recurring manual schedule every 15 seconds.
    setInterval(applyScheduleForCurrentTime, 15000);
}

document.addEventListener("DOMContentLoaded", initializeApp);
