/**
 * 近視管理系統 - Chart.js 眼軸長趨勢圖模組
 */

let alChartInstance = null;

function renderAxialLengthChart(canvasId, visitRecords) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  const validRecords = visitRecords.filter((rec) => {
    const od = parseFloat(rec["右眼軸長"]);
    const os = parseFloat(rec["左眼軸長"]);
    return (!isNaN(od) && od > 15) || (!isNaN(os) && os > 15);
  });

  const labels = validRecords.map(r => r["回診日期"]);
  const odData = validRecords.map(r => {
    const val = parseFloat(r["右眼軸長"]);
    return !isNaN(val) && val > 15 ? val : null;
  });
  const osData = validRecords.map(r => {
    const val = parseFloat(r["左眼軸長"]);
    return !isNaN(val) && val > 15 ? val : null;
  });

  if (alChartInstance) {
    alChartInstance.destroy();
  }

  alChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "右眼 OD (mm)",
          data: odData,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: "#ef4444",
          tension: 0.15,
          spanGaps: true
        },
        {
          label: "左眼 OS (mm)",
          data: osData,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: "#3b82f6",
          tension: 0.15,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            boxWidth: 12,
            font: { size: 12 }
          }
        },
        tooltip: {
          mode: "index",
          intersect: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        },
        y: {
          suggestedMin: 22.0,
          suggestedMax: 27.0,
          ticks: {
            stepSize: 0.5,
            font: { size: 10 }
          },
          grid: { color: "#f1f5f9" }
        }
      }
    }
  });
}
