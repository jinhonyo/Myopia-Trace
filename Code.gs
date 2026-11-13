/**
 * 近視管理系統 - Google Apps Script 後端 API
 * 負責提供資料庫查詢、排程鎖定、離線資料批次追加與影像存檔至 Google Drive
 */

// 全域常數設定：自訂安全金鑰（請與前端設定保持一致）
const API_TOKEN = "MyopiaCareSecureKey2026";

// 影像儲存之 Google 雲端硬碟資料夾名稱
const IMAGE_FOLDER_NAME = "影像資料_Images";

/**
 * 輔助函式：建立統一格式的 JSON 輸出（相容 CORS）
 * @param {Object} data - 欲回傳給前端的資料物件
 * @returns {TextOutput} 具有 JSON MimeType 的字串輸出
 */
function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * 處理 HTTP GET 請求（全量資料載入）
 * @param {Object} e - GET 事件物件
 * @returns {TextOutput} JSON 格式的四張工作表資料
 */
function doGet(e) {
  try {
    const action = e.parameter.action || "fetchAll";
    const token = e.parameter.token;

    if (token !== API_TOKEN) {
      return createJsonResponse({ status: "error", message: "未授權存取：Token 無效" });
    }

    if (action === "fetchAll") {
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

      const customers = readSheetData(spreadsheet.getSheetByName("顧客基本資料"));
      const visits = readSheetData(spreadsheet.getSheetByName("回診紀錄"));
      const refractions = readSheetData(spreadsheet.getSheetByName("驗光紀錄"));
      const images = readSheetData(spreadsheet.getSheetByName("影像資料"));

      return createJsonResponse({
        status: "success",
        timestamp: Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss"),
        data: {
          customers: customers,
          visits: visits,
          refractions: refractions,
          images: images
        }
      });
    }

    return createJsonResponse({ status: "error", message: "未知的 GET 動作" });
  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * 輔助函式：將指定工作表的整表內容轉換為物件陣列
 * @param {Sheet} sheet - Google 試算表工作表物件
 * @returns {Array<Object>} 每一列轉換後的物件陣列
 */
function readSheetData(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.every(cell => cell === "" || cell === null)) continue;

    const rowObj = {};
    for (let j = 0; j < headers.length; j++) {
      let cellValue = row[j];
      if (cellValue instanceof Date) {
        cellValue = Utilities.formatDate(cellValue, "Asia/Taipei", "yyyy/MM/dd");
      }
      rowObj[headers[j]] = cellValue;
    }
    rows.push(rowObj);
  }
  return rows;
}

/**
 * 處理 HTTP POST 請求（資料新增、影像上傳與並發保護）
 * @param {Object} e - POST 事件物件（內容由 e.postData.contents 取出）
 * @returns {TextOutput} 處理狀態結果 JSON
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockError) {
    return createJsonResponse({ status: "error", message: "系統忙碌中，鎖定超時，請稍後重試" });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ status: "error", message: "未收到有效的請求內容" });
    }

    const payload = JSON.parse(e.postData.contents);
    const token = payload.token;
    const action = payload.action;
    const data = payload.data;

    if (token !== API_TOKEN) {
      return createJsonResponse({ status: "error", message: "未授權存取：Token 無效" });
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const currentTimestamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");

    if (action === "addVisit") {
      const sheet = spreadsheet.getSheetByName("回診紀錄");
      sheet.appendRow([
        data["識別碼"],
        data["姓名"],
        data["回診日期"],
        data["備註"] || "",
        data["右眼視力"] !== undefined ? data["右眼視力"] : "",
        data["左眼視力"] !== undefined ? data["左眼視力"] : "",
        data["右眼軸長"] !== undefined ? data["右眼軸長"] : "",
        data["左眼軸長"] !== undefined ? data["左眼軸長"] : "",
        currentTimestamp
      ]);
      return createJsonResponse({ status: "success", message: "回診紀錄新增完成" });
    }

    if (action === "addCustomer") {
      const sheet = spreadsheet.getSheetByName("顧客基本資料");
      sheet.appendRow([
        data["識別碼"],
        data["姓名"],
        data["生日"],
        data["片種"] || "",
        data["醫師"] || "",
        data["備註"] || "",
        data["取件日期"] || ""
      ]);
      return createJsonResponse({ status: "success", message: "顧客基本資料新增完成" });
    }

    if (action === "addRefraction") {
      const sheet = spreadsheet.getSheetByName("驗光紀錄");
      sheet.appendRow([
        data["識別碼"],
        data["姓名"],
        data["驗光日期"],
        data["備註"] || "",
        data["右眼視力"] || "",
        data["右眼球面"] || "",
        data["右眼散光"] || "",
        data["右眼軸度"] || "",
        data["右眼附註"] || "",
        data["左眼視力"] || "",
        data["左眼球面"] || "",
        data["左眼散光"] || "",
        data["左眼軸度"] || "",
        data["左眼附註"] || "",
        currentTimestamp
      ]);
      return createJsonResponse({ status: "success", message: "驗光紀錄新增完成" });
    }

    if (action === "uploadImage") {
      const sheet = spreadsheet.getSheetByName("影像資料");
      const folder = getOrCreateFolder(IMAGE_FOLDER_NAME);

      const savedUrls = { 右眼1: "", 右眼2: "", 左眼1: "", 左眼2: "", TOPO: "" };
      const imageKeys = ["右眼1", "右眼2", "左眼1", "左眼2", "TOPO"];

      imageKeys.forEach(key => {
        if (data[key] && data[key].startsWith("data:image")) {
          const base64Data = data[key].split(",")[1];
          const decodedBlob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/jpeg", `${data["識別碼"]}_${key}_${Date.now()}.jpg`);
          const file = folder.createFile(decodedBlob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          savedUrls[key] = file.getUrl();
        }
      });

      sheet.appendRow([
        data["識別碼"],
        data["姓名"],
        data["拍攝日期"],
        data["內容說明"] || "",
        savedUrls["右眼1"],
        savedUrls["右眼2"],
        savedUrls["左眼1"],
        savedUrls["左眼2"],
        savedUrls["TOPO"],
        currentTimestamp
      ]);
      return createJsonResponse({ status: "success", message: "影像上傳完成", urls: savedUrls });
    }

    return createJsonResponse({ status: "error", message: "未知的 POST 動作" });
  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}
