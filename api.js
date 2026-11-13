/**
 * 近視管理系統 - 網路通訊層與雲端同步模組
 */

function getApiConfig() {
  return {
    url: localStorage.getItem("myopia_gas_url") || "",
    token: localStorage.getItem("myopia_gas_token") || "MyopiaCareSecureKey2026"
  };
}

async function fetchAllFromCloud() {
  const config = getApiConfig();
  if (!config.url) {
    throw new Error("尚未設定 Google Apps Script Web App 網址");
  }

  const targetUrl = `${config.url}?action=fetchAll&token=${encodeURIComponent(config.token)}`;

  const response = await fetch(targetUrl, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`雲端連線失敗: HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.status !== "success") {
    throw new Error(result.message || "讀取資料錯誤");
  }

  return result.data;
}

async function postToCloud(action, data) {
  const config = getApiConfig();
  if (!config.url) {
    throw new Error("尚未設定 GAS 網址");
  }

  const payload = {
    action: action,
    token: config.token,
    data: data,
    clientMutationId: `mutation_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
  };

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`寫入失敗: HTTP ${response.status}`);
  }

  const resJson = await response.json();
  if (resJson.status !== "success") {
    throw new Error(resJson.message || "雲端寫入發生異常");
  }

  return resJson;
}

async function dispatchMutation(action, data) {
  const mutationId = `mut_${Date.now()}`;
  try {
    if (!navigator.onLine) {
      throw new Error("目前處於離線狀態");
    }
    const result = await postToCloud(action, data);
    return { success: true, mode: "online", result: result };
  } catch (err) {
    console.warn("雲端傳輸受阻，轉入本機離線隊列:", err);
    await enqueueOutbox({
      mutationId: mutationId,
      action: action,
      data: data,
      createdAt: new Date().toISOString()
    });
    return { success: true, mode: "offline_queued", error: err.message };
  }
}

async function flushOutboxQueue() {
  if (!navigator.onLine) return;
  const pendingList = await getPendingOutbox();
  if (pendingList.length === 0) return;

  console.log(`開始補送離線資料，共 ${pendingList.length} 筆...`);
  for (const item of pendingList) {
    try {
      await postToCloud(item.action, item.data);
      await removeOutboxItem(item.mutationId);
      console.log(`任務 ${item.mutationId} 已補送成功並移除`);
    } catch (e) {
      console.error(`任務 ${item.mutationId} 補送失敗，待下次連線重試:`, e);
      break;
    }
  }
}

window.addEventListener("online", () => {
  console.log("偵測到網路恢復，啟動離線隊列補送...");
  flushOutboxQueue();
});
