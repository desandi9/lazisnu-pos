/**
 * Google Apps Script Web App untuk sinkronisasi LAZISNU POS ke beberapa sheet.
 *
 * Sheet yang dibuat/dipakai:
 * 1. Dashboard Statistik
 * 2. Transaksi Detail
 * 3. Rekap Transaksi
 * 4. Rekap Laba
 * 5. Rekap Petugas
 */

const SPREADSHEET_ID = ''; // Opsional. Isi ID spreadsheet jika script tidak bound ke Google Sheet tujuan.

const SHEETS = {
  dashboard: 'Dashboard Statistik',
  detail: 'Transaksi Detail',
  transactions: 'Rekap Transaksi',
  profit: 'Rekap Laba',
  officers: 'Rekap Petugas'
};

const DASHBOARD_COLORS = {
  emerald: '#059669',
  emeraldDark: '#047857',
  emeraldLight: '#d1fae5',
  border: '#d1d5db'
};

const HEADERS = {
  detail: [
    'No. Transaksi',
    'Tanggal',
    'Pembeli',
    'Petugas',
    'Role',
    'Produk',
    'Kategori',
    'Ukuran',
    'Qty',
    'Harga',
    'Subtotal',
    'Total Transaksi',
    'Metode',
    'Catatan',
    'Waktu Sync'
  ],
  transactions: [
    'No. Transaksi',
    'Tanggal',
    'Pembeli',
    'Petugas',
    'Role',
    'Jumlah Item',
    'Total Qty',
    'Total Transaksi',
    'Metode',
    'Catatan',
    'Status Sync',
    'Waktu Sync'
  ],
  profit: [
    'No. Transaksi',
    'Tanggal',
    'Pembeli',
    'Petugas',
    'Total Transaksi',
    '% LAZISNU',
    'Rp LAZISNU',
    '% PCNU',
    'Rp PCNU',
    '% Petugas',
    'Rp Petugas',
    '% Pengelola',
    'Rp Pengelola',
    'Waktu Sync'
  ],
  officers: [
    'Petugas',
    'Role',
    'Jumlah Transaksi',
    'Total Qty',
    'Total Omzet',
    'Rp LAZISNU',
    'Rp PCNU',
    'Rp Petugas',
    'Rp Pengelola',
    'Terakhir Update'
  ]
};

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

    if (rows.length === 0) {
      return jsonResponse({ success: false, message: 'Payload rows kosong.' });
    }

    const spreadsheet = SPREADSHEET_ID
      ? SpreadsheetApp.openById(SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const sheets = setupSheets(spreadsheet);
    const grouped = groupRowsByTransaction(rows);

    appendRows(sheets.detail, HEADERS.detail, rows.map(toDetailRow));
    appendRows(sheets.transactions, HEADERS.transactions, Object.values(grouped).map(toTransactionRow));
    appendRows(sheets.profit, HEADERS.profit, Object.values(grouped).map(toProfitRow));

    rebuildOfficerSummary(sheets.transactions, sheets.profit, sheets.officers);
    rebuildDashboardStatistik(sheets);

    [sheets.detail, sheets.transactions, sheets.profit, sheets.officers].forEach(formatSheet);

    return jsonResponse({
      success: true,
      detailRows: rows.length,
      transactionRows: Object.keys(grouped).length
    });
  } catch (error) {
    return jsonResponse({ success: false, message: error.message });
  }
}

function setupSheets(spreadsheet) {
  const sheets = {
    dashboard: getOrCreateSheet(spreadsheet, SHEETS.dashboard),
    detail: getOrCreateSheet(spreadsheet, SHEETS.detail),
    transactions: getOrCreateSheet(spreadsheet, SHEETS.transactions),
    profit: getOrCreateSheet(spreadsheet, SHEETS.profit),
    officers: getOrCreateSheet(spreadsheet, SHEETS.officers)
  };

  ensureHeaders(sheets.detail, HEADERS.detail);
  ensureHeaders(sheets.transactions, HEADERS.transactions);
  ensureHeaders(sheets.profit, HEADERS.profit);
  ensureHeaders(sheets.officers, HEADERS.officers);

  return sheets;
}

function getOrCreateSheet(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = headers.every((header, index) => currentHeaders[index] === header);

  if (!hasHeaders) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function appendRows(sheet, headers, values) {
  if (values.length === 0) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function groupRowsByTransaction(rows) {
  return rows.reduce((acc, row) => {
    const transactionId = row['No. Transaksi'];

    if (!acc[transactionId]) {
      acc[transactionId] = {
        first: row,
        itemCount: 0,
        totalQty: 0
      };
    }

    acc[transactionId].itemCount += 1;
    acc[transactionId].totalQty += Number(row.Qty || 0);

    return acc;
  }, {});
}

function toDetailRow(row) {
  return HEADERS.detail.map(header => getCellValue(row, header));
}

function toTransactionRow(group) {
  const row = group.first;

  return [
    row['No. Transaksi'],
    getCellValue(row, 'Tanggal'),
    row.Pembeli,
    row.Petugas,
    row.Role,
    group.itemCount,
    group.totalQty,
    row['Total Transaksi'],
    row.Metode,
    row.Catatan,
    'synced',
    getCellValue(row, 'Waktu Sync')
  ];
}

function toProfitRow(group) {
  const row = group.first;

  return [
    row['No. Transaksi'],
    getCellValue(row, 'Tanggal'),
    row.Pembeli,
    row.Petugas,
    row['Total Transaksi'],
    row['% LAZISNU'],
    row['Rp LAZISNU'],
    row['% PCNU'],
    row['Rp PCNU'],
    row['% Petugas'],
    row['Rp Petugas'],
    row['% Pengelola'],
    row['Rp Pengelola'],
    getCellValue(row, 'Waktu Sync')
  ];
}

function getCellValue(row, header) {
  const value = row[header] ?? '';

  if (['Tanggal', 'Waktu Sync', 'Terakhir Update'].includes(header) && value) {
    return new Date(value);
  }

  return value;
}

function rebuildOfficerSummary(transactionSheet, profitSheet, officerSheet) {
  ensureHeaders(officerSheet, HEADERS.officers);

  const transactionRows = getDataRows(transactionSheet, HEADERS.transactions);
  const profitRows = getDataRows(profitSheet, HEADERS.profit);
  const profitByTransaction = profitRows.reduce((acc, row) => {
    acc[row['No. Transaksi']] = row;
    return acc;
  }, {});
  const summary = transactionRows.reduce((acc, row) => {
    const officer = row.Petugas || '-';
    const profit = profitByTransaction[row['No. Transaksi']] || {};

    if (!acc[officer]) {
      acc[officer] = {
        Petugas: officer,
        Role: row.Role || '-',
        'Jumlah Transaksi': 0,
        'Total Qty': 0,
        'Total Omzet': 0,
        'Rp LAZISNU': 0,
        'Rp PCNU': 0,
        'Rp Petugas': 0,
        'Rp Pengelola': 0,
        'Terakhir Update': row['Waktu Sync'] || new Date()
      };
    }

    acc[officer]['Jumlah Transaksi'] += 1;
    acc[officer]['Total Qty'] += Number(row['Total Qty'] || 0);
    acc[officer]['Total Omzet'] += Number(row['Total Transaksi'] || 0);
    acc[officer]['Rp LAZISNU'] += Number(profit['Rp LAZISNU'] || 0);
    acc[officer]['Rp PCNU'] += Number(profit['Rp PCNU'] || 0);
    acc[officer]['Rp Petugas'] += Number(profit['Rp Petugas'] || 0);
    acc[officer]['Rp Pengelola'] += Number(profit['Rp Pengelola'] || 0);
    acc[officer]['Terakhir Update'] = row['Waktu Sync'] || acc[officer]['Terakhir Update'];

    return acc;
  }, {});

  if (officerSheet.getLastRow() > 1) {
    officerSheet.getRange(2, 1, officerSheet.getLastRow() - 1, HEADERS.officers.length).clearContent();
  }

  const values = Object.values(summary).map(row => HEADERS.officers.map(header => getCellValue(row, header)));
  appendRows(officerSheet, HEADERS.officers, values);
}

function rebuildDashboardStatistik(sheets) {
  const dashboardSheet = sheets.dashboard;
  const detailRows = getDataRows(sheets.detail, HEADERS.detail);
  const transactionRows = getDataRows(sheets.transactions, HEADERS.transactions);
  const profitRows = getDataRows(sheets.profit, HEADERS.profit);
  const officerRows = getDataRows(sheets.officers, HEADERS.officers);
  const now = new Date();
  const lastSyncTime = getLastSyncTime(detailRows, transactionRows, profitRows) || now;
  const summary = buildDashboardSummary(transactionRows, profitRows, officerRows);
  const todayStats = buildPeriodStats(transactionRows, profitRows, now, isSameDay);
  const monthStats = buildPeriodStats(transactionRows, profitRows, now, isSameMonth);
  const topOfficerRows = buildTopOfficerRows(officerRows);
  const productRows = buildBestSellerRows(detailRows);

  clearDashboardSheet(dashboardSheet);

  dashboardSheet.getRange(1, 1, 1, 12).merge().setValue('DASHBOARD STATISTIK PENJUALAN LAZISNU GARUT');
  dashboardSheet.getRange(2, 1).setValue('Terakhir Update');
  dashboardSheet.getRange(2, 2).setValue(lastSyncTime);

  writeMetricTable(dashboardSheet, 4, 1, 'Ringkasan Total', [
    ['Total Transaksi', summary.totalTransactions],
    ['Total Omzet', summary.totalRevenue],
    ['Total Qty Terjual', summary.totalQty],
    ['Total LAZISNU', summary.totalLazisnu],
    ['Total PCNU', summary.totalPcnu],
    ['Total Petugas', summary.totalOfficerShare],
    ['Total Pengelola', summary.totalManagerShare],
    ['Jumlah Petugas Aktif / Petugas dengan Transaksi', summary.activeOfficers]
  ]);

  writeMetricTable(dashboardSheet, 4, 4, 'Statistik Hari Ini', [
    ['Transaksi Hari Ini', todayStats.transactions],
    ['Omzet Hari Ini', todayStats.revenue],
    ['Qty Terjual Hari Ini', todayStats.qty],
    ['LAZISNU Hari Ini', todayStats.lazisnu],
    ['PCNU Hari Ini', todayStats.pcnu],
    ['Petugas Hari Ini', todayStats.officerShare],
    ['Pengelola Hari Ini', todayStats.managerShare]
  ]);

  writeMetricTable(dashboardSheet, 4, 7, 'Statistik Bulan Ini', [
    ['Transaksi Bulan Ini', monthStats.transactions],
    ['Omzet Bulan Ini', monthStats.revenue],
    ['Qty Terjual Bulan Ini', monthStats.qty],
    ['LAZISNU Bulan Ini', monthStats.lazisnu],
    ['PCNU Bulan Ini', monthStats.pcnu],
    ['Petugas Bulan Ini', monthStats.officerShare],
    ['Pengelola Bulan Ini', monthStats.managerShare]
  ]);

  writeDataTable(
    dashboardSheet,
    16,
    1,
    'Top Petugas',
    ['Ranking', 'Petugas', 'Jumlah Transaksi', 'Total Omzet', 'Bagian Petugas'],
    topOfficerRows
  );

  writeDataTable(
    dashboardSheet,
    16,
    7,
    'Produk Terlaris',
    ['Ranking', 'Produk', 'Kategori', 'Ukuran', 'Total Qty', 'Total Penjualan'],
    productRows
  );

  formatDashboardStatistik(dashboardSheet);
}

function buildDashboardSummary(transactionRows, profitRows, officerRows) {
  return {
    totalTransactions: transactionRows.length,
    totalRevenue: sumRows(transactionRows, 'Total Transaksi'),
    totalQty: sumRows(transactionRows, 'Total Qty'),
    totalLazisnu: sumRows(profitRows, 'Rp LAZISNU'),
    totalPcnu: sumRows(profitRows, 'Rp PCNU'),
    totalOfficerShare: sumRows(profitRows, 'Rp Petugas'),
    totalManagerShare: sumRows(profitRows, 'Rp Pengelola'),
    activeOfficers: officerRows.filter(row => toNumber(row['Jumlah Transaksi']) > 0).length
  };
}

function buildPeriodStats(transactionRows, profitRows, referenceDate, matcher) {
  const periodTransactions = transactionRows.filter(row => matcher(row.Tanggal, referenceDate));
  const periodProfits = profitRows.filter(row => matcher(row.Tanggal, referenceDate));

  return {
    transactions: periodTransactions.length,
    revenue: sumRows(periodTransactions, 'Total Transaksi'),
    qty: sumRows(periodTransactions, 'Total Qty'),
    lazisnu: sumRows(periodProfits, 'Rp LAZISNU'),
    pcnu: sumRows(periodProfits, 'Rp PCNU'),
    officerShare: sumRows(periodProfits, 'Rp Petugas'),
    managerShare: sumRows(periodProfits, 'Rp Pengelola')
  };
}

function buildTopOfficerRows(officerRows) {
  return officerRows
    .slice()
    .sort((a, b) => toNumber(b['Total Omzet']) - toNumber(a['Total Omzet']))
    .map((row, index) => [
      index + 1,
      row.Petugas || '-',
      toNumber(row['Jumlah Transaksi']),
      toNumber(row['Total Omzet']),
      toNumber(row['Rp Petugas'])
    ]);
}

function buildBestSellerRows(detailRows) {
  const products = detailRows.reduce((acc, row) => {
    const product = row.Produk || '-';
    const category = row.Kategori || '-';
    const size = row.Ukuran || '-';
    const key = [product, category, size].join('||');

    if (!acc[key]) {
      acc[key] = {
        product,
        category,
        size,
        qty: 0,
        sales: 0
      };
    }

    acc[key].qty += toNumber(row.Qty);
    acc[key].sales += toNumber(row.Subtotal || (toNumber(row.Qty) * toNumber(row.Harga)));

    return acc;
  }, {});

  return Object.values(products)
    .sort((a, b) => (b.qty - a.qty) || (b.sales - a.sales))
    .map((row, index) => [
      index + 1,
      row.product,
      row.category,
      row.size,
      row.qty,
      row.sales
    ]);
}

function getLastSyncTime(detailRows, transactionRows, profitRows) {
  return detailRows.concat(transactionRows, profitRows).reduce((latest, row) => {
    const syncTime = toDate(row['Waktu Sync']);

    if (!syncTime) return latest;
    if (!latest || syncTime.getTime() > latest.getTime()) return syncTime;

    return latest;
  }, null);
}

function sumRows(rows, header) {
  return rows.reduce((total, row) => total + toNumber(row[header]), 0);
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (value instanceof Date || value === null || value === undefined || value === '') return 0;

  const text = String(value).trim();
  const normalized = text.replace(/[^0-9,.-]/g, '');

  if (/^-?\d{1,3}(,\d{3})+$/.test(normalized)) {
    return Number(normalized.replace(/,/g, '')) || 0;
  }

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    return Number(normalized.replace(/\./g, '').replace(',', '.')) || 0;
  }

  return Number(normalized.replace(',', '.')) || 0;
}

function toDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (!value) return null;

  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function isSameDay(value, referenceDate) {
  const date = toDate(value);
  if (!date) return false;

  return date.getFullYear() === referenceDate.getFullYear()
    && date.getMonth() === referenceDate.getMonth()
    && date.getDate() === referenceDate.getDate();
}

function isSameMonth(value, referenceDate) {
  const date = toDate(value);
  if (!date) return false;

  return date.getFullYear() === referenceDate.getFullYear()
    && date.getMonth() === referenceDate.getMonth();
}

function clearDashboardSheet(sheet) {
  const filter = sheet.getFilter();
  if (filter) filter.remove();

  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
}

function writeMetricTable(sheet, startRow, startColumn, title, rows) {
  const titleRange = sheet.getRange(startRow, startColumn, 1, 2).merge().setValue(title);
  titleRange
    .setBackground(DASHBOARD_COLORS.emerald)
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange(startRow + 1, startColumn, 1, 2)
    .setValues([['Metrik', 'Nilai']])
    .setBackground(DASHBOARD_COLORS.emeraldLight)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange(startRow + 2, startColumn, rows.length, 2).setValues(rows);
  sheet.getRange(startRow, startColumn, rows.length + 2, 2)
    .setBorder(true, true, true, true, true, true, DASHBOARD_COLORS.border, SpreadsheetApp.BorderStyle.SOLID);

  rows.forEach((row, index) => {
    const valueCell = sheet.getRange(startRow + 2 + index, startColumn + 1);
    valueCell.setHorizontalAlignment('right');

    if (isCurrencyMetric(row[0])) {
      valueCell.setNumberFormat('Rp #,##0');
    } else {
      valueCell.setNumberFormat('#,##0');
    }
  });
}

function writeDataTable(sheet, startRow, startColumn, title, headers, rows) {
  const titleRange = sheet.getRange(startRow, startColumn, 1, headers.length).merge().setValue(title);
  titleRange
    .setBackground(DASHBOARD_COLORS.emeraldDark)
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange(startRow + 1, startColumn, 1, headers.length)
    .setValues([headers])
    .setBackground(DASHBOARD_COLORS.emerald)
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  if (rows.length === 0) {
    sheet.getRange(startRow + 2, startColumn, 1, headers.length).merge().setValue('Belum ada data.');
    sheet.getRange(startRow, startColumn, 3, headers.length)
      .setBorder(true, true, true, true, true, true, DASHBOARD_COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
    return;
  }

  sheet.getRange(startRow + 2, startColumn, rows.length, headers.length).setValues(rows);
  sheet.getRange(startRow, startColumn, rows.length + 2, headers.length)
    .setBorder(true, true, true, true, true, true, DASHBOARD_COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
}

function isCurrencyMetric(label) {
  return [
    'Total Omzet',
    'Total LAZISNU',
    'Total PCNU',
    'Total Petugas',
    'Total Pengelola',
    'Omzet Hari Ini',
    'LAZISNU Hari Ini',
    'PCNU Hari Ini',
    'Petugas Hari Ini',
    'Pengelola Hari Ini',
    'Omzet Bulan Ini',
    'LAZISNU Bulan Ini',
    'PCNU Bulan Ini',
    'Petugas Bulan Ini',
    'Pengelola Bulan Ini'
  ].includes(label);
}

function formatDashboardStatistik(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);

  sheet.setFrozenRows(2);
  sheet.getRange(1, 1, lastRow, 12)
    .setWrap(true)
    .setVerticalAlignment('middle');

  sheet.getRange(1, 1, 1, 12)
    .setBackground(DASHBOARD_COLORS.emerald)
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(16)
    .setHorizontalAlignment('center');

  sheet.getRange(2, 1, 1, 2)
    .setBackground(DASHBOARD_COLORS.emeraldLight)
    .setFontWeight('bold')
    .setBorder(true, true, true, true, true, true, DASHBOARD_COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(2, 2).setNumberFormat('dd/MM/yyyy HH:mm');

  sheet.getRange(18, 1, Math.max(lastRow - 17, 1), 1).setHorizontalAlignment('center');
  sheet.getRange(18, 3, Math.max(lastRow - 17, 1), 1).setHorizontalAlignment('center');
  sheet.getRange(18, 4, Math.max(lastRow - 17, 1), 2).setNumberFormat('Rp #,##0').setHorizontalAlignment('right');
  sheet.getRange(18, 7, Math.max(lastRow - 17, 1), 1).setHorizontalAlignment('center');
  sheet.getRange(18, 11, Math.max(lastRow - 17, 1), 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
  sheet.getRange(18, 12, Math.max(lastRow - 17, 1), 1).setNumberFormat('Rp #,##0').setHorizontalAlignment('right');

  sheet.setRowHeight(1, 36);
  sheet.autoResizeColumns(1, 12);
}

function getDataRows(sheet, headers) {
  if (sheet.getLastRow() <= 1) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map(valueRow => headers.reduce((acc, header, index) => {
    acc[header] = valueRow[index];
    return acc;
  }, {}));
}

function formatSheet(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) return;

  const headerRange = sheet.getRange(1, 1, 1, lastColumn);
  headerRange
    .setFontWeight('bold')
    .setBackground('#059669')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  const filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getRange(1, 1, lastRow, lastColumn).createFilter();

  sheet.getRange(1, 1, lastRow, lastColumn)
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, '#d1d5db', SpreadsheetApp.BorderStyle.SOLID);

  applyColumnFormats(sheet);
  sheet.autoResizeColumns(1, lastColumn);
}

function applyColumnFormats(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  headers.forEach((header, index) => {
    const column = index + 1;
    const range = sheet.getRange(2, column, Math.max(sheet.getLastRow() - 1, 1), 1);

    if (['Tanggal', 'Waktu Sync', 'Terakhir Update'].includes(header)) {
      range.setNumberFormat('dd/MM/yyyy HH:mm');
    }

    if (['Harga', 'Subtotal', 'Total Transaksi', 'Total Omzet', 'Rp LAZISNU', 'Rp PCNU', 'Rp Petugas', 'Rp Pengelola'].includes(header)) {
      range.setNumberFormat('Rp #,##0').setHorizontalAlignment('right');
    }

    if (['% LAZISNU', '% PCNU', '% Petugas', '% Pengelola'].includes(header)) {
      range.setNumberFormat('0"%"').setHorizontalAlignment('center');
    }

    if (['Qty', 'Jumlah Item', 'Total Qty', 'Jumlah Transaksi'].includes(header)) {
      range.setHorizontalAlignment('center');
    }
  });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
