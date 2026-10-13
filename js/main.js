// Store hours, keyed by day of week (0 = Sunday ... 6 = Saturday).
// Times are 24-hour "HH:MM" in the store's local time (Eastern).
// Keep these in sync with the hours table in index.html.
// Use null for a day the store is closed.
const HOURS = {
  0: ["07:00", "22:00"],
  1: ["07:00", "22:00"],
  2: ["07:00", "22:00"],
  3: ["07:00", "22:00"],
  4: ["07:00", "22:00"],
  5: ["07:00", "22:00"],
  6: ["07:00", "22:00"],
};
const TIME_ZONE = "America/Indiana/Indianapolis";

function storeNow() {
  // Current day and minutes-since-midnight in the store's time zone,
  // so visitors in other time zones see the right status.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    day: days.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return m ? `${hour12}:${String(m).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`;
}

function nextOpening(day) {
  for (let i = 1; i <= 7; i++) {
    const d = (day + i) % 7;
    if (HOURS[d]) {
      const label = i === 1 ? "tomorrow" : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d];
      return `${label} at ${formatTime(HOURS[d][0])}`;
    }
  }
  return null;
}

function updateOpenStatus() {
  const { day, minutes } = storeNow();
  const today = HOURS[day];
  let open = false;
  let message;

  if (today) {
    const start = toMinutes(today[0]);
    const end = toMinutes(today[1]);
    if (minutes >= start && minutes < end) {
      open = true;
      message = `Open now · until ${formatTime(today[1])}`;
    } else if (minutes < start) {
      message = `Closed now · opens today at ${formatTime(today[0])}`;
    }
  }
  if (!open && !message) {
    const next = nextOpening(day);
    message = next ? `Closed now · opens ${next}` : "Closed";
  }

  document.querySelectorAll("[data-open-status]").forEach((el) => (el.textContent = message));
  document.querySelectorAll("[data-open-dot]").forEach((el) => {
    el.classList.toggle("open", open);
    el.classList.toggle("closed", !open);
  });
  document.querySelectorAll("[data-hours-table] tr").forEach((row) => {
    row.classList.toggle("today", Number(row.dataset.day) === day);
  });
}

// Mobile navigation
const toggle = document.querySelector(".nav-toggle");
const menu = document.getElementById("nav-menu");
toggle.addEventListener("click", () => {
  const isOpen = menu.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});
menu.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    menu.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  })
);

document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

updateOpenStatus();
setInterval(updateOpenStatus, 60 * 1000);
