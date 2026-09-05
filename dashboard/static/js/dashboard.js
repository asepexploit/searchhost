(function () {
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  }

  function fmtSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return null;
    if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(0) + " KB/s";
    return (bytesPerSec / 1024 / 1024).toFixed(1) + " MB/s";
  }

  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("id-ID", { hour12: false });
  }

  function addRow(item) {
    const tbody = document.getElementById("downloads-body");
    if (!tbody) return;

    const emptyRow = document.getElementById("empty-row");
    if (emptyRow) emptyRow.remove();

    const tr = document.createElement("tr");
    tr.className = "row-new";
    tr.dataset.downloadId = item.id;
    tr.innerHTML = `
      <td data-iso="${item.downloaded_at}">${fmtTime(item.downloaded_at)}</td>
      <td><div class="file-cell"><span class="file-icon"><i class="bi bi-file-earmark-text"></i></span>${item.filename}</div></td>
      <td>${fmtSize(item.size)}</td>
      <td>${item.chat_title || "-"}${item.chat_username ? ` <small class="text-muted">@${item.chat_username}</small>` : ""}<br><small class="text-muted">${item.sender_name || ""}</small></td>
      <td><span class="badge account-badge">${item.account}</span></td>
      <td><code class="folder-path" title="${item.path}">${item.path_display || item.path}</code></td>
      <td class="text-center">
        <button type="button" class="btn btn-sm auto-parsed-badge btn-outline-secondary" data-toggle-auto-parsed="${item.id}" title="Klik buat toggle status sudah/belum diproses auto-extract">
          Belum
        </button>
      </td>
      <td class="text-end">
        <button type="button" class="btn btn-sm btn-outline-danger btn-delete-download" data-delete-id="${item.id}" title="Hapus file & catatannya">
          <i class="bi bi-trash3"></i>
        </button>
      </td>
    `;
    tbody.prepend(tr);
    setTimeout(() => tr.classList.remove("row-new"), 1600);
  }

  function bumpStat(id, delta = 1) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = Math.max(0, parseInt(el.textContent || "0", 10) + delta).toString();
  }

  function updateAccountCard(item, delta = 1) {
    const card = document.querySelector(`[data-account-card="${item.account}"]`);
    if (!card) return;

    const totalEl = card.querySelector('[data-field="total"]');
    if (totalEl) totalEl.textContent = Math.max(0, parseInt(totalEl.textContent || "0", 10) + delta).toString();

    if (delta > 0) {
      const lastEl = card.querySelector('[data-field="last_at"]');
      if (lastEl) lastEl.textContent = fmtTime(item.downloaded_at);
    }

    card.classList.add("row-new");
    setTimeout(() => card.classList.remove("row-new"), 1600);
  }

  function removeDownloadRow(downloadId) {
    document.querySelectorAll(`tr[data-download-id="${downloadId}"]`).forEach((tr) => tr.remove());
    const tbody = document.getElementById("downloads-body");
    if (tbody && !tbody.querySelector("tr")) {
      const colCount = tbody.closest("table")?.querySelectorAll("thead th").length || 7;
      tbody.innerHTML = `<tr id="empty-row"><td colspan="${colCount}"><div class="empty-state"><span class="empty-state-icon"><i class="bi bi-inbox"></i></span><p>Belum ada file yang terdownload.</p></div></td></tr>`;
    }
  }

  function deleteDownload(downloadId, btn) {
    if (!confirm("Hapus file ini dari disk dan catatannya di dashboard?")) return;
    if (btn) btn.disabled = true;
    // Baris & statistik dihapus lewat event "delete" yang di-broadcast balik lewat
    // WebSocket (konsisten dengan cara baris baru muncul), bukan di sini langsung.
    fetch(`/api/downloads/${downloadId}`, { method: "DELETE" })
      .then((r) => r.json())
      .then((res) => {
        if (!res.ok) {
          alert(res.error || "Gagal menghapus file.");
          if (btn) btn.disabled = false;
        }
      })
      .catch(() => {
        alert("Gagal menghapus file (koneksi bermasalah).");
        if (btn) btn.disabled = false;
      });
  }

  function deleteStorageFolder(folderName, btn) {
    if (!confirm(`Hapus folder "${folderName}" beserta SEMUA file di dalamnya? Ini gak bisa dibatalkan.`)) return;
    if (btn) btn.disabled = true;
    fetch(`/api/storage/${encodeURIComponent(folderName)}`, { method: "DELETE" })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          location.reload(); // re-scan folder dari server, paling gampang & pasti akurat
        } else {
          alert(res.error || "Gagal menghapus folder.");
          if (btn) btn.disabled = false;
        }
      })
      .catch(() => {
        alert("Gagal menghapus folder (koneksi bermasalah).");
        if (btn) btn.disabled = false;
      });
  }

  function setupDeleteFolderButtons() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".btn-delete-folder");
      if (!btn) return;
      deleteStorageFolder(btn.dataset.deleteFolder, btn);
    });
  }

  // ---------- Progress download aktif (file yang lagi didownload, semua halaman) ----------

  const activeDownloads = new Map();
  let queuedCount = 0;

  function renderActiveDownloads() {
    const card = document.getElementById("active-downloads-card");
    const list = document.getElementById("active-downloads-list");
    const countEl = document.getElementById("active-downloads-count");
    const queuedEl = document.getElementById("queued-count");

    if (queuedEl) {
      queuedEl.hidden = queuedCount === 0;
      queuedEl.textContent = `${queuedCount} antre`;
    }

    if (!card || !list) return;

    if (activeDownloads.size === 0 && queuedCount === 0) {
      card.hidden = true;
      list.innerHTML = "";
      return;
    }

    card.hidden = false;
    if (countEl) countEl.textContent = activeDownloads.size.toString();
    list.innerHTML = Array.from(activeDownloads.values())
      .map(
        (p) => `
      <div class="active-download-item" data-progress-id="${p.progress_id}">
        <div class="d-flex justify-content-between small mb-1">
          <span><i class="bi bi-file-earmark-arrow-down me-1 text-primary"></i>${p.filename}</span>
          <span class="text-muted">
            ${p.percent}%${p.total ? " &middot; " + fmtSize(p.total) : ""}${fmtSpeed(p._speed) ? " &middot; " + fmtSpeed(p._speed) : ""}
          </span>
        </div>
        <div class="progress" style="height:6px;">
          <div class="progress-bar" role="progressbar" style="width:${p.percent}%"></div>
        </div>
        <div class="text-muted small mt-1">${p.chat_title || "-"} &middot; <span class="badge account-badge">${p.account}</span></div>
      </div>`
      )
      .join("");
  }

  function handleProgress(item) {
    // Kecepatan dihitung di sini (murni dari data progress yang SUDAH ada -- current
    // bytes antar-tick -- bukan probe jaringan baru), jadi gak nambah beban apa pun.
    // Di-smooth (exponential moving average) biar gak lompat-lompat antar-tick.
    const prev = activeDownloads.get(item.progress_id);
    const now = performance.now();
    if (prev && typeof prev._ts === "number") {
      const deltaBytes = item.current - prev.current;
      const deltaSec = (now - prev._ts) / 1000;
      if (deltaBytes > 0 && deltaSec > 0.05) {
        const instantRate = deltaBytes / deltaSec;
        const prevSmoothed = prev._speed || instantRate;
        item._speed = prevSmoothed * 0.7 + instantRate * 0.3;
      } else {
        item._speed = prev._speed;
      }
    }
    item._ts = now;
    activeDownloads.set(item.progress_id, item);
    renderActiveDownloads();
  }

  function handleQueueStatus(item) {
    queuedCount = item.queued || 0;
    renderActiveDownloads();
  }

  function fetchQueueStatus() {
    fetch("/api/queue-status")
      .then((r) => r.json())
      .then((data) => handleQueueStatus(data))
      .catch(() => {});
  }

  function handleProgressError(item) {
    activeDownloads.delete(item.progress_id);
    renderActiveDownloads();
  }

  function handleComplete(item) {
    activeDownloads.delete(item.progress_id);
    renderActiveDownloads();

    // window.__tgLiveAppend, kalau didefinisikan halaman (mis. Downloads dengan filter aktif),
    // menentukan apakah baris baru boleh ditambahkan langsung ke tabel yang sedang tampil.
    if (window.__tgLiveAppend !== false) {
      addRow(item);
    }
    bumpStat("stat-today");
    bumpStat("stat-total");
    updateAccountCard(item);
  }

  // ---------- Aktivitas gofile (retry/rotasi proxy/listing, semua halaman) ----------

  const GOFILE_LOG_MAX = 100;
  const gofileLog = [];

  function renderGofileLog() {
    const card = document.getElementById("gofile-log-card");
    const list = document.getElementById("gofile-log-list");
    if (!card || !list) return;

    if (gofileLog.length === 0) {
      card.hidden = true;
      list.innerHTML = "";
      return;
    }

    card.hidden = false;
    list.innerHTML = gofileLog
      .map(
        (l) => `
      <div class="gofile-log-line gofile-log-${l.level || "info"}">
        <span class="gofile-log-time">${fmtTime(l.ts)}</span>
        <span class="badge account-badge">${l.account}</span>
        ${l.message}
      </div>`
      )
      .join("");
  }

  function handleGofileLog(item) {
    gofileLog.unshift(item);
    if (gofileLog.length > GOFILE_LOG_MAX) gofileLog.length = GOFILE_LOG_MAX;
    renderGofileLog();
  }

  // ---------- Pesan masuk (live, halaman /messages) ----------

  const MESSAGES_MAX = 200;
  const STATUS_LABEL = {
    file: '<span class="badge text-bg-primary">File lampiran</span>',
    gofile_ok: '<span class="badge text-bg-success">Gofile diproses</span>',
    gofile_disabled: '<span class="badge text-bg-warning">Gofile OFF di Settings</span>',
    gofile_blocked: '<span class="badge text-bg-warning">Gofile: channel diblokir</span>',
    bot_ok: '<span class="badge text-bg-success">Bot deep-link diproses</span>',
    bot_disabled: '<span class="badge text-bg-warning">Bot fetch OFF di Settings</span>',
    bot_blocked: '<span class="badge text-bg-warning">Bot fetch: channel diblokir</span>',
    plain: '<span class="badge text-bg-secondary">Pesan biasa</span>',
  };

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function messageRowHtml(item) {
    const statusBadge = STATUS_LABEL[item.status] || `<span class="badge text-bg-secondary">${escapeHtml(item.status)}</span>`;
    return `
      <tr>
        <td data-iso="${item.ts}">${fmtTime(item.ts)}</td>
        <td><span class="badge account-badge">${escapeHtml(item.account)}</span></td>
        <td>${escapeHtml(item.chat_title) || "-"}${item.chat_username ? ` <small class="text-muted">@${escapeHtml(item.chat_username)}</small>` : ""}</td>
        <td>${escapeHtml(item.sender_name) || "-"}</td>
        <td class="small">${item.text_preview ? escapeHtml(item.text_preview) : '<span class="text-muted">(tanpa teks)</span>'}</td>
        <td>${statusBadge}<div class="text-muted small mt-1">${escapeHtml(item.note)}</div></td>
      </tr>`;
  }

  function handleMessageSeen(item) {
    const tbody = document.getElementById("messages-body");
    if (!tbody) return; // halaman /messages lagi gak dibuka, gak perlu diapa-apain

    const emptyRow = document.getElementById("messages-empty-row");
    if (emptyRow) emptyRow.remove();

    tbody.insertAdjacentHTML("afterbegin", messageRowHtml(item));
    while (tbody.children.length > MESSAGES_MAX) {
      tbody.removeChild(tbody.lastElementChild);
    }
  }

  function setupGofileLogClear() {
    document.getElementById("gofile-log-clear")?.addEventListener("click", () => {
      gofileLog.length = 0;
      renderGofileLog();
    });
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    const statusEl = document.getElementById("live-status");

    ws.onopen = () => statusEl && statusEl.classList.add("is-live");
    ws.onclose = () => {
      statusEl && statusEl.classList.remove("is-live");
      setTimeout(connect, 2000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      const item = JSON.parse(ev.data);

      if (item.type === "progress") {
        handleProgress(item);
        return;
      }
      if (item.type === "progress_error") {
        handleProgressError(item);
        return;
      }
      if (item.type === "backfill_progress") {
        upsertBackfillJob(item.job);
        return;
      }
      if (item.type === "parser_progress") {
        // Cuma didefinisikan di halaman /parser (lihat parser.html) -- aman di halaman
        // lain karena dipanggil pakai optional chaining.
        window.__handleParserProgress?.(item.job);
        return;
      }
      if (item.type === "gofile_log") {
        handleGofileLog(item);
        return;
      }
      if (item.type === "message_seen") {
        handleMessageSeen(item);
        return;
      }
      if (item.type === "queue_status") {
        handleQueueStatus(item);
        return;
      }
      if (item.type === "auto_parser_batch") {
        handleAutoParserBatch(item);
        return;
      }
      if (item.type === "delete") {
        removeDownloadRow(item.id);
        bumpStat("stat-total", -1);
        if (item.is_today) bumpStat("stat-today", -1);
        if (item.account) updateAccountCard({ account: item.account, downloaded_at: null }, -1);
        return;
      }

      handleComplete(item);
    };
  }

  function statusBadge(status) {
    if (status === "queued" || status === "running") return '<span class="badge text-bg-warning">Berjalan...</span>';
    if (status === "done") return '<span class="badge text-bg-success">Selesai</span>';
    return '<span class="badge text-bg-danger">Gagal</span>';
  }

  function progressCell(job) {
    if (job.status === "queued" || job.status === "running") {
      const pct = job.percent || 0;
      const chatLine = job.current_chat ? `<br>Scan: ${job.current_chat}` : "";
      return `
        <div class="progress" style="height:6px; min-width:110px;">
          <div class="progress-bar" role="progressbar" style="width:${pct}%"></div>
        </div>
        <small class="text-muted">${pct}% &middot; ${job.scanned || 0} pesan, ${job.downloaded || 0} file${chatLine}</small>`;
    }
    if (job.status === "done") return '<span class="text-success small">100%</span>';
    return '<span class="text-muted small">-</span>';
  }

  function resultText(job) {
    if (job.status === "done") return `${job.downloaded} file dari ${job.scanned} pesan discan`;
    if (job.status === "error") return `<span class="text-danger">${job.error || "Error tidak diketahui"}</span>`;
    return '<span class="text-muted">-</span>';
  }

  function channelCell(job) {
    if (job.channel) return `@${job.channel}`;
    return '<span class="text-primary"><i class="bi bi-globe2 me-1"></i>Semua channel/grup</span>';
  }

  function jobRowHtml(job) {
    return `
      <tr data-job-id="${job.id}">
        <td>${channelCell(job)}</td>
        <td><span class="badge account-badge">${job.account}</span></td>
        <td>${job.date_from} &rarr; ${job.date_to}</td>
        <td data-field="status">${statusBadge(job.status)}</td>
        <td data-field="progress">${progressCell(job)}</td>
        <td data-field="result">${resultText(job)}</td>
      </tr>`;
  }

  function renderBackfillJobs(jobs) {
    const tbody = document.getElementById("backfill-jobs-body");
    if (!tbody) return false;

    if (jobs.length === 0) {
      tbody.innerHTML = '<tr id="backfill-empty-row"><td colspan="6"><div class="empty-state"><span class="empty-state-icon"><i class="bi bi-cloud-arrow-down"></i></span><p>Belum ada backfill yang dijalankan.</p></div></td></tr>';
      return false;
    }

    tbody.innerHTML = jobs.map(jobRowHtml).join("");

    return jobs.some((j) => j.status === "queued" || j.status === "running");
  }

  let backfillJobsCache = [];

  function upsertBackfillJob(job) {
    if (!document.getElementById("backfill-jobs-body")) return;
    const idx = backfillJobsCache.findIndex((j) => j.id === job.id);
    if (idx >= 0) {
      backfillJobsCache[idx] = job;
    } else {
      backfillJobsCache.unshift(job);
    }
    renderBackfillJobs(backfillJobsCache);
  }

  function pollBackfillJobs() {
    fetch("/api/backfill-jobs")
      .then((r) => r.json())
      .then((jobs) => {
        backfillJobsCache = jobs;
        const stillRunning = renderBackfillJobs(jobs);
        if (stillRunning) {
          setTimeout(pollBackfillJobs, 2000);
        }
      })
      .catch(() => setTimeout(pollBackfillJobs, 4000));
  }

  function setupThemeToggle() {
    const root = document.documentElement;
    const toggle = document.getElementById("theme-toggle");
    let saved = null;
    try {
      saved = localStorage.getItem("tgmonitor-theme");
    } catch (e) {
      /* localStorage tidak tersedia, lanjut pakai default */
    }
    if (saved) root.setAttribute("data-bs-theme", saved);

    toggle?.addEventListener("click", () => {
      const next = root.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-bs-theme", next);
      try {
        localStorage.setItem("tgmonitor-theme", next);
      } catch (e) {
        /* abaikan kalau tidak bisa disimpan */
      }
    });
  }

  function setupDeleteButtons() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".btn-delete-download");
      if (!btn) return;
      deleteDownload(btn.dataset.deleteId, btn);
    });
  }

  function setAutoParsedBadge(btn, autoParsed) {
    btn.textContent = autoParsed ? "Sudah" : "Belum";
    btn.classList.toggle("btn-success", autoParsed);
    btn.classList.toggle("btn-outline-secondary", !autoParsed);
  }

  function setupAutoParsedToggle() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-toggle-auto-parsed]");
      if (!btn) return;
      const id = btn.dataset.toggleAutoParsed;
      btn.disabled = true;
      fetch(`/api/downloads/${id}/toggle-auto-parsed`, { method: "POST" })
        .then((r) => r.json())
        .then((res) => {
          if (res.ok) setAutoParsedBadge(btn, res.auto_parsed);
          btn.disabled = false;
        })
        .catch(() => {
          btn.disabled = false;
        });
    });
  }

  function handleAutoParserBatch(item) {
    // Batch auto-extract selesai di server -- badge file yang lagi kelihatan di tabel
    // ini (kalau ada) ikut di-update jadi "Sudah" tanpa perlu refresh.
    for (const id of item.ids || []) {
      const row = document.querySelector(`tr[data-download-id="${id}"]`);
      const btn = row?.querySelector("[data-toggle-auto-parsed]");
      if (btn) setAutoParsedBadge(btn, true);
    }
  }

  function setupLiveClock() {
    const el = document.getElementById("live-clock-text");
    if (!el) return;
    const fmt = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const tick = () => {
      el.textContent = `${fmt.format(new Date())} WIB`;
    };
    tick();
    setInterval(tick, 30000);
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupThemeToggle();
    setupDeleteButtons();
    setupAutoParsedToggle();
    setupDeleteFolderButtons();
    setupLiveClock();
    setupGofileLogClear();
    fetchQueueStatus();
    connect();
    if (window.__tgBackfillPoll) {
      pollBackfillJobs();
    }
  });
})();
