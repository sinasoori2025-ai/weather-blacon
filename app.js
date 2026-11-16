/* =========================================================
   SINA WEATHER
   COMPLETE WEATHER APPLICATION
   ESP8266 + DHT11 + WEEKLY SCHEDULE
   ========================================================= */

"use strict";


/* =========================================================
   01. CONFIGURATION
========================================================= */

const CONFIG = {

    sensor: {
        defaultIP: "192.168.1.110",
        endpoint: "/api/data",
        refreshInterval: 5000,
        timeout: 4500
    },

    storage: {
        schedules: "sina_weather_weekly_schedule_v3",
        settings: "sina_weather_settings_v3",
        sensorIP: "sina_weather_sensor_ip_v1"
    },

    history: {
        maxPoints: 30
    },

    defaults: {
        temperature: null,
        humidity: null,
        condition: "cloudy"
    },

    humidityRules: [
        { min: 0,  max: 49, condition: "sunny" },
        { min: 50, max: 69, condition: "cloudy" },
        { min: 70, max: 79, condition: "rain" },
        { min: 80, max: 89, condition: "heavy-rain" },
        { min: 90, max: 100, condition: "thunderstorm" }
    ]

};


/* =========================================================
   02. WEATHER DEFINITIONS
========================================================= */

const WEATHER = {

    sunny: {
        name: "Sunny",
        icon: "☀",
        description: "Clear and bright weather conditions.",
        animation: "sunny"
    },

    "partly-cloudy": {
        name: "Partly Cloudy",
        icon: "🌤",
        description: "A mixture of sunshine and clouds.",
        animation: "partly-cloudy"
    },

    cloudy: {
        name: "Cloudy",
        icon: "☁",
        description: "Cloud cover dominates the sky.",
        animation: "cloudy"
    },

    "cloudy-windy": {
        name: "Cloudy and Windy",
        icon: "🌥",
        description: "Cloudy weather with windy conditions.",
        animation: "cloudy-windy"
    },

    rain: {
        name: "Rain",
        icon: "🌧",
        description: "Rainy weather conditions are selected.",
        animation: "rain"
    },

    "heavy-rain": {
        name: "Heavy Rain",
        icon: "🌧",
        description: "Heavy rainfall conditions are selected.",
        animation: "heavy-rain"
    },

    thunderstorm: {
        name: "Thunderstorm",
        icon: "⛈",
        description: "Thunderstorm and heavy rain conditions are selected.",
        animation: "thunderstorm"
    },

    snow: {
        name: "Snow",
        icon: "🌨",
        description: "Snowfall conditions are selected.",
        animation: "snow"
    },

    "heavy-snow": {
        name: "Heavy Snow",
        icon: "❄",
        description: "Heavy snowfall conditions are selected.",
        animation: "heavy-snow"
    },

    fog: {
        name: "Fog",
        icon: "🌫",
        description: "Foggy conditions with reduced visibility.",
        animation: "fog"
    }

};


/* =========================================================
   03. WEEKDAYS
   Saturday = 0
   Sunday   = 1
   Monday   = 2
   Tuesday  = 3
   Wednesday= 4
   Thursday = 5
   Friday   = 6
========================================================= */

const WEEKDAYS = [
    "Saturday",
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday"
];

const WEEKDAY_SHORT = [
    "Sat",
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri"
];


/* =========================================================
   04. DOM HELPERS
========================================================= */

const $ = (selector, root = document) => {
    return root.querySelector(selector);
};

const $$ = (selector, root = document) => {
    return [...root.querySelectorAll(selector)];
};

const app = $("#weatherApp");


/* =========================================================
   05. APPLICATION STATE
========================================================= */

const state = {

    mode: "automatic",

    selectedDay: 0,

    schedules: [],

    sensorIP: CONFIG.sensor.defaultIP,

    connected: false,

    polling: false,

    pollTimer: null,

    requestController: null,

    lastSeen: null,

    temperature: null,

    humidity: null,

    windSpeed: null,

    rainfall: null,

    currentCondition: "cloudy",

    currentScheduledEvent: null,

    lastScheduleMinute: null,

    history: {
        temperature: [],
        humidity: []
    },

    settings: {
        animations: true,
        sound: false
    },

    lastWeatherChange: null,

    initialized: false

};


/* =========================================================
   06. GENERAL HELPERS
========================================================= */

function readStorage(key, fallback) {

    try {

        const raw = localStorage.getItem(key);

        if (!raw) {
            return fallback;
        }

        return JSON.parse(raw);

    } catch (error) {

        console.warn("Storage read error:", error);

        return fallback;

    }

}


function saveStorage(key, value) {

    try {

        localStorage.setItem(
            key,
            JSON.stringify(value)
        );

    } catch (error) {

        console.error("Storage write error:", error);

    }

}


function pad(number) {

    return String(number).padStart(2, "0");

}


function escapeHTML(value) {

    return String(value).replace(/[&<>"']/g, character => {

        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];

    });

}


function isValidWeather(condition) {

    return Object.prototype.hasOwnProperty.call(
        WEATHER,
        condition
    );

}


function validNumber(value, minimum, maximum) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return null;
    }

    if (
        number < minimum ||
        number > maximum
    ) {
        return null;
    }

    return number;

}


function timeToMinutes(time) {

    if (!/^\d{2}:\d{2}$/.test(String(time))) {
        return -1;
    }

    const [hours, minutes] = time.split(":").map(Number);

    if (
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return -1;
    }

    return hours * 60 + minutes;

}


function getLocalTimeMinutes(date = new Date()) {

    return date.getHours() * 60 + date.getMinutes();

}


/* =========================================================
   07. LOCAL WEEK CALCULATION
========================================================= */

function getSaturdayIndex(date = new Date()) {

    return (date.getDay() + 1) % 7;

}


function getPreviousDayIndex(day) {

    return (day + 6) % 7;

}


function getNextDayIndex(day) {

    return (day + 1) % 7;

}


function getTodayName() {

    return WEEKDAYS[getSaturdayIndex()];

}


/* =========================================================
   08. STORAGE: WEEKLY SCHEDULE
========================================================= */

function normalizeScheduleItem(item) {

    if (!item || typeof item !== "object") {
        return null;
    }

    const day = Number(item.day);

    const time = String(item.time || "");

    const condition = String(item.condition || "");

    if (
        !Number.isInteger(day) ||
        day < 0 ||
        day > 6
    ) {
        return null;
    }

    if (timeToMinutes(time) < 0) {
        return null;
    }

    if (!isValidWeather(condition)) {
        return null;
    }

    return {

        id: String(
            item.id ||
            `${Date.now()}-${Math.random().toString(16).slice(2)}`
        ),

        day,

        time,

        condition,

        temperature: validNumber(
            item.temperature,
            -50,
            60
        ),

        humidity: validNumber(
            item.humidity,
            0,
            100
        ),

        note: String(item.note || "")

    };

}


function loadSchedules() {

    const saved = readStorage(
        CONFIG.storage.schedules,
        []
    );

    if (!Array.isArray(saved)) {
        state.schedules = [];
        return;
    }

    state.schedules = saved
        .map(normalizeScheduleItem)
        .filter(Boolean);

    sortSchedules();

}


function saveSchedules() {

    sortSchedules();

    saveStorage(
        CONFIG.storage.schedules,
        state.schedules
    );

}


function sortSchedules() {

    state.schedules.sort((a, b) => {

        if (a.day !== b.day) {
            return a.day - b.day;
        }

        return timeToMinutes(a.time) - timeToMinutes(b.time);

    });

}


/* =========================================================
   09. SETTINGS STORAGE
========================================================= */

function loadSettings() {

    const saved = readStorage(
        CONFIG.storage.settings,
        {}
    );

    state.settings = {

        animations:
            typeof saved.animations === "boolean"
                ? saved.animations
                : true,

        sound:
            typeof saved.sound === "boolean"
                ? saved.sound
                : false

    };

    $("#animationToggle").checked =
        state.settings.animations;

    $("#soundToggle").checked =
        state.settings.sound;

    app.classList.toggle(
        "animations-off",
        !state.settings.animations
    );

}


function saveSettings() {

    saveStorage(
        CONFIG.storage.settings,
        state.settings
    );

}


/* =========================================================
   10. CLOCK
========================================================= */

function updateClock() {

    const now = new Date();

    $("#clockLabel").textContent =
        now.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });

    $("#dateLabel").textContent =
        now.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        });

    const todayIndex = getSaturdayIndex(now);

    $("#todayBadge").textContent =
        `TODAY · ${WEEKDAYS[todayIndex].toUpperCase()}`;

    if (state.mode === "schedule") {

        const minuteKey = [
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours(),
            now.getMinutes()
        ].join("-");

        if (minuteKey !== state.lastScheduleMinute) {

            state.lastScheduleMinute = minuteKey;

            applyScheduleForCurrentTime();

        }

    }

}


/* =========================================================
   11. WEATHER FROM HUMIDITY
========================================================= */

function getWeatherFromHumidity(humidity) {

    if (
        humidity === null ||
        !Number.isFinite(Number(humidity))
    ) {
        return "cloudy";
    }

    const value = Number(humidity);

    const rule = CONFIG.humidityRules.find(item => {

        return (
            value >= item.min &&
            value <= item.max
        );

    });

    return rule ? rule.condition : "cloudy";

}


/* =========================================================
   12. MODE CONTROL
========================================================= */

function setMode(mode) {

    if (
        mode !== "automatic" &&
        mode !== "schedule"
    ) {
        return;
    }

    state.mode = mode;

    app.dataset.mode = mode;

    $$(".mode-button").forEach(button => {

        const active = button.dataset.mode === mode;

        button.classList.toggle(
            "active",
            active
        );

        button.setAttribute(
            "aria-pressed",
            String(active)
        );

    });

    if (mode === "automatic") {

        $("#modeLabel").textContent =
            "AUTOMATIC MODE";

        state.currentScheduledEvent = null;

        if (state.humidity !== null) {

            const condition = getWeatherFromHumidity(
                state.humidity
            );

            setWeather(
                condition,
                state.temperature,
                state.humidity,
                "Automatic humidity estimate"
            );

        } else {

            $("#scheduleStatus").textContent =
                "Waiting for sensor data";

        }

    } else {

        $("#modeLabel").textContent =
            "WEEKLY SCHEDULE MODE";

        state.lastScheduleMinute = null;

        applyScheduleForCurrentTime();

    }

}


/* =========================================================
   13. WEATHER DISPLAY
========================================================= */

function setWeather(
    condition,
    temperature = null,
    humidity = null,
    source = ""
) {

    if (!isValidWeather(condition)) {
        condition = "cloudy";
    }

    const previousCondition = state.currentCondition;

    state.currentCondition = condition;

    app.dataset.weather = condition;

    const weather = WEATHER[condition];

    $("#heroCondition").textContent =
        weather.name;

    $("#heroIcon").textContent =
        weather.icon;

    $("#weatherDescription").textContent =
        weather.description;

    if (temperature !== null && Number.isFinite(Number(temperature))) {

        $("#heroTemp").textContent =
            Math.round(Number(temperature));

        $("#feelsLike").textContent =
            `${Math.round(Number(temperature))}°`;

    }

    if (humidity !== null && Number.isFinite(Number(humidity))) {

        $("#heroHumidity").textContent =
            `${Math.round(Number(humidity))}%`;

    } else if (state.humidity !== null) {

        $("#heroHumidity").textContent =
            `${Math.round(state.humidity)}%`;

    }

    if (source) {

        $("#heroUpdated").textContent = source;

    }

    if (previousCondition !== condition) {

        state.lastWeatherChange = new Date();

        playWeatherSound();

    }

    renderWeatherScene(condition);

}


/* =========================================================
   14. WEATHER SCENE GENERATOR
========================================================= */

function renderWeatherScene(condition) {

    const scene = $("#weatherScene");

    if (!scene) return;

    if (!state.settings.animations) {

        scene.innerHTML = "";

        return;

    }

    let elements = "";

    /* SUN */

    if (
        condition === "sunny" ||
        condition === "partly-cloudy"
    ) {

        elements += `
            <div class="weather-sun"></div>
        `;

    }


    /* CLOUDS */

    const cloudConditions = [
        "partly-cloudy",
        "cloudy",
        "cloudy-windy",
        "rain",
        "heavy-rain",
        "thunderstorm",
        "snow",
        "heavy-snow",
        "fog"
    ];

    if (cloudConditions.includes(condition)) {

        elements += `
            <div class="scene-cloud cloud-one"></div>
            <div class="scene-cloud cloud-two"></div>
        `;

    }


    /* RAIN */

    if (
        condition === "rain" ||
        condition === "heavy-rain" ||
        condition === "thunderstorm"
    ) {

        let count = 36;

        if (condition === "heavy-rain") {
            count = 78;
        }

        if (condition === "thunderstorm") {
            count = 100;
        }

        for (let i = 0; i < count; i++) {

            const left = Math.random() * 100;

            const delay = Math.random() * 1.5;

            const duration =
                condition === "rain"
                    ? 0.9 + Math.random() * 0.45
                    : 0.45 + Math.random() * 0.35;

            elements += `
                <i
                    class="rain-drop"
                    style="
                        left:${left}%;
                        animation-delay:${delay}s;
                        animation-duration:${duration}s;
                    ">
                </i>
            `;

        }

    }


    /* SNOW */

    if (
        condition === "snow" ||
        condition === "heavy-snow"
    ) {

        const count =
            condition === "snow" ? 38 : 85;

        for (let i = 0; i < count; i++) {

            const left = Math.random() * 100;

            const delay = Math.random() * 6;

            const duration =
                4 + Math.random() * 5;

            const size =
                8 + Math.random() * 10;

            elements += `
                <i
                    class="snow-flake"
                    style="
                        left:${left}%;
                        animation-delay:${delay}s;
                        animation-duration:${duration}s;
                        font-size:${size}px;
                    ">❄</i>
            `;

        }

    }


    /* FOG */

    if (condition === "fog") {

        for (let i = 0; i < 5; i++) {

            elements += `
                <div
                    class="fog-band"
                    style="
                        top:${18 + i * 17}%;
                        animation-delay:${i * -2}s;
                    ">
                </div>
            `;

        }

    }


    /* WIND */

    if (
        condition === "cloudy-windy" ||
        condition === "thunderstorm"
    ) {

        for (let i = 0; i < 12; i++) {

            elements += `
                <i
                    class="wind-streak"
                    style="
                        top:${15 + Math.random() * 75}%;
                        left:${Math.random() * 100}%;
                        animation-delay:${Math.random() * 3}s;
                    ">
                </i>
            `;

        }

    }


    /* LIGHTNING */

    if (condition === "thunderstorm") {

        elements += `
            <div class="lightning-flash"></div>
        `;

    }

    scene.innerHTML = elements;

}


/* =========================================================
   15. OPTIONAL WEATHER SOUND
========================================================= */

let audioContext = null;

function playWeatherSound() {

    if (!state.settings.sound) {
        return;
    }

    /*
      Sound is intentionally subtle.
      No sound is played unless the user enables it.
    */

    try {

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            return;
        }

        if (!audioContext) {
            audioContext = new AudioContextClass();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        const oscillator =
            audioContext.createOscillator();

        const gain =
            audioContext.createGain();

        oscillator.type = "sine";

        oscillator.frequency.setValueAtTime(
            520,
            audioContext.currentTime
        );

        gain.gain.setValueAtTime(
            0.0001,
            audioContext.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.025,
            audioContext.currentTime + 0.04
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            audioContext.currentTime + 0.22
        );

        oscillator.connect(gain);

        gain.connect(audioContext.destination);

        oscillator.start();

        oscillator.stop(
            audioContext.currentTime + 0.24
        );

    } catch (error) {

        console.warn("Audio is unavailable:", error);

    }

}


/* =========================================================
   16. WEEKLY SCHEDULE DATA
========================================================= */

function getScheduleForDay(day) {

    return state.schedules
        .filter(item => item.day === day)
        .sort((a, b) => {

            return (
                timeToMinutes(a.time) -
                timeToMinutes(b.time)
            );

        });

}


function getCurrentScheduleEvent(date = new Date()) {

    const currentDay = getSaturdayIndex(date);

    const currentMinutes = getLocalTimeMinutes(date);

    const todayEvents = getScheduleForDay(currentDay);

    const activeToday = todayEvents.filter(item => {

        return timeToMinutes(item.time) <= currentMinutes;

    });

    if (activeToday.length > 0) {

        return activeToday[activeToday.length - 1];

    }


    /*
      If today's first event has not started,
      use the last event from the previous weekday.
      This makes the weekly schedule continuous.
    */

    const previousDay = getPreviousDayIndex(currentDay);

    const previousEvents = getScheduleForDay(previousDay);

    if (previousEvents.length > 0) {

        return previousEvents[previousEvents.length - 1];

    }

    /*
      No event exists today or yesterday.
      Search backward through the remaining weekly cycle.
    */

    for (let offset = 2; offset <= 7; offset++) {

        const previousIndex =
            (currentDay - offset + 7) % 7;

        const events = getScheduleForDay(previousIndex);

        if (events.length > 0) {

            return events[events.length - 1];

        }

    }

    return null;

}


/* =========================================================
   17. APPLY WEEKLY SCHEDULE
========================================================= */

function applyScheduleForCurrentTime() {

    if (state.mode !== "schedule") {
        return;
    }

    const event = getCurrentScheduleEvent();

    state.currentScheduledEvent = event;

    if (!event) {

        $("#scheduleStatus").textContent =
            "No weekly schedule configured";

        setWeather(
            "cloudy",
            state.temperature,
            state.humidity,
            "No schedule configured"
        );

        return;

    }

    const eventWeather = WEATHER[event.condition];

    const temperature =
        event.temperature !== null
            ? event.temperature
            : state.temperature;

    const humidity =
        event.humidity !== null
            ? event.humidity
            : state.humidity;

    setWeather(
        event.condition,
        temperature,
        humidity,
        `Weekly schedule · ${WEEKDAYS[event.day]} ${event.time}`
    );

    $("#scheduleStatus").textContent =
        `Scheduled · ${WEEKDAYS[event.day]} · ${event.time}`;

}


/* =========================================================
   18. WEEKLY DAY SELECTOR
========================================================= */

function renderWeeklyDays() {

    const container = $("#weeklyForecast");

    const today = getSaturdayIndex();

    container.innerHTML = WEEKDAYS.map((day, index) => {

        const events = getScheduleForDay(index);

        const nextEvent = events[0] || null;

        const icon = nextEvent
            ? WEATHER[nextEvent.condition].icon
            : "＋";

        const eventCount = events.length;

        const selected =
            state.selectedDay === index;

        const isToday =
            today === index;

        return `
            <button
                type="button"
                class="
                    day-card
                    ${selected ? "selected" : ""}
                    ${isToday ? "today" : ""}
                "
                data-day="${index}"
                aria-pressed="${selected}">

                <div class="day-name">
                    ${WEEKDAY_SHORT[index]}
                </div>

                <div class="day-icon">
                    ${icon}
                </div>

                <div class="day-count">
                    ${eventCount}
                    ${eventCount === 1 ? "event" : "events"}
                </div>

            </button>
        `;

    }).join("");


    $$("[data-day]", container).forEach(button => {

        button.addEventListener("click", () => {

            const day = Number(button.dataset.day);

            if (!Number.isInteger(day) || day < 0 || day > 6) {
                return;
            }

            state.selectedDay = day;

            renderWeeklyDays();

            renderSelectedDay();

        });

    });

}


/* =========================================================
   19. RENDER SELECTED DAY
========================================================= */

function renderSelectedDay() {

    const day = state.selectedDay;

    $("#selectedDayTitle").textContent =
        WEEKDAYS[day];

    const events = getScheduleForDay(day);

    $("#selectedDayEventCount").textContent =
        `${events.length} ${events.length === 1 ? "EVENT" : "EVENTS"}`;

    const container = $("#scheduleList");

    if (events.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
                No weather events have been added for this day.
            </div>
        `;

        return;

    }

    container.innerHTML = events.map(event => {

        const weather = WEATHER[event.condition];

        const temperatureText =
            event.temperature === null
                ? "Temperature not set"
                : `${event.temperature}°C`;

        const humidityText =
            event.humidity === null
                ? ""
                : ` · ${event.humidity}% humidity`;

        return `
            <div class="schedule-event">

                <div class="event-time">
                    ${escapeHTML(event.time)}
                </div>

                <div class="event-description">

                    <div class="event-weather">
                        ${weather.icon}
                        ${weather.name}
                    </div>

                    <div class="event-meta">
                        ${temperatureText}${humidityText}
                    </div>

                </div>

                <button
                    type="button"
                    class="delete-event"
                    data-delete="${escapeHTML(event.id)}">

                    Remove

                </button>

            </div>
        `;

    }).join("");


    $$("[data-delete]", container).forEach(button => {

        button.addEventListener("click", () => {

            removeScheduleEvent(
                button.dataset.delete
            );

        });

    });

}


/* =========================================================
   20. ADD WEEKLY EVENT
========================================================= */

function addScheduleEvent(event) {

    event.preventDefault();

    const time = $("#eventTime").value;

    const condition = $("#eventCondition").value;

    const temperature = validNumber(
        $("#eventTemp").value,
        -50,
        60
    );

    const humidity = validNumber(
        $("#eventHumidity").value,
        0,
        100
    );

    if (timeToMinutes(time) < 0) {

        $("#scheduleStatus").textContent =
            "Please enter a valid time";

        return;

    }

    if (!isValidWeather(condition)) {

        $("#scheduleStatus").textContent =
            "Invalid weather condition";

        return;

    }


    /*
      One event per weekday and time.
      If the same time already exists, update it.
    */

    const existing = state.schedules.find(item => {

        return (
            item.day === state.selectedDay &&
            item.time === time
        );

    });

    if (existing) {

        existing.condition = condition;
        existing.temperature = temperature;
        existing.humidity = humidity;

    } else {

        state.schedules.push({

            id:
                `${Date.now()}-${Math.random().toString(16).slice(2)}`,

            day: state.selectedDay,

            time,

            condition,

            temperature,

            humidity,

            note: ""

        });

    }

    saveSchedules();

    renderWeeklyDays();

    renderSelectedDay();

    $("#eventTemp").value = "";
    $("#eventHumidity").value = "";

    $("#eventTime").value = "08:00";

    if (state.mode === "schedule") {

        state.lastScheduleMinute = null;

        applyScheduleForCurrentTime();

    }

}


/* =========================================================
   21. REMOVE WEEKLY EVENT
========================================================= */

function removeScheduleEvent(id) {

    state.schedules = state.schedules.filter(item => {

        return item.id !== id;

    });

    saveSchedules();

    renderWeeklyDays();

    renderSelectedDay();

    if (state.mode === "schedule") {

        state.lastScheduleMinute = null;

        applyScheduleForCurrentTime();

    }

}


/* =========================================================
   22. CLEAR SELECTED DAY
========================================================= */

function clearSelectedDay() {

    const day = state.selectedDay;

    state.schedules = state.schedules.filter(item => {

        return item.day !== day;

    });

    saveSchedules();

    renderWeeklyDays();

    renderSelectedDay();

    if (state.mode === "schedule") {

        state.lastScheduleMinute = null;

        applyScheduleForCurrentTime();

    }

}


/* =========================================================
   23. SENSOR DISPLAY
========================================================= */

function updateSensorDisplays() {

    const temperature = state.temperature;

    const humidity = state.humidity;

    const wind = state.windSpeed;

    const rain = state.rainfall;


    $("#sensorTemperature").textContent =
        temperature === null
            ? "--°"
            : `${temperature.toFixed(1)}°`;


    $("#sensorHumidity").textContent =
        humidity === null
            ? "--%"
            : `${Math.round(humidity)}%`;


    $("#sensorWind").textContent =
        wind === null
            ? "N/A"
            : `${wind.toFixed(1)} km/h`;


    $("#sensorRainfall").textContent =
        rain === null
            ? "N/A"
            : `${rain.toFixed(1)} mm`;


    $("#rightTemperature").textContent =
        temperature === null
            ? "--°"
            : `${temperature.toFixed(1)}°`;


    $("#rightHumidity").textContent =
        humidity === null
            ? "--%"
            : `${Math.round(humidity)}%`;


    $("#rightWind").textContent =
        wind === null
            ? "N/A"
            : `${wind.toFixed(1)} km/h`;


    $("#heroWind").textContent =
        wind === null
            ? "N/A"
            : `${wind.toFixed(1)} km/h`;


    $("#heroRain").textContent =
        rain === null
            ? "N/A"
            : `${rain.toFixed(1)} mm`;


    if (state.mode === "automatic") {

        $("#heroHumidity").textContent =
            humidity === null
                ? "--%"
                : `${Math.round(humidity)}%`;

    }


    updateWindVisual();

}


/* =========================================================
   24. WIND VISUAL
========================================================= */

function updateWindVisual() {

    const tree = $("#windTree");

    const description = $("#windDescription");

    if (state.windSpeed === null) {

        tree.style.transform = "rotate(0deg)";

        description.textContent =
            "Wind speed sensor is not connected.";

        return;

    }

    const speed = state.windSpeed;

    const angle = Math.max(
        -35,
        Math.min(35, speed * 1.2)
    );

    tree.style.transform =
        `rotate(${angle}deg)`;

    description.textContent =
        `Measured wind speed: ${speed.toFixed(1)} km/h`;

}


/* =========================================================
   25. SENSOR CONNECTION STATUS
========================================================= */

function setConnectionStatus(connected, message = "") {

    state.connected = connected;

    const status = $("#sensorStatus");

    status.dataset.status =
        connected ? "connected" : "disconnected";

    $("#sensorStatusText").textContent =
        connected
            ? "Station connected"
            : "Station offline";


    $("#rightStationStatus").textContent =
        connected ? "Online" : "Offline";


    $("#rightStationText").textContent =
        connected
            ? "Receiving sensor data from ESP8266."
            : "Waiting for ESP8266 connection.";


    $("#rightStationOrb").style.color =
        connected ? "#79dfa9" : "#ff8585";


    $("#sidebarConnectionText").textContent =
        connected
            ? "Station connected"
            : "Station offline";


    $("#sidebarStatusIndicator").style.background =
        connected ? "#79dfa9" : "#ff8585";


    $(".sidebar-station-card").classList.toggle(
        "connected",
        connected
    );


    const feedback = $("#sensorFeedback");

    feedback.textContent =
        message ||
        (
            connected
                ? "ESP8266 connected successfully."
                : "Station connection unavailable."
        );

    feedback.classList.toggle(
        "success",
        connected
    );

    feedback.classList.toggle(
        "error",
        !connected
    );


    $("#dataSource").textContent =
        connected
            ? "LIVE · ESP8266 · DHT11"
            : "Waiting for ESP8266";


    $("#connectionDetails").textContent =
        connected
            ? "Receiving data from local weather station."
            : "Device has not been connected.";

}


/* =========================================================
   26. SENSOR ENDPOINT
========================================================= */

function updateSensorEndpoint() {

    const address =
        `http://${state.sensorIP}${CONFIG.sensor.endpoint}`;

    $("#sensorEndpoint").textContent = address;

}


/* =========================================================
   27. SENSOR DATA PROCESSING
========================================================= */

function processSensorData(data) {

    if (!data || typeof data !== "object") {

        throw new Error("Invalid sensor response");

    }


    /*
      Do not convert null to zero.
      Null means the sensor does not provide that measurement.
    */

    const temperature = validNumber(
        data.temperature ?? data.temp,
        -50,
        60
    );

    const humidity = validNumber(
        data.humidity ?? data.airHumidity,
        0,
        100
    );

    const windSpeed = validNumber(
        data.windSpeed ?? data.wind,
        0,
        300
    );

    const rainfall = validNumber(
        data.rainfall ?? data.rain,
        0,
        10000
    );


    const timestamp = Date.now();


    if (temperature !== null) {

        state.temperature = temperature;

        addHistoryValue(
            "temperature",
            temperature,
            timestamp
        );

    }


    if (humidity !== null) {

        state.humidity = humidity;

        addHistoryValue(
            "humidity",
            humidity,
            timestamp
        );

    }


    /*
      Keep last known value if a field is null.
      This avoids displaying false zero values.
    */

    if (windSpeed !== null) {

        state.windSpeed = windSpeed;

    }


    if (rainfall !== null) {

        state.rainfall = rainfall;

    }


    state.lastSeen = new Date();


    $("#sensorLastSeen").textContent =
        `Last reading · ${state.lastSeen.toLocaleTimeString()}`;


    $("#heroUpdated").textContent =
        `Updated ${state.lastSeen.toLocaleTimeString()}`;


    updateSensorDisplays();


    /*
      Only Automatic mode can use humidity to change weather.
      Schedule mode always keeps the manually selected weather.
    */

    if (
        state.mode === "automatic" &&
        humidity !== null
    ) {

        const condition =
            getWeatherFromHumidity(humidity);

        setWeather(
            condition,
            state.temperature,
            state.humidity,
            `Automatic estimate · ${Math.round(humidity)}% humidity`
        );

    }


    if (state.mode === "schedule") {

        /*
          Sensor updates must never overwrite the schedule.
          Only the temperature reading may refresh when
          the scheduled event has no manual temperature.
        */

        const event = state.currentScheduledEvent;

        if (
            event &&
            event.temperature === null &&
            state.temperature !== null
        ) {

            $("#heroTemp").textContent =
                Math.round(state.temperature);

            $("#feelsLike").textContent =
                `${Math.round(state.temperature)}°`;

        }

    }


    return {
        temperature,
        humidity,
        windSpeed,
        rainfall
    };

}


/* =========================================================
   28. HISTORY
========================================================= */

function addHistoryValue(type, value, timestamp) {

    if (!state.history[type]) {
        state.history[type] = [];
    }

    state.history[type].push({

        time: timestamp,

        value

    });

    state.history[type] =
        state.history[type].slice(
            -CONFIG.history.maxPoints
        );

    drawCharts();

}


/* =========================================================
   29. FETCH ESP8266 DATA
========================================================= */

async function fetchSensorData() {

    if (state.polling) {
        return null;
    }

    if (!state.sensorIP) {
        return null;
    }

    state.polling = true;


    const controller = new AbortController();

    state.requestController = controller;


    const timeout = setTimeout(() => {

        controller.abort();

    }, CONFIG.sensor.timeout);


    try {

        const url =
            `http://${state.sensorIP}${CONFIG.sensor.endpoint}`;

        const response = await fetch(url, {

            method: "GET",

            cache: "no-store",

            signal: controller.signal,

            headers: {
                "Accept": "application/json"
            }

        });


        if (!response.ok) {

            throw new Error(
                `HTTP error ${response.status}`
            );

        }


        const contentType =
            response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {

            throw new Error(
                "The ESP8266 did not return JSON data."
            );

        }


        const data = await response.json();


        processSensorData(data);


        setConnectionStatus(
            true,
            "Sensor data received successfully."
        );


        return data;

    } catch (error) {

        console.error(
            "ESP8266 connection error:",
            error
        );


        let message = "Connection failed.";

        if (error.name === "AbortError") {

            message = "Connection timed out.";

        } else if (
            error instanceof TypeError
        ) {

            message =
                "Network error. Check Wi-Fi, IP address, CORS and browser security.";

        } else {

            message = error.message;

        }


        setConnectionStatus(
            false,
            message
        );


        /*
          Last successful readings are intentionally retained.
        */

        return null;

    } finally {

        clearTimeout(timeout);

        state.polling = false;

        state.requestController = null;

    }

}


/* =========================================================
   30. CONNECT SENSOR
========================================================= */

function normalizeIPAddress(value) {

    let address = String(value || "").trim();

    address = address.replace(/^https?:\/\//i, "");

    address = address.replace(/\/.*$/, "");

    address = address.replace(/:\d+$/, "");

    return address;

}


function isValidIPv4(address) {

    const parts = address.split(".");

    if (parts.length !== 4) {
        return false;
    }

    return parts.every(part => {

        if (!/^\d{1,3}$/.test(part)) {
            return false;
        }

        const number = Number(part);

        return number >= 0 && number <= 255;

    });

}


function connectSensor(event) {

    if (event) {
        event.preventDefault();
    }

    const input = $("#sensorIP");

    const address = normalizeIPAddress(
        input.value
    );


    if (!isValidIPv4(address)) {

        setConnectionStatus(
            false,
            "Enter a valid IPv4 address."
        );

        return;

    }


    state.sensorIP = address;

    input.value = address;


    localStorage.setItem(
        CONFIG.storage.sensorIP,
        address
    );


    updateSensorEndpoint();


    if (state.pollTimer) {

        clearInterval(state.pollTimer);

        state.pollTimer = null;

    }


    if (state.requestController) {

        state.requestController.abort();

    }


    /*
      Start one immediate request.
      Further requests run every five seconds.
    */

    fetchSensorData();


    state.pollTimer = setInterval(() => {

        fetchSensorData();

    }, CONFIG.sensor.refreshInterval);

}


/* =========================================================
   31. CHART DRAWING
========================================================= */

function drawChart(canvasId, history, unit) {

    const canvas = $("#" + canvasId);

    if (!canvas) {
        return;
    }

    const context = canvas.getContext("2d");

    const width = Math.max(
        250,
        canvas.clientWidth
    );

    const height = 180;

    const pixelRatio =
        window.devicePixelRatio || 1;


    canvas.width =
        Math.floor(width * pixelRatio);

    canvas.height =
        Math.floor(height * pixelRatio);


    context.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0
    );


    context.clearRect(
        0,
        0,
        width,
        height
    );


    /* GRID */

    context.strokeStyle =
        "rgba(255,255,255,0.075)";

    context.lineWidth = 1;


    for (let i = 1; i <= 4; i++) {

        const y = i * height / 5;

        context.beginPath();

        context.moveTo(0, y);

        context.lineTo(width, y);

        context.stroke();

    }


    /* NO DATA */

    if (!history || history.length < 2) {

        context.fillStyle = "#71869e";

        context.font = "10px Inter";

        context.fillText(
            "Waiting for more sensor readings",
            12,
            height / 2
        );

        return;

    }


    const values = history.map(item => item.value);

    let minimum = Math.min(...values);

    let maximum = Math.max(...values);


    if (minimum === maximum) {

        minimum -= 1;

        maximum += 1;

    } else {

        minimum -= 1;

        maximum += 1;

    }


    const range = maximum - minimum;

    const paddingX = 12;

    const paddingY = 18;

    const chartWidth =
        width - paddingX * 2;

    const chartHeight =
        height - paddingY * 2;


    const points = history.map((item, index) => {

        const x =
            paddingX +
            chartWidth *
            index /
            (history.length - 1);

        const y =
            height -
            paddingY -
            (
                (item.value - minimum) /
                range
            ) *
            chartHeight;

        return {
            x,
            y,
            value: item.value
        };

    });


    /* AREA */

    context.beginPath();

    context.moveTo(
        points[0].x,
        height - paddingY
    );

    points.forEach(point => {

        context.lineTo(
            point.x,
            point.y
        );

    });

    context.lineTo(
        points[points.length - 1].x,
        height - paddingY
    );

    context.closePath();


    const gradient =
        context.createLinearGradient(
            0,
            0,
            0,
            height
        );

    gradient.addColorStop(
        0,
        "rgba(112, 216, 228, 0.22)"
    );

    gradient.addColorStop(
        1,
        "rgba(112, 216, 228, 0.005)"
    );


    context.fillStyle = gradient;

    context.fill();


    /* LINE */

    context.beginPath();

    points.forEach((point, index) => {

        if (index === 0) {

            context.moveTo(
                point.x,
                point.y
            );

        } else {

            context.lineTo(
                point.x,
                point.y
            );

        }

    });


    context.strokeStyle = "#79dce7";

    context.lineWidth = 2.5;

    context.lineJoin = "round";

    context.lineCap = "round";

    context.stroke();


    /* LAST POINT */

    const lastPoint =
        points[points.length - 1];


    context.beginPath();

    context.arc(
        lastPoint.x,
        lastPoint.y,
        4,
        0,
        Math.PI * 2
    );

    context.fillStyle = "#ffffff";

    context.fill();


    context.beginPath();

    context.arc(
        lastPoint.x,
        lastPoint.y,
        7,
        0,
        Math.PI * 2
    );

    context.strokeStyle =
        "rgba(121, 220, 231, 0.5)";

    context.lineWidth = 2;

    context.stroke();


    /* LAST VALUE */

    context.fillStyle = "#bcd4e8";

    context.font = "9px Inter";

    context.fillText(
        `${lastPoint.value.toFixed(1)} ${unit}`,
        Math.min(lastPoint.x + 8, width - 70),
        Math.max(12, lastPoint.y - 10)
    );

}


function drawCharts() {

    drawChart(
        "temperatureChart",
        state.history.temperature,
        "°C"
    );

    drawChart(
        "humidityChart",
        state.history.humidity,
        "%"
    );

}


/* =========================================================
   32. ANIMATION SETTING
========================================================= */

function setAnimations(enabled) {

    state.settings.animations = Boolean(enabled);

    app.classList.toggle(
        "animations-off",
        !state.settings.animations
    );

    saveSettings();

    renderWeatherScene(
        state.currentCondition
    );

}


/* =========================================================
   33. SOUND SETTING
========================================================= */

function setSound(enabled) {

    state.settings.sound = Boolean(enabled);

    saveSettings();

}


/* =========================================================
   34. NAVIGATION
========================================================= */

function initializeNavigation() {

    $$(".nav-link").forEach(link => {

        link.addEventListener("click", event => {

            const target = link.getAttribute("href");

            if (!target || !target.startsWith("#")) {
                return;
            }

            const section = $(target);

            if (!section) {
                return;
            }

            $$(".nav-link").forEach(item => {

                item.classList.remove("active");

            });

            link.classList.add("active");

        });

    });


    const sections = $$(
        "#home, #forecast, #weekly, #analytics, #station, #settings"
    );

    if (!("IntersectionObserver" in window)) {
        return;
    }


    const observer = new IntersectionObserver(entries => {

        const visible = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => {

                return b.intersectionRatio - a.intersectionRatio;

            });


        if (!visible.length) {
            return;
        }

        const currentId = visible[0].target.id;

        $$(".nav-link").forEach(link => {

            link.classList.toggle(
                "active",
                link.dataset.section === currentId
            );

        });

    }, {

        root: null,

        threshold: [0.2, 0.4, 0.6],

        rootMargin: "-10% 0px -55% 0px"

    });


    sections.forEach(section => {

        observer.observe(section);

    });

}


/* =========================================================
   35. SETTINGS EVENTS
========================================================= */

function initializeSettingsEvents() {

    $("#animationToggle").addEventListener(
        "change",
        event => {

            setAnimations(
                event.target.checked
            );

        }
    );


    $("#soundToggle").addEventListener(
        "change",
        event => {

            setSound(
                event.target.checked
            );

        }
    );

}


/* =========================================================
   36. MODE EVENTS
========================================================= */

function initializeModeEvents() {

    $$(".mode-button").forEach(button => {

        button.addEventListener("click", () => {

            setMode(
                button.dataset.mode
            );

        });

    });

}


/* =========================================================
   37. SCHEDULE EVENTS
========================================================= */

function initializeScheduleEvents() {

    $("#scheduleForm").addEventListener(
        "submit",
        addScheduleEvent
    );


    $("#clearDayButton").addEventListener(
        "click",
        clearSelectedDay
    );

}


/* =========================================================
   38. SENSOR EVENTS
========================================================= */

function initializeSensorEvents() {

    $("#sensorForm").addEventListener(
        "submit",
        connectSensor
    );

}


/* =========================================================
   39. WINDOW EVENTS
========================================================= */

function initializeWindowEvents() {

    let resizeTimer = null;

    window.addEventListener("resize", () => {

        clearTimeout(resizeTimer);

        resizeTimer = setTimeout(() => {

            drawCharts();

        }, 150);

    });


    window.addEventListener("online", () => {

        if (state.sensorIP) {

            fetchSensorData();

        }

    });

}


/* =========================================================
   40. LOAD SENSOR IP
========================================================= */

function loadSensorIP() {

    const saved = localStorage.getItem(
        CONFIG.storage.sensorIP
    );

    const candidate =
        saved || CONFIG.sensor.defaultIP;

    state.sensorIP = isValidIPv4(candidate)
        ? candidate
        : CONFIG.sensor.defaultIP;

    $("#sensorIP").value =
        state.sensorIP;

    updateSensorEndpoint();

}


/* =========================================================
   41. INITIALIZE WEATHER DISPLAY
========================================================= */

function initializeWeatherDisplay() {

    state.currentCondition =
        CONFIG.defaults.condition;

    app.dataset.weather =
        state.currentCondition;

    $("#heroTemp").textContent = "--";

    $("#heroHumidity").textContent = "--%";

    $("#heroWind").textContent = "N/A";

    $("#heroRain").textContent = "N/A";

    $("#heroCondition").textContent =
        WEATHER.cloudy.name;

    $("#heroIcon").textContent =
        WEATHER.cloudy.icon;

    $("#weatherDescription").textContent =
        "Waiting for sensor data.";

    renderWeatherScene("cloudy");

}


/* =========================================================
   42. START SENSOR POLLING
========================================================= */

function startSensorPolling() {

    if (state.pollTimer) {

        clearInterval(state.pollTimer);

    }

    fetchSensorData();

    state.pollTimer = setInterval(() => {

        fetchSensorData();

    }, CONFIG.sensor.refreshInterval);

}


/* =========================================================
   43. APPLICATION INITIALIZATION
========================================================= */

function initializeApp() {

    if (state.initialized) {
        return;
    }

    state.initialized = true;


    /* Load saved information */

    loadSchedules();

    loadSettings();

    loadSensorIP();


    /* Initialize display */

    initializeWeatherDisplay();

    updateClock();


    /* Initialize weekly schedule */

    state.selectedDay = getSaturdayIndex();

    renderWeeklyDays();

    renderSelectedDay();


    /* Initialize modes */

    setMode("automatic");


    /* Initialize all event handlers */

    initializeModeEvents();

    initializeScheduleEvents();

    initializeSensorEvents();

    initializeSettingsEvents();

    initializeNavigation();

    initializeWindowEvents();


    /* Start live clock */

    setInterval(updateClock, 1000);


    /* Start ESP8266 polling */

    startSensorPolling();


    /* Initial chart display */

    drawCharts();


    console.log(
        "%cSINA WEATHER",
        "color:#79dce7;font-size:22px;font-weight:900;"
    );

    console.log(
        "Application initialized."
    );

    console.log(
        "ESP8266 address:",
        state.sensorIP
    );

    console.log(
        "API endpoint:",
        `http://${state.sensorIP}${CONFIG.sensor.endpoint}`
    );

}


/* =========================================================
   44. DOM READY
========================================================= */

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializeApp,
        { once: true }
    );

} else {

    initializeApp();

}