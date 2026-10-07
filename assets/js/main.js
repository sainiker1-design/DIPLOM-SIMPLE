(function () {
  "use strict";
  const $ = (s) => document.querySelector(s),
    store = window.NexusStore;
  const money = (n) =>
    new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(n);
  const dateText = (s) =>
    new Date(s + "T12:00:00").toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
    });
  const fullDate = (s) => new Date(s + "T12:00:00").toLocaleDateString("ru-RU");
  const timeText = (n) => String(n).padStart(2, "0") + ":00";
  // Время создания заявки отображается по часовому поясу компьютера.
  function createdText(r) {
    const created = new Date(r.createdAt);
    const date = created.toLocaleDateString("ru-RU");
    const time = created.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return "Оформлено: " + date + " в " + time;
  }

  const pluralHours = (n) =>
    n === 1 ? "1 час" : n < 5 ? n + " часа" : n + " часов";
  const message = (selector, text, error = false) => {
    const e = $(selector);
    e.textContent = text;
    e.classList.toggle("error", error);
  };
  const make = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  let selectedSeat = null,
    pendingCancel = null;
  $("#keep-request").addEventListener("click", () =>
    $("#cancel-dialog").close(),
  );
  $("#confirm-cancel").addEventListener("click", () => {
    try {
      store.cancel(pendingCancel);
      $("#cancel-dialog").close();
      message("#admin-message", "Заявка отменена.");
      renderAdmin();
      refreshBooking();
    } catch (e) {
      $("#cancel-dialog").close();
      message("#admin-message", e.message, true);
    }
  });
  $("#year").textContent = new Date().getFullYear();
  $(".menu-toggle").addEventListener("click", () => {
    const open = $("#navigation").classList.toggle("open");
    $(".menu-toggle").setAttribute("aria-expanded", open);
    $(".menu-toggle").setAttribute(
      "aria-label",
      open ? "Закрыть меню" : "Открыть меню",
    );
  });
  $("#navigation").addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      $("#navigation").classList.remove("open");
      $(".menu-toggle").setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("#navigation").classList.remove("open");
      $(".menu-toggle").setAttribute("aria-expanded", "false");
    }
  });
  for (const d of document.querySelectorAll("dialog")) {
    d.querySelector(".dialog-close").addEventListener("click", () => d.close());
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    });
  }
  // Порядковый номер берём из списка сохранённых заявок.
  // Внутренний код остаётся прежним, поэтому старые записи тоже работают.
  function requestLabel(r, records = store.read().requests) {
    const number = records.findIndex((item) => item.id === r.id) + 1;
    const type = r.kind === "booking" ? "Бронирование" : "Заявка на турнир";
    return type + " №" + number;
  }
  function success(r) {
    $("#success-text").textContent =
      r.kind === "booking"
        ? `${requestLabel(r)} · ${store.zones[r.zone].name}, место ${r.seat}. ${fullDate(r.date)}, ${timeText(r.hour)}–${timeText(r.hour + r.duration)}. Стоимость: ${money(r.price)}.`
        : `${requestLabel(r)} · ${store.tournaments.find((t) => t.id === r.tournament).title}. Команда / игрок: ${r.team}.`;
    $("#success-dialog").showModal();
  }
  $("#success-link").addEventListener("click", () =>
    $("#success-dialog").close(),
  );
  for (const t of store.tournaments) {
    const row = make("article", "tournament-row"),
      img = make("img");
    img.src = "assets/images/" + t.image + ".jpg";
    img.alt = t.alt;
    img.loading = "lazy";
    const info = make("div");
    info.append(
      make("span", "eyebrow", t.game),
      make("h3", "", t.title),
      make("p", "", t.format),
    );
    const dt = make("div", "tournament-date");
    dt.append(
      make("strong", "", dateText(t.date)),
      make("span", "", timeText(t.hour) + " / старт"),
    );
    const b = make("button", "button button-secondary", "Участвовать");
    b.type = "button";
    b.addEventListener("click", () => {
      const form = $("#tournament-form");
      form.reset();
      form.elements.tournament.value = t.id;
      $("#tournament-dialog-title").textContent = t.title;
      $("#tournament-description").textContent =
        `${dateText(t.date)}, ${timeText(t.hour)} · ${t.format}`;
      message("#tournament-message", "");
      $("#tournament-dialog").showModal();
    });
    row.append(img, info, dt, b);
    $("#tournament-list").append(row);
  }
  $("#tournament-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      t = store.tournaments.find((t) => t.id === f.elements.tournament.value);
    try {
      const r = store.add({
        kind: "tournament",
        tournament: t.id,
        date: t.date,
        name: f.elements.name.value.trim(),
        team: f.elements.team.value.trim(),
        email: f.elements.email.value.trim().toLowerCase(),
      });
      $("#tournament-dialog").close();
      success(r);
    } catch (err) {
      message("#tournament-message", err.message, true);
    }
  });
  const today = store.localDate(new Date());
  $("#booking-date").min = today;
  $("#booking-date").value = today;
  const max = new Date();
  max.setDate(max.getDate() + 90);
  $("#booking-date").max = store.localDate(max);
  for (let h = 10; h <= 23; h++) {
    const o = make("option", "", timeText(h));
    o.value = h;
    $("#booking-time").append(o);
  }
  const now = new Date();
  if (now.getHours() < 22) {
    $("#booking-time").value = Math.max(10, now.getHours() + 1);
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    $("#booking-date").value = store.localDate(tomorrow);
    $("#booking-time").value = 10;
  }
  function current() {
    return {
      zone: $("#zone").value,
      date: $("#booking-date").value,
      hour: Number($("#booking-time").value),
      duration: Number($("#duration").value),
    };
  }
  // Обновляем свободные места и стоимость после выбора даты или зоны.
  function refreshBooking() {
    const c = current(),
      z = store.zones[c.zone];
    let records = [];
    try {
      records = store.read().requests;
    } catch (e) {}
    const invalidTime =
      !c.date ||
      new Date(`${c.date}T${String(c.hour).padStart(2, "0")}:00:00`) <=
        new Date() ||
      c.hour + c.duration > 24;
    $("#seat-map").replaceChildren();
    for (const seat of z.seats) {
      const busy = records.some((r) =>
        store.overlap(r, { ...c, seat, kind: "booking", status: "active" }),
      );
      if (selectedSeat === seat && (busy || invalidTime)) selectedSeat = null;
      const b = make("button", "seat-button");
      b.type = "button";
      b.disabled = busy || invalidTime || !store.available;
      b.setAttribute("aria-pressed", selectedSeat === seat ? "true" : "false");
      b.setAttribute(
        "aria-label",
        `${c.zone === "console" ? "Зона" : "Место"} ${seat}${busy ? ", занято" : ""}`,
      );
      const icon = make("span", "", c.zone === "console" ? "⌘" : "▱");
      icon.setAttribute("aria-hidden", "true");
      b.append(icon, make("span", "", seat));
      b.addEventListener("click", () => {
        selectedSeat = seat;
        refreshBooking();
        $("#seat-map").querySelector(`[aria-pressed="true"]`).focus();
      });
      $("#seat-map").append(b);
    }
    $("#seat-help").textContent = invalidTime
      ? "Выбери будущее время. Сессия должна закончиться не позднее 00:00."
      : c.zone === "console"
        ? "Одна зона рассчитана на компанию до 4 гостей. Цена указана за всю зону."
        : "Выбери свободное место на схеме. Занятость учитывает заявки в этом браузере.";
    $("#summary-zone").textContent = z.name;
    $("#summary-seat").textContent = selectedSeat || "Не выбрано";
    $("#summary-date").textContent = c.date ? dateText(c.date) : "—";
    $("#summary-time").textContent =
      timeText(c.hour) + " — " + timeText(c.hour + c.duration);
    $("#summary-duration").textContent = pluralHours(c.duration);
    $("#summary-price").textContent = money(z.rate * c.duration);
  }
  for (const s of ["#zone", "#booking-date", "#booking-time", "#duration"])
    $(s).addEventListener("change", () => {
      selectedSeat = null;
      message("#booking-message", "");
      refreshBooking();
    });
  for (const a of document.querySelectorAll("[data-zone]"))
    a.addEventListener("click", () => {
      $("#zone").value = a.dataset.zone;
      selectedSeat = null;
      refreshBooking();
    });
  $("#booking-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = current(),
      f = e.currentTarget;
    if (!selectedSeat) {
      message("#booking-message", "Выбери свободное место на схеме.", true);
      $("#seat-map").scrollIntoView({ block: "center" });
      return;
    }
    try {
      const r = store.add({
        ...c,
        kind: "booking",
        seat: selectedSeat,
        name: f.elements.name.value.trim(),
        email: f.elements.email.value.trim().toLowerCase(),
        price: store.zones[c.zone].rate * c.duration,
      });
      selectedSeat = null;
      f.elements.consent.checked = false;
      message("#booking-message", "");
      refreshBooking();
      success(r);
    } catch (err) {
      message("#booking-message", err.message, true);
      refreshBooking();
    }
  });
  // Выводим сохранённые заявки в разделе «Мои заявки».
  function renderAdmin() {
    let records;
    try {
      records = store.read().requests;
    } catch (e) {
      message("#admin-message", e.message, true);
      records = [];
    }
    const active = records.filter((r) => r.status === "active");
    $("#admin-stats").replaceChildren();
    for (const [value, label] of [
      [
        active.filter((r) => r.kind === "booking").length,
        "Активных бронирований",
      ],
      [
        active.filter((r) => r.kind === "tournament").length,
        "Регистраций на турниры",
      ],
      [
        records.filter((r) => r.status === "cancelled").length,
        "Отменённых заявок",
      ],
    ]) {
      const div = make("div");
      div.append(make("strong", "", value), make("span", "", label));
      $("#admin-stats").append(div);
    }
    const search = $("#admin-search").value.trim().toLowerCase(),
      filter = $("#admin-filter").value;
    const filtered = records
      .filter(
        (r) =>
          (filter === "all" ||
            (filter === "cancelled"
              ? r.status === "cancelled"
              : r.kind === filter && r.status === "active")) &&
          [requestLabel(r, records), r.id, r.name, r.email, r.team || ""]
            .join(" ")
            .toLowerCase()
            .includes(search),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("#requests-list").replaceChildren();
    if (!filtered.length) {
      const empty = make("div", "empty-state");
      empty.append(
        make(
          "h3",
          "",
          records.length ? "Ничего не найдено" : "Первая игра — впереди",
        ),
        make(
          "p",
          "",
          records.length
            ? "Измени поиск или тип заявки."
            : "Забронируй место или запишись на турнир — заявка появится здесь.",
        ),
      );
      const a = make("a", "button", "Выбрать место");
      a.href = "#booking";
      empty.append(a);
      $("#requests-list").append(empty);
    }
    for (const r of filtered) {
      const card = make(
          "article",
          "request-card" + (r.status === "cancelled" ? " cancelled" : ""),
        ),
        content = make("div");
      content.append(
        make(
          "small",
          "",
          requestLabel(r, records),
        ),
        make(
          "h3",
          "",
          r.kind === "booking"
            ? `${store.zones[r.zone].name} · ${r.seat}`
            : store.tournaments.find((t) => t.id === r.tournament).title,
        ),
        make(
          "p",
          "",
          r.kind === "booking"
            ? `Дата игры: ${fullDate(r.date)} · Время: ${timeText(r.hour)}–${timeText(r.hour + r.duration)} · ${money(r.price)}`
            : `Дата турнира: ${fullDate(r.date)} · Команда / игрок: ${r.team}`,
        ),
        make("p", "", createdText(r)),
        make("p", "", r.name + " · " + r.email),
        make(
          "span",
          "status-label",
          r.status === "active" ? "● АКТИВНА" : "○ ОТМЕНЕНА",
        ),
      );
      card.append(content);
      if (r.status === "active") {
        const b = make("button", "button button-secondary", "Отменить заявку");
        b.type = "button";
        b.addEventListener("click", () => {
          pendingCancel = r.id;
          $("#cancel-description").textContent =
            requestLabel(r, records) +
            " останется в истории со статусом «Отменена». После отмены можно создать новую заявку.";
          $("#cancel-dialog").showModal();
        });
        card.append(b);
      }
      $("#requests-list").append(card);
    }
  }
  // Показываем главную страницу или список заявок.
  function route() {
    const admin = location.hash === "#admin";
    $("#public-view").hidden = admin;
    $("#admin-view").hidden = !admin;
    if (admin) {
      renderAdmin();
      window.scrollTo(0, 0);
    } else if (location.hash) {
      requestAnimationFrame(() => {
        const target = document.getElementById(location.hash.slice(1));
        if (target) target.scrollIntoView();
      });
    }
    document.title = admin
      ? "Мои заявки — NEXUS ARENA"
      : "NEXUS ARENA — твоя игра начинается здесь";
  }
  window.addEventListener("hashchange", route);
  $("#admin-search").addEventListener("input", renderAdmin);
  $("#admin-filter").addEventListener("change", renderAdmin);
  window.addEventListener("storage", () => {
    refreshBooking();
    if (location.hash === "#admin") renderAdmin();
  });
  if (!store.available) {
    $("#storage-banner").hidden = false;
    $("#storage-banner").textContent = store.startupError;
    for (const b of document.querySelectorAll('button[type="submit"]'))
      b.disabled = true;
  }
  refreshBooking();
  route();
})();
