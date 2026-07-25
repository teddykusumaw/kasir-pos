export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function downloadExcel(
  filename: string,
  sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]
) {
  const parts = sheets.map((sheet) => {
    const head = sheet.headers
      .map((h) => `<th style="background:#2563eb;color:#fff;padding:6px;border:1px solid #ccc">${escapeHtml(h)}</th>`)
      .join("");
    const body = sheet.rows
      .map((r) => `<tr>${r.map((c) => `<td style="padding:6px;border:1px solid #ccc">${escapeHtml(String(c ?? ""))}</td>`).join("")}</tr>`)
      .join("");
    return `<h2>${escapeHtml(sheet.name)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><br/>`;
  });
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${parts.join("")}</body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".xls") ? filename : `${filename}.xls`);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
