// 导出 Excel (纯 JS 实现，无需 SheetJS CDN，基于 CSV + xlsx 格式)

// 导出为 CSV（简单版）
export function exportCSV(data, filename = 'export.csv') {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
        headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    downloadText(csv, filename, 'text/csv');
}

// 导出为 xlsx（使用 SheetJS，如果已加载）
export function exportXLSX(data, sheetName = 'Sheet1', filename = 'export.xlsx') {
    if (!data || data.length === 0) return;

    // 检查 SheetJS 是否可用
    if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, filename);
    } else {
        // 降级为 CSV
        exportCSV(data, filename.replace('.xlsx', '.csv'));
    }
}

function downloadText(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
