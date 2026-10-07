/* Общее хранилище. Обычный script работает без сервера и ES-модулей. */
(function () {
  "use strict";
  const KEY = "nexus-arena-simple-v1";
  const zones = {
    standard: {
      name: "Standard",
      rate: 150,
      seats: ["S01", "S02", "S03", "S04", "S05", "S06"],
    },
    pro: { name: "Pro Zone", rate: 250, seats: ["P01", "P02", "P03", "P04"] },
    console: { name: "Console", rate: 350, seats: ["C01", "C02"] },
  };
  const tournamentDefinitions = [
    {
      id: "cs2",
      title: "NEXUS OPEN / CS2",
      game: "COUNTER-STRIKE 2",
      format: "5 × 5 · Single elimination",
      image: "arena",
      alt: "Игрок за компьютером на киберспортивном турнире",
      offset: 5,
      hour: 16,
    },
    {
      id: "dota2",
      title: "Ancient Clash",
      game: "DOTA 2",
      format: "5 × 5 · Captains mode",
      image: "pc",
      alt: "Мощный игровой компьютер с подсветкой",
      offset: 12,
      hour: 15,
    },
    {
      id: "fc",
      title: "Weekend Kickoff",
      game: "EA SPORTS FC",
      format: "1 × 1 · Группы + плей-офф",
      image: "setup",
      alt: "Игровой контроллер для консольного турнира",
      offset: 19,
      hour: 17,
    },
  ];
  const localDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const validDate = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    localDate(new Date(s + "T12:00:00")) === s;
  const safeText = (s, min, max) =>
    typeof s === "string" &&
    s.trim().length >= min &&
    s.length <= max &&
    !/[\u0000-\u001f]/.test(s);
  const emailValid = (s) =>
    typeof s === "string" &&
    s.length <= 100 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const overlap = (a, b) =>
    a.kind === "booking" &&
    b.kind === "booking" &&
    a.status === "active" &&
    b.status === "active" &&
    a.date === b.date &&
    a.seat === b.seat &&
    a.hour < b.hour + b.duration &&
    b.hour < a.hour + a.duration;
  const duplicateTournament = (a, b) =>
    a.kind === "tournament" &&
    b.kind === "tournament" &&
    a.status === "active" &&
    b.status === "active" &&
    a.tournament === b.tournament &&
    a.date === b.date &&
    a.email.toLowerCase() === b.email.toLowerCase();
  function validateRecord(r) {
    if (
      !r ||
      typeof r !== "object" ||
      !/^NX-[A-Z0-9-]{6,50}$/.test(r.id) ||
      !["booking", "tournament"].includes(r.kind) ||
      !["active", "cancelled"].includes(r.status) ||
      !safeText(r.name, 2, 50) ||
      !emailValid(r.email) ||
      !validDate(r.date) ||
      !Number.isFinite(Date.parse(r.createdAt))
    )
      throw new Error("В сохранённых данных есть некорректная заявка.");
    if (r.kind === "booking") {
      if (
        !zones[r.zone] ||
        !zones[r.zone].seats.includes(r.seat) ||
        !Number.isInteger(r.hour) ||
        r.hour < 10 ||
        r.hour > 23 ||
        !Number.isInteger(r.duration) ||
        r.duration < 1 ||
        r.duration > 5 ||
        r.hour + r.duration > 24 ||
        r.price !== zones[r.zone].rate * r.duration
      )
        throw new Error(
          "В заявке указано недопустимое место, время или стоимость.",
        );
    } else if (
      !tournamentDefinitions.some((t) => t.id === r.tournament) ||
      !safeText(r.team, 2, 50)
    )
      throw new Error("Некорректная регистрация на турнир.");
    const base = {
      id: r.id,
      kind: r.kind,
      status: r.status,
      name: r.name.trim(),
      email: r.email.trim(),
      date: r.date,
      createdAt: r.createdAt,
    };
    return r.kind === "booking"
      ? {
          ...base,
          zone: r.zone,
          seat: r.seat,
          hour: r.hour,
          duration: r.duration,
          price: r.price,
        }
      : { ...base, tournament: r.tournament, team: r.team.trim() };
  }
  function parseDatabase(raw) {
    if (
      !raw ||
      raw.version !== 1 ||
      !Array.isArray(raw.requests) ||
      raw.requests.length > 5000
    )
      throw new Error(
        "Неизвестный формат сохранённых данных.",
      );
    const requests = raw.requests.map(validateRecord);
    if (new Set(requests.map((r) => r.id)).size !== requests.length)
      throw new Error("В сохранённых данных повторяются номера заявок.");
    for (let i = 0; i < requests.length; i++)
      for (let j = i + 1; j < requests.length; j++)
        if (
          overlap(requests[i], requests[j]) ||
          duplicateTournament(requests[i], requests[j])
        )
          throw new Error(
            "В сохранённых данных есть пересекающиеся бронирования или повторные регистрации.",
          );
    return { version: 1, requests };
  }
  let available = true,
    startupError = "";
  try {
    const probe = KEY + "-probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    if (localStorage.getItem(KEY))
      parseDatabase(JSON.parse(localStorage.getItem(KEY)));
  } catch (e) {
    available = false;
    startupError =
      "Хранилище браузера недоступно или содержит повреждённые данные. Бронирование отключено. Разреши локальное хранение или открой проект в другом обычном профиле браузера. Данные не перезаписаны.";
  }
  function read() {
    if (!available) throw new Error(startupError);
    try {
      const raw = localStorage.getItem(KEY);
      return raw
        ? parseDatabase(JSON.parse(raw))
        : { version: 1, requests: [] };
    } catch (e) {
      throw new Error(
        "Не удалось прочитать сохранённые заявки. Данные не изменены.",
      );
    }
  }
  function write(db) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      throw new Error(
        "Не удалось сохранить заявку: хранилище недоступно или заполнено. Попробуй другой браузер.",
      );
    }
  }
  function id() {
    return (
      "NX-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      Math.random().toString(36).slice(2, 8).toUpperCase()
    );
  }
  function add(data) {
    const r = validateRecord({
      ...data,
      id: id(),
      status: "active",
      createdAt: new Date().toISOString(),
    });
    const db = read();
    if (db.requests.length >= 5000)
      throw new Error("Достигнут предел 5000 заявок.");
    if (
      r.kind === "booking" &&
      new Date(`${r.date}T${String(r.hour).padStart(2, "0")}:00:00`) <=
        new Date()
    )
      throw new Error("Это время уже прошло. Выбери будущую сессию.");
    if (db.requests.some((x) => overlap(x, r)))
      throw new Error(
        "Место уже занято на выбранное время. Выбери другое место или время.",
      );
    if (db.requests.some((x) => duplicateTournament(x, r)))
      throw new Error(
        "С этим email уже есть активная заявка на данный турнир.",
      );
    db.requests.push(r);
    write(db);
    return r;
  }
  function cancel(id) {
    const db = read();
    const r = db.requests.find((x) => x.id === id);
    if (!r) throw new Error("Заявка не найдена.");
    r.status = "cancelled";
    write(db);
  }
  const tournaments = tournamentDefinitions.map((t) => {
    const d = new Date();
    let days = (6 - d.getDay() + 7) % 7;
    if (days === 0 && d.getHours() >= 15) days = 7;
    d.setDate(d.getDate() + days + t.offset - 5);
    return { ...t, date: localDate(d) };
  });
  window.NexusStore = {
    zones,
    tournaments,
    localDate,
    read,
    add,
    cancel,
    available,
    startupError,
    overlap,
    validateRecord,
  };
})();
