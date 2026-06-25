/**
 * Google Apps Script Web App untuk sync full-refresh Modul Stikernisasi.
 *
 * Sheet yang dibuat/dipakai:
 * 1. Dashboard Statistik
 * 2. Rekap Transaksi
 * 3. Transaksi Detail
 * 4. Rekap Laba
 * 5. Rekap Petugas
 * 6. Piutang
 * 7. Uang di Luar
 * 8. Stok Barang
 */

const SPREADSHEET_ID = ''; // Opsional. Isi ID spreadsheet jika script tidak bound ke Google Sheet tujuan.

const SHEETS = {
  dashboard: 'Dashboard Statistik',
  transactions: 'Rekap Transaksi',
  detail: 'Transaksi Detail',
  profit: 'Rekap Laba',
  officers: 'Rekap Petugas',
  debt: 'Piutang',
  outsideMoney: 'Uang di Luar',
  stock: 'Stok Barang'
};

const COLORS = {
  emerald: '#059669',
  emeraldDark: '#047857',
  emeraldSoft: '#d1fae5',
  emeraldPale: '#ecfdf5',
  amber: '#f59e0b',
  amberSoft: '#fef3c7',
  red: '#dc2626',
  redSoft: '#fee2e2',
  slate: '#0f172a',
  slateText: '#334155',
  gray: '#f8fafc',
  border: '#d1d5db',
  white: '#ffffff'
};

const HEADERS = {
  transactions: ['Tanggal', 'Invoice', 'Pembeli', 'Petugas', 'Qty', 'Total', 'Metode', 'Status Pembayaran', 'LAZISNU', 'PCNU', 'Bagian Petugas', 'Pengelola'],
  detail: ['Tanggal', 'Invoice', 'Produk', 'Kategori', 'Ukuran', 'Qty', 'Harga', 'Subtotal', 'Pembeli', 'Petugas'],
  profit: ['Tanggal', 'Invoice', 'Total', 'LAZISNU', 'PCNU', 'Petugas', 'Pengelola'],
  officers: ['Petugas', 'Jumlah Transaksi', 'Total Omzet', 'Total Qty', 'Total Bagian Petugas'],
  debt: ['Tanggal', 'Invoice', 'Nama Pengutang', 'Produk', 'Qty', 'Total Transaksi', 'Sudah Dibayar', 'Sisa Piutang', 'Status', 'Jatuh Tempo', 'Catatan', 'Petugas'],
  outsideMoney: ['Produk', 'Nama Pengutang', 'Invoice', 'Tanggal', 'Qty Piutang', 'Harga', 'Total', 'Sudah Dibayar', 'Sisa', 'Status'],
  stock: ['Produk', 'Masuk', 'Terjual', 'Piutang', 'Hilang', 'Sisa']
};

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (payload.syncMode !== 'fullRefresh' || !payload.sheets) {
      return jsonResponse({ success: false, message: 'Payload tidak valid. Deploy Apps Script terbaru dan kirim mode fullRefresh.' });
    }

    const spreadsheet = SPREADSHEET_ID
      ? SpreadsheetApp.openById(SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const sheets = setupSheets(spreadsheet);
    const data = normalizePayloadSheets(payload.sheets);
    const syncedAt = toDate(payload.syncedAt) || new Date();

    refreshDataSheet(sheets.transactions, HEADERS.transactions, data.transactions);
    refreshDataSheet(sheets.detail, HEADERS.detail, data.detail);
    refreshDataSheet(sheets.profit, HEADERS.profit, data.profit);
    refreshDataSheet(sheets.officers, HEADERS.officers, data.officers);
    refreshDataSheet(sheets.debt, HEADERS.debt, data.debt);
    refreshDataSheet(sheets.outsideMoney, HEADERS.outsideMoney, data.outsideMoney);
    refreshDataSheet(sheets.stock, HEADERS.stock, data.stock);

    rebuildDashboardStatistik(sheets.dashboard, data, syncedAt);

    [sheets.transactions, sheets.detail, sheets.profit, sheets.officers, sheets.debt, sheets.outsideMoney, sheets.stock].forEach(formatDataSheet);

    return jsonResponse({
      success: true,
      mode: 'fullRefresh',
      refreshedSheets: Object.keys(SHEETS).length,
      transactionRows: data.transactions.length,
      detailRows: data.detail.length,
      debtRows: data.debt.length,
      stockRows: data.stock.length
    });
  } catch (error) {
    return jsonResponse({ success: false, message: error.message });
  }
}

function setupSheets(spreadsheet) {
  return {
    dashboard: getOrCreateSheet(spreadsheet, SHEETS.dashboard),
    transactions: getOrCreateSheet(spreadsheet, SHEETS.transactions),
    detail: getOrCreateSheet(spreadsheet, SHEETS.detail),
    profit: getOrCreateSheet(spreadsheet, SHEETS.profit),
    officers: getOrCreateSheet(spreadsheet, SHEETS.officers),
    debt: getOrCreateSheet(spreadsheet, SHEETS.debt),
    outsideMoney: getOrCreateSheet(spreadsheet, SHEETS.outsideMoney),
    stock: getOrCreateSheet(spreadsheet, SHEETS.stock)
  };
}

function getOrCreateSheet(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function normalizePayloadSheets(sheets) {
  return {
    transactions: toArray(sheets.rekapTransaksi),
    detail: toArray(sheets.transaksiDetail),
    profit: toArray(sheets.rekapLaba),
    officers: toArray(sheets.rekapPetugas),
    debt: toArray(sheets.piutang),
    outsideMoney: toArray(sheets.uangDiLuar),
    stock: toArray(sheets.stokBarang)
  };
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function refreshDataSheet(sheet, headers, rows) {
  clearSheet(sheet);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows.map(row => headers.map(header => getCellValue(row, header))));
  }
}

function clearSheet(sheet) {
  const filter = sheet.getFilter();
  if (filter) filter.remove();

  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
}

function getCellValue(row, header) {
  const value = row[header] ?? '';

  if (['Tanggal', 'Jatuh Tempo', 'Terakhir Update'].includes(header) && value) {
    return toDate(value) || value;
  }

  return value;
}

function rebuildDashboardStatistik(sheet, data, syncedAt) {
  clearSheet(sheet);

  const summary = buildSummary(data);
  const todayStats = buildPeriodStats(data, new Date(), isSameDay);
  const monthStats = buildPeriodStats(data, new Date(), isSameMonth);
  const topOfficers = buildTopOfficerRows(data.officers);
  const bestSellers = buildBestSellerRows(data.detail);
  const stockRows = data.stock.map(row => [row.Produk, toNumber(row.Masuk), toNumber(row.Terjual), toNumber(row.Piutang), toNumber(row.Hilang), toNumber(row.Sisa)]);
  const outsideRows = data.outsideMoney.map(row => [row.Produk, row['Nama Pengutang'], toNumber(row['Qty Piutang']), toNumber(row.Total), toNumber(row['Sudah Dibayar']), toNumber(row.Sisa), row.Status]);

  sheet.getRange(1, 1, 1, 12).merge().setValue('DASHBOARD STATISTIK PENJUALAN LAZISNU GARUT');
  sheet.getRange(2, 1, 1, 12).merge().setValue('Modul Stikernisasi');
  sheet.getRange(3, 1).setValue('Terakhir Update');
  sheet.getRange(3, 2).setValue(syncedAt);

  writeMetricTable(sheet, 5, 1, 'A. Ringkasan Utama', [
    ['Total Transaksi Sukses', summary.totalSuccessTransactions],
    ['Total Omzet', summary.totalRevenue],
    ['Total Qty Terjual', summary.totalSoldQty],
    ['Total Piutang', summary.totalDebtTransactions],
    ['Uang di Luar', summary.outsideMoney],
    ['Qty Barang Piutang', summary.debtQty],
    ['Jumlah Pengutang', summary.debtorCount],
    ['Petugas dengan Transaksi', summary.activeOfficers]
  ]);

  writeMetricTable(sheet, 5, 5, 'B. Statistik Hari Ini', [
    ['Transaksi Hari Ini', todayStats.successTransactions],
    ['Omzet Hari Ini', todayStats.revenue],
    ['Qty Hari Ini', todayStats.soldQty],
    ['Piutang Hari Ini', todayStats.debtTransactions],
    ['Uang di Luar Hari Ini', todayStats.outsideMoney]
  ]);

  writeMetricTable(sheet, 5, 9, 'C. Statistik Bulan Ini', [
    ['Transaksi Bulan Ini', monthStats.successTransactions],
    ['Omzet Bulan Ini', monthStats.revenue],
    ['Qty Bulan Ini', monthStats.soldQty],
    ['Piutang Bulan Ini', monthStats.debtTransactions],
    ['Uang di Luar Bulan Ini', monthStats.outsideMoney]
  ]);

  writeDataTable(sheet, 17, 1, 'D. Top Petugas', ['Ranking', 'Petugas', 'Jumlah Transaksi Sukses', 'Total Omzet', 'Bagian Petugas'], topOfficers);
  writeDataTable(sheet, 17, 7, 'E. Produk Terlaris', ['Ranking', 'Produk', 'Kategori', 'Ukuran', 'Total Qty Terjual', 'Total Penjualan'], bestSellers);

  const stockStartRow = 17 + Math.max(topOfficers.length, bestSellers.length, 1) + 5;
  writeDataTable(sheet, stockStartRow, 1, 'F. Ringkasan Stok Barang', HEADERS.stock, stockRows);

  const debtStartRow = stockStartRow + Math.max(stockRows.length, 1) + 5;
  writeDataTable(sheet, debtStartRow, 1, 'G. Ringkasan Piutang / Uang di Luar', ['Produk', 'Nama Pengutang', 'Qty', 'Total', 'Sudah Dibayar', 'Sisa', 'Status'], outsideRows);
  formatDashboard(sheet, debtStartRow, outsideRows.length);
}

function buildSummary(data) {
  return {
    totalSuccessTransactions: data.transactions.length,
    totalRevenue: sumRows(data.transactions, 'Total'),
    totalSoldQty: sumRows(data.transactions, 'Qty'),
    totalDebtTransactions: countUnique(data.debt, 'Invoice'),
    outsideMoney: sumRows(data.outsideMoney, 'Sisa'),
    debtQty: sumRows(data.stock, 'Piutang'),
    debtorCount: countUnique(data.debt, 'Nama Pengutang'),
    activeOfficers: data.officers.filter(row => toNumber(row['Jumlah Transaksi']) > 0).length
  };
}

function buildPeriodStats(data, referenceDate, matcher) {
  const successTransactions = data.transactions.filter(row => matcher(row.Tanggal, referenceDate));
  const outsideRows = data.outsideMoney.filter(row => matcher(row.Tanggal, referenceDate));
  const debtRows = data.debt.filter(row => matcher(row.Tanggal, referenceDate));

  return {
    successTransactions: successTransactions.length,
    revenue: sumRows(successTransactions, 'Total'),
    soldQty: sumRows(successTransactions, 'Qty'),
    debtTransactions: countUnique(debtRows, 'Invoice'),
    outsideMoney: sumRows(outsideRows, 'Sisa')
  };
}

function buildTopOfficerRows(rows) {
  return rows
    .slice()
    .sort((a, b) => toNumber(b['Total Omzet']) - toNumber(a['Total Omzet']))
    .map((row, index) => [
      index + 1,
      row.Petugas || '-',
      toNumber(row['Jumlah Transaksi']),
      toNumber(row['Total Omzet']),
      toNumber(row['Total Bagian Petugas'])
    ]);
}

function buildBestSellerRows(rows) {
  const products = rows.reduce((acc, row) => {
    const product = row.Produk || '-';
    const category = row.Kategori || '-';
    const size = row.Ukuran || '-';
    const key = [product, category, size].join('||');

    if (!acc[key]) {
      acc[key] = { product, category, size, qty: 0, sales: 0 };
    }

    acc[key].qty += toNumber(row.Qty);
    acc[key].sales += toNumber(row.Subtotal);

    return acc;
  }, {});

  return Object.values(products)
    .sort((a, b) => (b.qty - a.qty) || (b.sales - a.sales))
    .map((row, index) => [index + 1, row.product, row.category, row.size, row.qty, row.sales]);
}

function writeMetricTable(sheet, startRow, startColumn, title, rows) {
  const width = 3;
  sheet.getRange(startRow, startColumn, 1, width).merge().setValue(title)
    .setBackground(COLORS.emeraldDark)
    .setFontColor(COLORS.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange(startRow + 1, startColumn, 1, width)
    .setValues([['Metrik', 'Nilai', 'Keterangan']])
    .setBackground(COLORS.emeraldSoft)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  const values = rows.map(row => [row[0], row[1], isCurrencyMetric(row[0]) ? 'Rp' : '']);
  sheet.getRange(startRow + 2, startColumn, values.length, width).setValues(values);
  sheet.getRange(startRow, startColumn, values.length + 2, width)
    .setBackground(COLORS.white)
    .setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(startRow, startColumn, 1, width).setBackground(COLORS.emeraldDark);
  sheet.getRange(startRow + 1, startColumn, 1, width).setBackground(COLORS.emeraldSoft);
  sheet.getRange(startRow + 2, startColumn + 1, values.length, 1).setHorizontalAlignment('right');

  rows.forEach((row, index) => {
    const valueCell = sheet.getRange(startRow + 2 + index, startColumn + 1);
    valueCell.setNumberFormat(isCurrencyMetric(row[0]) ? 'Rp #,##0' : '#,##0');
  });
}

function writeDataTable(sheet, startRow, startColumn, title, headers, rows) {
  sheet.getRange(startRow, startColumn, 1, headers.length).merge().setValue(title)
    .setBackground(COLORS.emeraldDark)
    .setFontColor(COLORS.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  sheet.getRange(startRow + 1, startColumn, 1, headers.length).setValues([headers])
    .setBackground(COLORS.emerald)
    .setFontColor(COLORS.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  if (rows.length === 0) {
    sheet.getRange(startRow + 2, startColumn, 1, headers.length).merge().setValue('Belum ada data.');
    sheet.getRange(startRow, startColumn, 3, headers.length).setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
    return;
  }

  sheet.getRange(startRow + 2, startColumn, rows.length, headers.length).setValues(rows);
  sheet.getRange(startRow, startColumn, rows.length + 2, headers.length)
    .setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
}

function formatDashboard(sheet, debtStartRow, debtRowCount) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.setFrozenRows(3);
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, lastRow, 12).setWrap(true).setVerticalAlignment('middle');
  sheet.getRange(1, 1, 1, 12)
    .setBackground(COLORS.emerald)
    .setFontColor(COLORS.white)
    .setFontWeight('bold')
    .setFontSize(16)
    .setHorizontalAlignment('center');
  sheet.getRange(2, 1, 1, 12)
    .setBackground(COLORS.emeraldPale)
    .setFontColor(COLORS.emeraldDark)
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center');
  sheet.getRange(3, 1, 1, 2)
    .setBackground(COLORS.gray)
    .setFontWeight('bold')
    .setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(3, 2).setNumberFormat('dd/MM/yyyy HH:mm');
  sheet.getRange(1, 1, lastRow, 12).setFontFamily('Arial');
  sheet.setRowHeight(1, 38);
  sheet.setRowHeight(2, 26);
  sheet.getRange(19, 1, Math.max(lastRow - 18, 1), 1).setHorizontalAlignment('center');
  sheet.getRange(19, 4, Math.max(lastRow - 18, 1), 2).setNumberFormat('Rp #,##0').setHorizontalAlignment('right');
  sheet.getRange(19, 7, Math.max(lastRow - 18, 1), 1).setHorizontalAlignment('center');
  sheet.getRange(19, 11, Math.max(lastRow - 18, 1), 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
  sheet.getRange(19, 12, Math.max(lastRow - 18, 1), 1).setNumberFormat('Rp #,##0').setHorizontalAlignment('right');

  if (debtRowCount > 0) {
    applyStatusColors(sheet, debtStartRow + 2, 7, debtRowCount);
  }

  for (let column = 1; column <= 12; column += 1) {
    sheet.autoResizeColumn(column);
  }
}

function formatDataSheet(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return;

  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);

  const filter = sheet.getFilter();
  if (filter) filter.remove();

  sheet.getRange(1, 1, lastRow, lastColumn)
    .setFontFamily('Arial')
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, COLORS.border, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(1, 1, 1, lastColumn)
    .setFontWeight('bold')
    .setBackground(COLORS.emerald)
    .setFontColor(COLORS.white)
    .setHorizontalAlignment('center');

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastColumn).setBackground(COLORS.white);
    sheet.getRange(1, 1, lastRow, lastColumn).createFilter();
    applyColumnFormats(sheet);
    applySheetStatusColors(sheet);
  }

  for (let column = 1; column <= lastColumn; column += 1) {
    sheet.autoResizeColumn(column);
  }
}

function applyColumnFormats(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lastRow = Math.max(sheet.getLastRow() - 1, 1);
  const sheetName = sheet.getName();

  headers.forEach((header, index) => {
    const column = index + 1;
    const range = sheet.getRange(2, column, lastRow, 1);
    const isStockSheet = sheetName === SHEETS.stock;
    const isProfitPetugasColumn = header === 'Petugas' && sheetName === SHEETS.profit;
    const isCurrencyColumn = ['Harga', 'Subtotal', 'Total', 'Total Transaksi', 'Sudah Dibayar', 'Sisa Piutang', 'Total Omzet', 'LAZISNU', 'PCNU', 'Pengelola', 'Bagian Petugas', 'Total Bagian Petugas'].includes(header)
      || (header === 'Sisa' && !isStockSheet)
      || isProfitPetugasColumn;
    const isQuantityColumn = ['Qty', 'Qty Piutang', 'Masuk', 'Terjual', 'Piutang', 'Hilang', 'Jumlah Transaksi', 'Total Qty'].includes(header)
      || (header === 'Sisa' && isStockSheet);

    if (['Tanggal', 'Jatuh Tempo', 'Terakhir Update'].includes(header)) {
      range.setNumberFormat('dd/MM/yyyy HH:mm');
    }

    if (isCurrencyColumn) {
      range.setNumberFormat('Rp #,##0').setHorizontalAlignment('right');
    }

    if (isQuantityColumn) {
      range.setNumberFormat('#,##0').setHorizontalAlignment('center');
    }
  });
}

function applySheetStatusColors(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusColumn = headers.findIndex(header => ['Status', 'Status Pembayaran'].includes(header)) + 1;
  if (statusColumn <= 0 || sheet.getLastRow() <= 1) return;

  applyStatusColors(sheet, 2, statusColumn, sheet.getLastRow() - 1);
}

function applyStatusColors(sheet, startRow, statusColumn, rowCount) {
  const values = sheet.getRange(startRow, statusColumn, rowCount, 1).getValues();

  values.forEach((row, index) => {
    const status = String(row[0] || '').toLowerCase();
    const cell = sheet.getRange(startRow + index, statusColumn);

    if (status.includes('lunas') && !status.includes('belum')) {
      cell.setBackground(COLORS.emeraldSoft).setFontColor(COLORS.emeraldDark).setFontWeight('bold');
    } else if (status.includes('dp') || status.includes('sebagian')) {
      cell.setBackground(COLORS.amberSoft).setFontColor('#92400e').setFontWeight('bold');
    } else if (status.includes('belum') || status.includes('pending')) {
      cell.setBackground(COLORS.redSoft).setFontColor(COLORS.red).setFontWeight('bold');
    }
  });
}

function isCurrencyMetric(label) {
  return [
    'Total Omzet',
    'Uang di Luar',
    'Omzet Hari Ini',
    'Uang di Luar Hari Ini',
    'Omzet Bulan Ini',
    'Uang di Luar Bulan Ini'
  ].includes(label);
}

function sumRows(rows, header) {
  return rows.reduce((total, row) => total + toNumber(row[header]), 0);
}

function countUnique(rows, header) {
  return new Set(rows.map(row => row[header]).filter(Boolean)).size;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value instanceof Date || value === null || value === undefined || value === '') return 0;

  const normalized = String(value).trim().replace(/[^0-9,.-]/g, '');
  if (/^-?\d{1,3}(,\d{3})+$/.test(normalized)) return Number(normalized.replace(/,/g, '')) || 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) return Number(normalized.replace(/\./g, '').replace(',', '.')) || 0;

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

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
