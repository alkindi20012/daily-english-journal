/* Daily English Journal — frontend logic */

(() => {
  const $ = (id) => document.getElementById(id);

  // ---- elements
  const writing       = $("writing");
  const correctBtn    = $("correct-btn");
  const btnSpinner    = correctBtn.querySelector(".btn-spinner");
  const btnLabel      = correctBtn.querySelector(".btn-label");
  const charCount     = $("char-count");
  const results       = $("results");
  const scoreNum      = $("score-num");
  const correctedText = $("corrected-text");
  const mistakesList  = $("mistakes-list");
  const mistakesBlock = $("mistakes-block");
  const generalNote   = $("general-note");
  const generalBlock  = $("general-block");
  const errorBanner   = $("error-banner");
  const dateLine      = $("date-line");
  const promptText    = $("prompt-text");
  const archiveList   = $("archive-list");
  const modal         = $("entry-modal");
  const modalBody     = $("modal-body");

  // ---- nice date in header
  try {
    const today = new Date();
    dateLine.textContent = today.toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  } catch (_) { /* leave the ISO fallback */ }

  // ---- character counter
  const updateCount = () => { charCount.textContent = writing.value.length; };
  writing.addEventListener("input", updateCount);

  // ---- tabs
  const tabs  = document.querySelectorAll(".tab");
  const views = {
    today:   $("view-today"),
    archive: $("view-archive"),
  };
  tabs.forEach(t => {
    t.addEventListener("click", () => {
      tabs.forEach(x => x.classList.toggle("is-active", x === t));
      const view = t.dataset.view;
      Object.entries(views).forEach(([k, el]) => { el.hidden = k !== view; });
      if (view === "archive") loadArchive();
    });
  });

  // ---- main action
  correctBtn.addEventListener("click", async () => {
    const text = writing.value.trim();
    errorBanner.hidden = true;

    if (!text) {
      showError("Please write something first.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          prompt: promptText.textContent.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      renderResult(data);
    } catch (e) {
      showError(e.message || "Network error.");
    } finally {
      setLoading(false);
    }
  });

  // ---- copy corrected text
  $("copy-corrected").addEventListener("click", async () => {
    const text = correctedText.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      flashCopy();
    } catch {
      // fallback for old iOS
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      flashCopy();
    }
  });

  function flashCopy() {
    const b = $("copy-corrected");
    const old = b.textContent;
    b.textContent = "Copied ✓";
    setTimeout(() => { b.textContent = old; }, 1300);
  }

  // ---- helpers
  function setLoading(on) {
    correctBtn.disabled = on;
    btnSpinner.hidden = !on;
    btnLabel.textContent = on ? "Correcting…" : "Correct My Writing";
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.hidden = false;
  }

  function renderResult(d) {
    results.hidden = false;
    scoreNum.textContent = d.score ?? 0;
    correctedText.textContent = d.corrected_text || "";

    // mistakes
    mistakesList.innerHTML = "";
    const mistakes = d.mistakes || [];
    if (mistakes.length === 0) {
      const li = document.createElement("li");
      li.className = "mistake";
      li.innerHTML = `<p class="mistakes-empty" dir="rtl" lang="ar">
        أحسنت! لم نجد أخطاء واضحة في هذا النص. استمر بهذا المستوى.
      </p>`;
      mistakesList.appendChild(li);
    } else {
      mistakes.forEach(m => mistakesList.appendChild(renderMistake(m)));
    }
    mistakesBlock.hidden = false;

    // general note in Arabic
    if (d.general_explanation_ar) {
      generalNote.textContent = d.general_explanation_ar;
      generalBlock.hidden = false;
    } else {
      generalBlock.hidden = true;
    }

    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderMistake(m) {
    const li = document.createElement("li");
    li.className = "mistake";
    const row = document.createElement("div");
    row.className = "mistake-row";

    const w = document.createElement("span");
    w.className = "mistake-wrong";
    w.textContent = m.wrong || "";

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "→";

    const c = document.createElement("span");
    c.className = "mistake-correct";
    c.textContent = m.correct || "";

    row.append(w, arrow, c);

    const expl = document.createElement("p");
    expl.className = "mistake-explain";
    expl.setAttribute("dir", "rtl");
    expl.setAttribute("lang", "ar");
    expl.textContent = m.explanation_ar || "";

    li.append(row, expl);
    return li;
  }

  // ---- archive
  async function loadArchive() {
    archiveList.innerHTML = `<p class="empty">Loading…</p>`;
    try {
      const res = await fetch("/api/entries");
      const items = await res.json();
      if (!items.length) {
        archiveList.innerHTML = `<p class="empty">No entries yet. Write your first one today.</p>`;
        return;
      }
      archiveList.innerHTML = "";
      items.forEach(item => archiveList.appendChild(renderArchiveItem(item)));
    } catch {
      archiveList.innerHTML = `<p class="empty">Failed to load archive.</p>`;
    }
  }

  function renderArchiveItem(item) {
    const el = document.createElement("article");
    el.className = "archive-item";
    el.innerHTML = `
      <div class="archive-top">
        <span class="archive-date">${item.date}</span>
        <span class="archive-score">${item.score}/10</span>
      </div>
      <p class="archive-prompt">${escapeHtml(item.prompt)}</p>
      <p class="archive-preview">${escapeHtml(item.original_text)}</p>
    `;
    el.addEventListener("click", () => openModal(item));
    return el;
  }

  function openModal(item) {
    const mistakesHtml = (item.mistakes || []).map(m => `
      <li class="mistake">
        <div class="mistake-row">
          <span class="mistake-wrong">${escapeHtml(m.wrong || "")}</span>
          <span class="arrow">→</span>
          <span class="mistake-correct">${escapeHtml(m.correct || "")}</span>
        </div>
        <p class="mistake-explain" dir="rtl" lang="ar">${escapeHtml(m.explanation_ar || "")}</p>
      </li>
    `).join("");

    modalBody.innerHTML = `
      <h3>${escapeHtml(item.prompt)}</h3>
      <p class="modal-date">${item.date} &middot; Score ${item.score}/10</p>

      <div class="modal-section">
        <h4>Your writing</h4>
        <div class="modal-text">${escapeHtml(item.original_text)}</div>
      </div>

      <div class="modal-section">
        <h4>Corrected</h4>
        <div class="modal-text">${escapeHtml(item.corrected_text || "")}</div>
      </div>

      ${mistakesHtml ? `
        <div class="modal-section">
          <h4>Mistakes</h4>
          <ul class="mistakes">${mistakesHtml}</ul>
        </div>` : ""}

      ${item.general_explanation_ar ? `
        <div class="modal-section">
          <h4>Teacher's note</h4>
          <p class="general-note" dir="rtl" lang="ar">${escapeHtml(item.general_explanation_ar)}</p>
        </div>` : ""}
    `;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  modal.addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined) {
      modal.hidden = true;
      document.body.style.overflow = "";
    }
  });

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
