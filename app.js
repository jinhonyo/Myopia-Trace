/**
 * 近視管理系統 - 主邏輯與互動控制模組
 */

let allCustomersCache = [];
let currentSelectedCustomer = null;
let currentFilterType = "all";

document.addEventListener("DOMContentLoaded", async () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then(() => {
      console.log("Service Worker 註冊成功");
    }).catch(err => {
      console.error("Service Worker 註冊失敗:", err);
    });
  }

  await initDB();
  bindUiEvents();
  await loadAndRenderCustomers();
  updateNetworkStatusBadge();
});

function bindUiEvents() {
  const searchInput = document.getElementById("input-search");
  const clearBtn = document.getElementById("btn-clear-search");
  
  searchInput.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    clearBtn.style.display = val ? "block" : "none";
    filterAndRenderCustomers();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.style.display = "none";
    filterAndRenderCustomers();
  });

  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      e.target.classList.add("active");
      currentFilterType = e.target.dataset.filter;
      filterAndRenderCustomers();
    });
  });

  document.getElementById("btn-back-to-list").addEventListener("click", () => {
    document.getElementById("view-customer-detail").classList.remove("active");
    document.getElementById("view-customer-list").classList.add("active");
    currentSelectedCustomer = null;
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
      
      e.currentTarget.classList.add("active");
      const tabId = e.currentTarget.dataset.tab;
      document.getElementById(tabId).classList.add("active");
    });
  });

  document.getElementById("btn-fab-add").addEventListener("click", () => {
    if (!currentSelectedCustomer) {
      alert("請先從列表中點擊選擇一位顧客，再新增回診紀錄！");
      return;
    }
    openAddVisitModal();
  });

  document.getElementById("btn-close-modal").addEventListener("click", () => {
    document.getElementById("modal-add-visit").classList.remove("active");
  });

  document.querySelectorAll(".tag-chip").forEach(tag => {
    tag.addEventListener("click", (e) => {
      const noteInput = document.getElementById("visit-input-notes");
      const tagText = e.target.dataset.tag;
      noteInput.value = noteInput.value ? `${noteInput.value}，${tagText}` : tagText;
    });
  });

  document.getElementById("form-add-visit").addEventListener("submit", handleAddVisitSubmit);

  document.getElementById("btn-sync").addEventListener("click", syncFromCloud);

  document.getElementById("btn-settings").addEventListener("click", () => {
    const config = getApiConfig();
    document.getElementById("setting-gas-url").value = config.url;
    document.getElementById("setting-gas-token").value = config.token;
    document.getElementById("modal-settings").classList.add("active");
  });

  document.getElementById("btn-close-settings").addEventListener("click", () => {
    document.getElementById("modal-settings").classList.remove("active");
  });

  document.getElementById("btn-save-settings").addEventListener("click", () => {
    const url = document.getElementById("setting-gas-url").value.trim();
    const token = document.getElementById("setting-gas-token").value.trim();
    localStorage.setItem("myopia_gas_url", url);
    localStorage.setItem("myopia_gas_token", token);
    alert("設定已儲存！");
    document.getElementById("modal-settings").classList.remove("active");
  });

  document.getElementById("btn-export-csv").addEventListener("click", exportVisitsToCsv);
}

async function loadAndRenderCustomers() {
  allCustomersCache = await getAllCustomers();
  filterAndRenderCustomers();
}

function filterAndRenderCustomers() {
  const searchText = document.getElementById("input-search").value.toLowerCase().trim();
  const container = document.getElementById("customer-cards-container");
  container.innerHTML = "";

  const filtered = allCustomersCache.filter(c => {
    const matchSearch = !searchText || 
      (c["姓名"] && c["姓名"].toLowerCase().includes(searchText)) ||
      (c["識別碼"] && c["識別碼"].toLowerCase().includes(searchText)) ||
      (c["醫師"] && c["醫師"].toLowerCase().includes(searchText));

    const matchLens = (currentFilterType === "all") || (c["片種"] && c["片種"].includes(currentFilterType));

    return matchSearch && matchLens;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8;">查無符合的顧客資料</div>`;
    return;
  }

  filtered.forEach(cust => {
    const card = document.createElement("div");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-header">
        <span class="customer-card-name">${cust["姓名"]}</span>
        <span class="lens-badge">${cust["片種"] || "未指定"}</span>
      </div>
      <div class="customer-card-meta">
        <span>醫師：${cust["醫師"] || "--"}</span>
        <span>生日：${cust["生日"] || "--"}</span>
      </div>
    `;
    card.addEventListener("click", () => showCustomerDetail(cust));
    container.appendChild(card);
  });
}

async function showCustomerDetail(customer) {
  currentSelectedCustomer = customer;

  document.getElementById("view-customer-list").classList.remove("active");
  document.getElementById("view-customer-detail").classList.add("active");

  document.getElementById("detail-customer-name").textContent = customer["姓名"];
  document.getElementById("detail-customer-id").textContent = customer["識別碼"];
  document.getElementById("detail-lens").textContent = customer["片種"] || "--";
  document.getElementById("detail-doctor").textContent = customer["醫師"] || "--";
  document.getElementById("detail-birthday").textContent = customer["生日"] || "--";
  document.getElementById("detail-pickup").textContent = customer["取件日期"] || "--";
  document.getElementById("detail-notes").textContent = customer["備註"] || "無特殊備註";

  const visits = await getVisitsByCustomerId(customer["識別碼"]);
  document.getElementById("count-visits").textContent = visits.length;
  renderVisitsTimeline(visits);

  renderAxialLengthChart("alTrendChart", visits);

  const refractions = await getRefractionsByCustomerId(customer["識別碼"]);
  document.getElementById("count-refractions").textContent = refractions.length;
  renderRefractionsTimeline(refractions);
}

function renderVisitsTimeline(visits) {
  const container = document.getElementById("visits-container");
  container.innerHTML = "";

  if (visits.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:#94a3b8;">尚無回診紀錄</div>`;
    return;
  }

  [...visits].reverse().forEach(v => {
    const item = document.createElement("div");
    item.className = "record-item";
    item.innerHTML = `
      <div class="record-date">${v["回診日期"]} ${v["備註"] ? `<span style="font-weight:normal;color:#64748b;">· ${v["備註"]}</span>` : ""}</div>
      <div class="record-metrics">
        <span class="metric-od">右眼視力: ${v["右眼視力"] ?? "--"} | AL: ${v["右眼軸長"] ?? "--"}</span>
        <span class="metric-os">左眼視力: ${v["左眼視力"] ?? "--"} | AL: ${v["左眼軸長"] ?? "--"}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderRefractionsTimeline(refractions) {
  const container = document.getElementById("refractions-container");
  container.innerHTML = "";

  if (refractions.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:#94a3b8;">尚無驗光紀錄</div>`;
    return;
  }

  [...refractions].reverse().forEach(r => {
    const item = document.createElement("div");
    item.className = "record-item";
    item.innerHTML = `
      <div class="record-date">${r["驗光日期"]} ${r["備註"] ? `· ${r["備註"]}` : ""}</div>
      <div class="record-metrics">
        <span class="metric-od">OD: ${r["右眼球面"] || 0} / ${r["右眼散光"] || 0} x ${r["右眼軸度"] || 0} (${r["右眼視力"] || "--"})</span>
      </div>
      <div class="record-metrics">
        <span class="metric-os">OS: ${r["左眼球面"] || 0} / ${r["左眼散光"] || 0} x ${r["左眼軸度"] || 0} (${r["左眼視力"] || "--"})</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function openAddVisitModal() {
  document.getElementById("visit-input-name").value = currentSelectedCustomer["姓名"];
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("visit-input-date").value = today;
  document.getElementById("visit-input-notes").value = "";
  document.getElementById("visit-input-od-va").value = "";
  document.getElementById("visit-input-os-va").value = "";
  document.getElementById("visit-input-od-al").value = "";
  document.getElementById("visit-input-os-al").value = "";

  document.getElementById("modal-add-visit").classList.add("active");
}

async function handleAddVisitSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-visit");
  btn.disabled = true;
  btn.textContent = "儲存中...";

  try {
    const rawDate = document.getElementById("visit-input-date").value;
    const formattedDate = rawDate.replace(/-/g, "/");

    const visitData = {
      "識別碼": currentSelectedCustomer["識別碼"],
      "姓名": currentSelectedCustomer["姓名"],
      "回診日期": formattedDate,
      "備註": document.getElementById("visit-input-notes").value.trim(),
      "右眼視力": parseFloat(document.getElementById("visit-input-od-va").value) || "",
      "左眼視力": parseFloat(document.getElementById("visit-input-os-va").value) || "",
      "右眼軸長": parseFloat(document.getElementById("visit-input-od-al").value) || "",
      "左眼軸長": parseFloat(document.getElementById("visit-input-os-al").value) || "",
      "時間戳記": new Date().toLocaleString("zh-TW", { hour12: false })
    };

    await insertLocalVisit(visitData);
    const syncRes = await dispatchMutation("addVisit", visitData);

    document.getElementById("modal-add-visit").classList.remove("active");
    await showCustomerDetail(currentSelectedCustomer);

    if (syncRes.mode === "offline_queued") {
      alert("目前為離線狀態，紀錄已先存入手機本機，待連上網路時將自動補送至試算表！");
    }
  } catch (err) {
    alert(`儲存失敗: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "儲存回診紀錄";
  }
}

async function syncFromCloud() {
  const syncBtn = document.getElementById("btn-sync");
  syncBtn.textContent = "⏳";
  try {
    const cloudData = await fetchAllFromCloud();

    if (cloudData.customers) await bulkPutItems("customers", cloudData.customers);
    if (cloudData.visits) await bulkPutItems("visits", cloudData.visits);
    if (cloudData.refractions) await bulkPutItems("refractions", cloudData.refractions);
    if (cloudData.images) await bulkPutItems("images", cloudData.images);

    await loadAndRenderCustomers();
    if (currentSelectedCustomer) {
      await showCustomerDetail(currentSelectedCustomer);
    }

    alert("雲端資料同步完成！");
  } catch (err) {
    alert(`同步失敗: ${err.message}`);
  } finally {
    syncBtn.textContent = "🔄";
  }
}

function updateNetworkStatusBadge() {
  const badge = document.getElementById("sync-status");
  if (navigator.onLine) {
    badge.textContent = "線上連線";
    badge.className = "sync-badge online";
  } else {
    badge.textContent = "離線快取中";
    badge.className = "sync-badge";
  }

  window.addEventListener("online", () => {
    badge.textContent = "線上連線";
    badge.className = "sync-badge online";
  });

  window.addEventListener("offline", () => {
    badge.textContent = "離線快取中";
    badge.className = "sync-badge";
  });
}

async function exportVisitsToCsv() {
  const transaction = dbInstance.transaction("visits", "readonly");
  const store = transaction.objectStore("visits");
  const request = store.getAll();

  request.onsuccess = () => {
    const visits = request.result || [];
    if (visits.length === 0) {
      alert("目前本機無回診紀錄可匯出！");
      return;
    }

    const headers = ["識別碼", "姓名", "回診日期", "備註", "右眼視力", "左眼視力", "右眼軸長", "左眼軸長", "時間戳記"];
    let csvContent = "\uFEFF" + headers.join(",") + "\n";

    visits.forEach(v => {
      const row = [
        `"${v["識別碼"] || ""}"`,
        `"${v["姓名"] || ""}"`,
        `"${v["回診日期"] || ""}"`,
        `"${(v["備註"] || "").replace(/"/g, '""')}"`,
        v["右眼視力"] ?? "",
        v["左眼視力"] ?? "",
        v["右眼軸長"] ?? "",
        v["左眼軸長"] ?? "",
        `"${v["時間戳記"] || ""}"`
      ];
      csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `近視管理客戶資料_回診紀錄_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
}
