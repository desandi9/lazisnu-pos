import { useState, useEffect, useRef, createContext, useContext } from 'react';
import logoWhite from './assets/LOGO LAZISNU PUTIH.png';
import logoColor from './assets/LOGO LAZISNU WARNA.png';
import { checkDatabaseConnection } from './services/database/dbHealthService';
import { migrateLocalDataToSupabase } from './services/database/dbMigrationService';
import {
  checkProductHasTransactions,
  createProductInDb,
  deleteProductFromDb,
  setProductActiveInDb,
  syncProductsCacheFromDb,
  updateProductInDb,
  updateProductStockInDb
} from './services/database/dbProductService';
import {
  createUserInDb,
  deleteUserFromDb,
  getUserByUsernameFromDb,
  setUserStatusInDb,
  syncUsersCacheFromDb,
  checkUserHasTransactions,
  updateUserInDb
} from './services/database/dbUserService';
import {
  createTransactionInDb,
  syncTransactionsCacheFromDb,
  updateTransactionSyncStatusInDb
} from './services/database/dbTransactionService';
import {
  syncProfitSharingSettingsCacheFromDb,
  upsertProfitSharingSettingsToDb
} from './services/database/dbProfitSharingService';
import { 
  User, ArrowRight, LayoutDashboard, 
  Package, ShoppingCart, FileText, Database, 
  LogOut, Plus, Edit2, Trash2, AlertTriangle, CheckCircle2, 
  Printer, X, Menu, RefreshCcw, Info, Sun, Moon, Receipt, PieChart, Download, Settings, Eye, EyeOff
} from 'lucide-react';

// ============================================================================
// 1. DATABASE SERVICE (Local Storage Wrapper for Core MVP)
// ============================================================================

const PRODUCT_CATEGORIES = [
  { value: 'Kecil (S)', label: 'Kecil (S)', code: 'S' },
  { value: 'Sedang (M)', label: 'Sedang (M)', code: 'M' },
  { value: 'Besar (L)', label: 'Besar (L)', code: 'L' }
];

const USER_ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin/Petugas' }
];

const USER_STATUSES = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' }
];

const DEFAULT_PROFIT_SHARING_SETTINGS = {
  lazisnuPercent: 30,
  pcnuPercent: 30,
  petugasPercent: 30,
  pengelolaPercent: 10,
  updatedAt: new Date().toISOString()
};

const DEFAULT_SPREADSHEET_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyUVM73eneSjztaRzpFAWGkO7fBur5TUZl4Z6h1dnRKDtyVqKqap9jQ4jshxHlUOaeE/exec';

const DEFAULT_USERS = [
  { id: 'U-001', name: 'Owner Lazisnu', username: 'owner', password: 'owner123', role: 'owner', status: 'active' },
  { id: 'U-002', name: 'Syahrul Hardiansyah', username: 'syahrul', password: 'admin123', role: 'admin', status: 'active' },
  { id: 'U-003', name: 'Desandi', username: 'desandi', password: 'admin123', role: 'admin', status: 'active' },
  { id: 'U-004', name: 'Abdullah Hasyim', username: 'abdullah', password: 'admin123', role: 'admin', status: 'active' },
  { id: 'U-005', name: 'Yogi Saputra ZA', username: 'yogi', password: 'admin123', role: 'admin', status: 'active' },
  { id: 'U-006', name: 'M. Nurhaikal S', username: 'nurhaikal', password: 'admin123', role: 'admin', status: 'active' },
  { id: 'U-007', name: 'Diki Ahmad', username: 'diki', password: 'admin123', role: 'admin', status: 'active' }
].map(user => ({ ...user, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

const getCategoryCode = (category) => PRODUCT_CATEGORIES.find(item => item.value === category)?.code || '-';
const PRODUCT_CATEGORY_ORDER = PRODUCT_CATEGORIES.reduce((acc, item, index) => {
  acc[item.value] = index;
  return acc;
}, {});
const sortProductsByCategory = (products) => products.slice().sort((a, b) => {
  const categoryA = PRODUCT_CATEGORY_ORDER[a.category] ?? 99;
  const categoryB = PRODUCT_CATEGORY_ORDER[b.category] ?? 99;

  if (categoryA !== categoryB) return categoryA - categoryB;

  const nameCompare = (a.name || '').localeCompare(b.name || '', 'id-ID', { sensitivity: 'base' });
  if (nameCompare !== 0) return nameCompare;

  return (a.size || '').localeCompare(b.size || '', 'id-ID', { sensitivity: 'base' });
});
const normalizeProductSize = (size) => {
  const trimmedSize = String(size || '').trim().replace(/\s+/g, ' ');

  if (!trimmedSize) return '';
  if (/^\d+(?:[.,]\d+)?$/u.test(trimmedSize)) return `${trimmedSize.replace(',', '.')} cm`;
  if (/^\d+(?:[.,]\d+)?\s*cm$/iu.test(trimmedSize)) return `${trimmedSize.replace(/\s*cm$/iu, '').replace(',', '.')} cm`;

  return trimmedSize;
};
const getRoleLabel = (role) => USER_ROLES.find(item => item.value === role)?.label || '-';
const getStatusLabel = (status) => USER_STATUSES.find(item => item.value === status)?.label || '-';
const getTransactionPrice = (tx) => tx.priceSnapshot ?? tx.price ?? 0;
const getTransactionItems = (tx) => {
  if (Array.isArray(tx.items) && tx.items.length > 0) {
    return tx.items.map(item => {
      const price = Number(item.priceSnapshot ?? item.price_snapshot ?? item.price ?? 0);
      const qty = Number(item.qty || item.quantity || 0);

      return {
        id: item.id || item.dbId || item.productId || item.product_id || null,
        productId: item.productId || item.product_id || null,
        productNameSnapshot: item.productNameSnapshot || item.product_name_snapshot || item.name || item.productName || '-',
        productCategorySnapshot: item.productCategorySnapshot || item.product_category_snapshot || item.category || item.productCategory || '-',
        productSizeSnapshot: item.productSizeSnapshot || item.product_size_snapshot || item.size || item.productSize || '-',
        priceSnapshot: price,
        qty,
        subtotal: Number(item.subtotal ?? (price * qty))
      };
    });
  }

  const price = getTransactionPrice(tx);
  const qty = Number(tx.qty || tx.quantity || 0);

  return [{
    id: tx.productId || tx.product_id || null,
    productId: tx.productId || tx.product_id || null,
    productNameSnapshot: tx.productNameSnapshot || tx.product_name_snapshot || tx.productName || tx.name || '-',
    productCategorySnapshot: tx.productCategorySnapshot || tx.product_category_snapshot || tx.productCategory || tx.category || '-',
    productSizeSnapshot: tx.productSizeSnapshot || tx.product_size_snapshot || tx.productSize || tx.size || '-',
    priceSnapshot: price,
    qty,
    subtotal: Number(tx.total || (price * qty))
  }];
};
const getTransactionProductCategory = (tx) => getTransactionItems(tx)[0]?.productCategorySnapshot || '-';
const getTransactionProductSize = (tx) => getTransactionItems(tx)[0]?.productSizeSnapshot || '-';
const getTransactionTotalQty = (tx) => getTransactionItems(tx).reduce((total, item) => total + (item.qty || 0), 0);
const getTransactionProductSummary = (tx) => {
  const items = getTransactionItems(tx);

  if (items.length === 1) return items[0].productNameSnapshot;
  if (items.length === 2) return items.map(item => item.productNameSnapshot).join(', ');

  return `${items[0].productNameSnapshot}, ${items[1].productNameSnapshot}, +${items.length - 2}`;
};
const getTransactionOfficerName = (tx) => tx.namaPetugasSnapshot || '-';
const getTransactionOfficerRole = (tx) => tx.roleSnapshot || '-';
const getTransactionProfitPercent = (tx, key) => tx[`${key}PercentSnapshot`] ?? 0;
const getTransactionProfitAmount = (tx, key) => tx[`${key}Amount`] ?? 0;

const calculateProfitSharing = (total, settings) => ({
  lazisnuPercentSnapshot: settings.lazisnuPercent,
  pcnuPercentSnapshot: settings.pcnuPercent,
  petugasPercentSnapshot: settings.petugasPercent,
  pengelolaPercentSnapshot: settings.pengelolaPercent,
  lazisnuAmount: Math.round(total * settings.lazisnuPercent / 100),
  pcnuAmount: Math.round(total * settings.pcnuPercent / 100),
  petugasAmount: Math.round(total * settings.petugasPercent / 100),
  pengelolaAmount: Math.round(total * settings.pengelolaPercent / 100)
});

const normalizeUser = (user, index = 0) => {
  const now = new Date().toISOString();

  return {
    id: user.id || `U-${String(index + 1).padStart(3, '0')}`,
    name: user.name || user.username || 'Pengguna',
    username: user.username || '',
    password: user.password || '',
    role: USER_ROLES.some(item => item.value === user.role) ? user.role : 'admin',
    status: USER_STATUSES.some(item => item.value === user.status) ? user.status : 'active',
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || user.createdAt || now
  };
};

const toCurrentUser = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  role: user.role,
  status: user.status
});

const SEED_DATA = {
  users: DEFAULT_USERS,
  products: [
    { id: 'P-001', name: 'Stiker Donasi Lazisnu (Kecil)', category: 'Kecil (S)', size: '10 x 15 cm', price: 10000, stock: 50, minStock: 10, isActive: true, createdAt: new Date().toISOString() },
    { id: 'P-002', name: 'Stiker Donasi Lazisnu (Besar)', category: 'Besar (L)', size: '20 x 30 cm', price: 25000, stock: 15, minStock: 20, isActive: true, createdAt: new Date().toISOString() }
  ],
  transactions: []
};

class DatabaseService {
  constructor() {
    this.prefix = 'lazisnu_core_';
    this.init();
  }

  init() {
    this.initUsers();
    if (!localStorage.getItem(this.prefix + 'products')) localStorage.setItem(this.prefix + 'products', JSON.stringify(SEED_DATA.products));
    if (!localStorage.getItem(this.prefix + 'transactions')) localStorage.setItem(this.prefix + 'transactions', JSON.stringify(SEED_DATA.transactions));
    if (!localStorage.getItem(this.prefix + 'profitSharingSettings')) localStorage.setItem(this.prefix + 'profitSharingSettings', JSON.stringify(DEFAULT_PROFIT_SHARING_SETTINGS));
  }

  initUsers() {
    const usersKey = this.prefix + 'users';
    const storedUsers = localStorage.getItem(usersKey);

    if (!storedUsers) {
      localStorage.setItem(usersKey, JSON.stringify(SEED_DATA.users));
      return;
    }

    const normalizedUsers = JSON.parse(storedUsers).map(normalizeUser).filter(user => user.username);
    const mergedUsers = [...normalizedUsers];

    DEFAULT_USERS.forEach(defaultUser => {
      if (!mergedUsers.some(user => user.username === defaultUser.username)) {
        let candidateId = defaultUser.id;
        let nextNumber = mergedUsers.length + 1;

        while (mergedUsers.some(user => user.id === candidateId)) {
          candidateId = `U-${String(nextNumber).padStart(3, '0')}`;
          nextNumber++;
        }

        mergedUsers.push({ ...defaultUser, id: candidateId });
      }
    });

    localStorage.setItem(usersKey, JSON.stringify(mergedUsers));
  }

  _get(table) { return JSON.parse(localStorage.getItem(this.prefix + table) || '[]'); }
  _set(table, data) { localStorage.setItem(this.prefix + table, JSON.stringify(data)); }

  getProfitSharingSettings() {
    return { ...DEFAULT_PROFIT_SHARING_SETTINGS, ...(JSON.parse(localStorage.getItem(this.prefix + 'profitSharingSettings') || '{}')) };
  }

  saveProfitSharingSettings(settings) {
    const nextSettings = {
      lazisnuPercent: Number(settings.lazisnuPercent),
      pcnuPercent: Number(settings.pcnuPercent),
      petugasPercent: Number(settings.petugasPercent),
      pengelolaPercent: Number(settings.pengelolaPercent),
      updatedAt: new Date().toISOString()
    };

    if (Object.values(nextSettings).slice(0, 4).some(value => Number.isNaN(value) || value < 0)) {
      throw new Error('Semua persentase harus angka 0 atau lebih.');
    }

    const totalPercent = nextSettings.lazisnuPercent + nextSettings.pcnuPercent + nextSettings.petugasPercent + nextSettings.pengelolaPercent;

    if (totalPercent !== 100) {
      throw new Error('Total pembagian laba harus 100%.');
    }

    localStorage.setItem(this.prefix + 'profitSharingSettings', JSON.stringify(nextSettings));
    return nextSettings;
  }

  getUsers() { return this._get('users').map(normalizeUser); }

  ensureActiveOwner(users) {
    if (!users.some(user => user.role === 'owner' && user.status === 'active')) {
      throw new Error('Minimal harus ada 1 owner aktif.');
    }
  }

  saveUser(userData) {
    const users = this.getUsers();
    const now = new Date().toISOString();
    const username = userData.username.trim().toLowerCase();
    const existingIndex = users.findIndex(user => user.id === userData.id);

    if (users.some(user => user.username.toLowerCase() === username && user.id !== userData.id)) {
      throw new Error('Username sudah digunakan.');
    }

    if (existingIndex >= 0) {
      users[existingIndex] = {
        ...users[existingIndex],
        name: userData.name.trim(),
        username,
        password: userData.password || users[existingIndex].password,
        role: userData.role,
        status: userData.status,
        updatedAt: now
      };
    } else {
      users.push({
        id: `U-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        name: userData.name.trim(),
        username,
        password: userData.password,
        role: userData.role,
        status: userData.status,
        createdAt: now,
        updatedAt: now
      });
    }

    this.ensureActiveOwner(users);
    this._set('users', users);
  }

  setUserStatus(id, status) {
    const users = this.getUsers().map(user => user.id === id ? { ...user, status, updatedAt: new Date().toISOString() } : user);

    this.ensureActiveOwner(users);
    this._set('users', users);
  }

  deleteUser(id) {
    const users = this.getUsers().filter(user => user.id !== id);

    this.ensureActiveOwner(users);
    this._set('users', users);
  }

  login(username, password, role) {
    const users = this.getUsers();
    const user = users.find(u => u.username === username.trim().toLowerCase() && u.password === password && u.role === role);

    if (!user) {
      throw new Error('Username, password, atau role salah.');
    }

    if (user.status !== 'active') {
      throw new Error('User nonaktif tidak bisa login.');
    }

    return toCurrentUser(user);
  }

  getProducts() { return this._get('products'); }
  
  saveProduct(product) {
    const products = this.getProducts();
    const existingIndex = products.findIndex(p => p.id === product.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      products[existingIndex] = { ...products[existingIndex], ...product, updatedAt: now };
    } else {
      products.push({ ...product, id: `P-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`, createdAt: now, updatedAt: now });
    }
    this._set('products', products);
  }

  deleteProduct(id) {
    const products = this.getProducts();
    this._set('products', products.filter(p => p.id !== id));
  }

  getTransactions() { return this._get('transactions'); }

  setTransactions(transactions) { this._set('transactions', transactions); }

  buildTransaction(txData) {
    const products = this.getProducts();
    const requestedItems = Array.isArray(txData.items) && txData.items.length > 0
      ? txData.items
      : [{ productId: txData.productId, qty: txData.qty }];
    const items = requestedItems.map(item => {
      const productIndex = products.findIndex(p => p.id === item.productId);

      if (productIndex === -1) throw new Error('Produk tidak ditemukan.');

      const selectedProduct = products[productIndex];
      const qty = Number(item.qty) || 0;

      if (qty < 1) throw new Error('Qty tidak valid.');
      if (selectedProduct.stock < qty) throw new Error('Stok tidak mencukupi.');

      const priceSnapshot = Number(selectedProduct.price) || 0;

      return {
        productIndex,
        productId: selectedProduct.id,
        productNameSnapshot: selectedProduct.name || '-',
        productCategorySnapshot: selectedProduct.category || '-',
        productSizeSnapshot: selectedProduct.size || '-',
        priceSnapshot,
        qty,
        subtotal: priceSnapshot * qty
      };
    });
    const totalRequestedByProduct = items.reduce((acc, item) => {
      acc[item.productId] = (acc[item.productId] || 0) + item.qty;
      return acc;
    }, {});

    Object.entries(totalRequestedByProduct).forEach(([productId, totalQty]) => {
      const product = products.find(p => p.id === productId);
      if (!product || product.stock < totalQty) throw new Error('Stok tidak mencukupi.');
    });

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const profitSharing = calculateProfitSharing(total, this.getProfitSharingSettings());
    const firstItem = items[0];

    return {
      id: `TX-${Date.now()}`,
      date: new Date().toISOString(),
      buyerName: txData.buyerName || 'Hamba Allah',
      productId: firstItem.productId,
      productName: firstItem.productNameSnapshot,
      productNameSnapshot: firstItem.productNameSnapshot,
      productCategorySnapshot: firstItem.productCategorySnapshot,
      productSizeSnapshot: firstItem.productSizeSnapshot,
      price: firstItem.priceSnapshot,
      priceSnapshot: firstItem.priceSnapshot,
      petugasId: txData.petugasId || null,
      namaPetugasSnapshot: txData.namaPetugasSnapshot || '-',
      roleSnapshot: txData.roleSnapshot || '-',
      qty: items.reduce((sum, item) => sum + item.qty, 0),
      items: items.map(item => {
        const transactionItem = { ...item };
        delete transactionItem.productIndex;
        return transactionItem;
      }),
      total,
      paymentMethod: txData.paymentMethod || 'Tunai',
      notes: txData.notes || '',
      ...profitSharing,
      syncStatus: 'pending',
      syncedAt: null
    };
  }

  addTransaction(txData) {
    const products = this.getProducts();
    const requestedItems = Array.isArray(txData.items) && txData.items.length > 0
      ? txData.items
      : [{ productId: txData.productId, qty: txData.qty }];
    const items = requestedItems.map(item => {
      const productIndex = products.findIndex(p => p.id === item.productId);

      if (productIndex === -1) throw new Error('Produk tidak ditemukan.');

      const selectedProduct = products[productIndex];
      const qty = Number(item.qty) || 0;

      if (qty < 1) throw new Error('Qty tidak valid.');
      if (selectedProduct.stock < qty) throw new Error('Stok tidak mencukupi.');

      const priceSnapshot = Number(selectedProduct.price) || 0;

      return {
        productIndex,
        productId: selectedProduct.id,
        productNameSnapshot: selectedProduct.name || '-',
        productCategorySnapshot: selectedProduct.category || '-',
        productSizeSnapshot: selectedProduct.size || '-',
        priceSnapshot,
        qty,
        subtotal: priceSnapshot * qty
      };
    });
    const totalRequestedByProduct = items.reduce((acc, item) => {
      acc[item.productId] = (acc[item.productId] || 0) + item.qty;
      return acc;
    }, {});

    Object.entries(totalRequestedByProduct).forEach(([productId, totalQty]) => {
      const product = products.find(p => p.id === productId);
      if (!product || product.stock < totalQty) throw new Error('Stok tidak mencukupi.');
    });

    items.forEach(item => {
      products[item.productIndex].stock -= item.qty;
      if (products[item.productIndex].stock <= 0) {
        products[item.productIndex].stock = 0;
        products[item.productIndex].isActive = false;
      }
    });
    this._set('products', products);

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const profitSharing = calculateProfitSharing(total, this.getProfitSharingSettings());
    const firstItem = items[0];

    const newTx = {
      id: `TX-${Date.now()}`,
      date: new Date().toISOString(),
      buyerName: txData.buyerName || 'Hamba Allah',
      productId: firstItem.productId,
      productName: firstItem.productNameSnapshot,
      productNameSnapshot: firstItem.productNameSnapshot,
      productCategorySnapshot: firstItem.productCategorySnapshot,
      productSizeSnapshot: firstItem.productSizeSnapshot,
      price: firstItem.priceSnapshot,
      priceSnapshot: firstItem.priceSnapshot,
      petugasId: txData.petugasId || null,
      namaPetugasSnapshot: txData.namaPetugasSnapshot || '-',
      roleSnapshot: txData.roleSnapshot || '-',
      qty: items.reduce((sum, item) => sum + item.qty, 0),
      items: items.map(item => {
        const transactionItem = { ...item };
        delete transactionItem.productIndex;
        return transactionItem;
      }),
      total: total,
      paymentMethod: txData.paymentMethod || 'Tunai',
      notes: txData.notes || '',
      ...profitSharing,
      syncStatus: 'pending',
      syncedAt: null
    };
    
    const transactions = this.getTransactions();
    transactions.unshift(newTx);
    this._set('transactions', transactions);
    
    return newTx;
  }

  getPendingSyncs() {
    return this.getTransactions().filter(t => t.syncStatus === 'pending');
  }

  getSpreadsheetUrl() {
    return this.getCustomSpreadsheetUrl() || DEFAULT_SPREADSHEET_WEB_APP_URL;
  }

  getCustomSpreadsheetUrl() {
    return localStorage.getItem(this.prefix + 'googleAppsScriptUrl') || '';
  }

  saveSpreadsheetUrl(url) {
    localStorage.setItem(this.prefix + 'googleAppsScriptUrl', url.trim());
  }

  resetSpreadsheetUrl() {
    localStorage.removeItem(this.prefix + 'googleAppsScriptUrl');
    return this.getSpreadsheetUrl();
  }

  exportBackupData() {
    return {
      exportedAt: new Date().toISOString(),
      app: 'LAZISNU Garut POS',
      version: '1.0',
      users: this.getUsers(),
      products: this.getProducts(),
      transactions: this.getTransactions(),
      profitSharingSettings: this.getProfitSharingSettings(),
      lastSync: localStorage.getItem('lazisnu_last_sync_core') || null,
      spreadsheetUrl: this.getSpreadsheetUrl()
    };
  }

  getSpreadsheetRows(transactions, syncedAt) {
    return transactions.flatMap(tx => getTransactionItems(tx).map(item => ({
      'No. Transaksi': tx.id,
      Tanggal: tx.date,
      Pembeli: tx.buyerName || 'Hamba Allah',
      Petugas: getTransactionOfficerName(tx),
      Role: getTransactionOfficerRole(tx),
      Produk: item.productNameSnapshot,
      Kategori: item.productCategorySnapshot,
      Ukuran: item.productSizeSnapshot,
      Qty: item.qty || 0,
      Harga: item.priceSnapshot || 0,
      Subtotal: item.subtotal || 0,
      'Total Transaksi': tx.total || 0,
      Metode: tx.paymentMethod || '-',
      Catatan: tx.notes || '',
      'Status Sync': tx.syncStatus || 'pending',
      '% LAZISNU': getTransactionProfitPercent(tx, 'lazisnu'),
      'Rp LAZISNU': getTransactionProfitAmount(tx, 'lazisnu'),
      '% PCNU': getTransactionProfitPercent(tx, 'pcnu'),
      'Rp PCNU': getTransactionProfitAmount(tx, 'pcnu'),
      '% Petugas': getTransactionProfitPercent(tx, 'petugas'),
      'Rp Petugas': getTransactionProfitAmount(tx, 'petugas'),
      '% Pengelola': getTransactionProfitPercent(tx, 'pengelola'),
      'Rp Pengelola': getTransactionProfitAmount(tx, 'pengelola'),
      'Waktu Sync': syncedAt
    })));
  }

  async syncToSpreadsheet(webAppUrl) {
    const endpoint = (webAppUrl || this.getSpreadsheetUrl()).trim();

    if (!endpoint) throw new Error('Masukkan URL Google Apps Script terlebih dahulu.');

    try {
      const parsedUrl = new URL(endpoint);
      if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.pathname.endsWith('/exec')) {
        throw new Error('URL Google Apps Script tidak valid. Pastikan memakai URL Web App yang diakhiri /exec.');
      }
    } catch (error) {
      if (error.message.includes('URL Google Apps Script')) throw error;
      throw new Error('URL Google Apps Script tidak valid. Periksa kembali URL Web App yang ditempel.', { cause: error });
    }

    const transactions = this.getTransactions();
    const pendingTransactions = transactions.filter(tx => tx.syncStatus === 'pending');

    if (pendingTransactions.length === 0) {
      return { success: true, message: 'Tidak ada transaksi baru untuk disinkronkan.', count: 0, rows: 0 };
    }

    const now = new Date().toISOString();
    const rowsToSync = this.getSpreadsheetRows(pendingTransactions, now);

    if (rowsToSync.length === 0) throw new Error('Tidak ada data transaksi yang bisa dikirim.');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ rows: rowsToSync })
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error('Apps Script gagal memproses data. Periksa deployment Web App dan izin aksesnya.');
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (error) {
        throw new Error('Response Spreadsheet tidak valid. Pastikan URL Web App Apps Script benar.', { cause: error });
      }

      if (!result.success) throw new Error(result.message || 'Apps Script mengembalikan status gagal. Periksa log Apps Script.');

      const pendingIds = new Set(pendingTransactions.map(tx => tx.id));
      const updatedTransactions = transactions.map(tx => pendingIds.has(tx.id) ? { ...tx, syncStatus: 'synced', syncedAt: now } : tx);

      this._set('transactions', updatedTransactions);
      return { success: true, message: `${pendingTransactions.length} transaksi berhasil ditambahkan ke Spreadsheet.`, count: pendingTransactions.length, rows: rowsToSync.length, syncedAt: now };
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Gagal menghubungi Spreadsheet. Periksa URL atau koneksi internet.', { cause: error });
      }

      throw error;
    }
  }
}

const db = new DatabaseService();
const THEME_STORAGE_KEY = 'lazisnu_theme_core';
const SESSION_STORAGE_KEY = 'lazisnu_current_user_session';
const LAST_VIEW_STORAGE_KEY = 'lazisnu_last_view_session';
const LEGACY_SESSION_STORAGE_KEY = 'lazisnu_current_user';
const LEGACY_LAST_VIEW_STORAGE_KEY = 'lazisnu_last_view';
const LAST_BACKGROUND_STORAGE_KEY = 'lazisnu_last_background_at';
const RESTORABLE_VIEWS = ['dashboard', 'sales', 'products', 'reports', 'users', 'profit-settings', 'spreadsheet'];
const INTERNAL_HISTORY_VIEWS = ['dashboard', 'products', 'sales', 'reports', 'spreadsheet', 'invoice', 'users', 'profit-settings'];

const applyTheme = (theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
};

const getInitialTheme = () => {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;

  localStorage.setItem(THEME_STORAGE_KEY, 'dark');
  return 'dark';
};

const clearStoredSession = () => {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(LAST_VIEW_STORAGE_KEY);
  localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_LAST_VIEW_STORAGE_KEY);
  localStorage.removeItem(LAST_BACKGROUND_STORAGE_KEY);
};

const storeSessionUser = (user) => {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toCurrentUser(user)));
};

const migrateLegacySession = () => {
  if (!sessionStorage.getItem(SESSION_STORAGE_KEY)) {
    const legacyUser = localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
    if (legacyUser) sessionStorage.setItem(SESSION_STORAGE_KEY, legacyUser);
  }

  if (!sessionStorage.getItem(LAST_VIEW_STORAGE_KEY)) {
    const legacyView = localStorage.getItem(LEGACY_LAST_VIEW_STORAGE_KEY);
    if (legacyView) sessionStorage.setItem(LAST_VIEW_STORAGE_KEY, legacyView);
  }

  localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_LAST_VIEW_STORAGE_KEY);
  localStorage.removeItem(LAST_BACKGROUND_STORAGE_KEY);
};

const isRestorableView = (view, user) => {
  if (!RESTORABLE_VIEWS.includes(view)) return false;
  if (['users', 'profit-settings'].includes(view) && user?.role !== 'owner') return false;

  return true;
};

const getSafeRestoredView = (user) => {
  const storedView = sessionStorage.getItem(LAST_VIEW_STORAGE_KEY);

  return isRestorableView(storedView, user) ? storedView : 'dashboard';
};

const validateStoredUser = (storedUser) => {
  if (!storedUser?.id || !storedUser?.username || !storedUser?.role) return null;

  const activeUser = db.getUsers().find(item =>
    item.id === storedUser.id
    && item.username === storedUser.username
    && item.role === storedUser.role
    && item.status === 'active'
  );

  return activeUser ? toCurrentUser(activeUser) : null;
};

const getInitialSessionState = () => {
  try {
    migrateLegacySession();

    const storedUser = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || 'null');

    if (!storedUser?.id || !storedUser?.username || !storedUser?.role) {
      clearStoredSession();
      return { user: null, view: 'welcome' };
    }

    const safeUser = toCurrentUser(storedUser);
    storeSessionUser(safeUser);
    return { user: safeUser, view: getSafeRestoredView(safeUser) };
  } catch {
    clearStoredSession();
    return { user: null, view: 'welcome' };
  }
};

const validateStoredUserWithDbFallback = async (storedUser) => {
  const health = await checkDatabaseConnection();

  if (health.status === 'connected') {
    const dbResult = await getUserByUsernameFromDb(storedUser?.username);
    if (!dbResult.success) return null;

    const dbUser = dbResult.data;

    if (dbUser && (dbUser.id === storedUser.id || dbUser.username === storedUser.username) && dbUser.role === storedUser.role && dbUser.status === 'active') {
      storeSessionUser(dbUser);
      return toCurrentUser(dbUser);
    }

    return null;
  }

  return validateStoredUser(storedUser);
};

const loginWithDbFallback = async (username, password, role) => {
  const normalizedUsername = username.trim().toLowerCase();
  const health = await checkDatabaseConnection();

  if (health.status === 'connected') {
    const dbResult = await getUserByUsernameFromDb(normalizedUsername);
    if (!dbResult.success) throw new Error('Gagal membaca user dari database.');

    const user = dbResult.data;

    if (!user || user.role !== role) throw new Error('User tidak ditemukan di database.');
    if (user.password !== password) throw new Error('Password salah.');
    if (user.status !== 'active') throw new Error('Akun tidak aktif.');

    await syncUsersCacheFromDb();

    return { user: toCurrentUser(user), source: 'database' };
  }

  const localUser = db.login(normalizedUsername, password, role);
  return { user: localUser, source: 'local' };
};

const refreshTransactionsCacheWithFallback = async () => {
  const result = await syncTransactionsCacheFromDb();
  if (result.success) return { data: result.data, source: 'database' };

  return { data: db.getTransactions(), source: 'local', status: result.status, error: result.error };
};

const syncCoreCachesFromDb = async () => {
  const health = await checkDatabaseConnection();
  if (health.status !== 'connected') return { success: false, status: health.status };

  const [users, products, transactions, profitSettings] = await Promise.all([
    syncUsersCacheFromDb(),
    syncProductsCacheFromDb(),
    syncTransactionsCacheFromDb(),
    syncProfitSharingSettingsCacheFromDb()
  ]);

  const results = [users, products, transactions, profitSettings];
  const failedResult = results.find(result => !result.success);
  if (failedResult) return { success: false, status: failedResult.status || 'error', error: failedResult.error };

  return { success: true, status: 'connected' };
};

// ============================================================================
// 2. CONTEXT & STATE MANAGEMENT
// ============================================================================
const AppContext = createContext();

// ============================================================================
// 3. REUSABLE UI COMPONENTS (Mobile Optimized)
// ============================================================================

const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'success' ? 'bg-emerald-600' : 'bg-red-600';
  const Icon = type === 'success' ? CheckCircle2 : AlertTriangle;

  return (
    <div className={`fixed bottom-8 left-4 right-4 md:left-auto md:right-8 md:bottom-8 ${bg} text-white px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 animate-fade-in-up font-medium text-sm md:text-base tracking-wide`}>
      <Icon size={22} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 hover:bg-white/20 p-2 rounded-full transition-colors shrink-0"><X size={18} /></button>
    </div>
  );
};

const SplashScreen = () => (
  <div className="min-h-[100dvh] bg-[#020617] text-white flex items-center justify-center px-6 overflow-hidden relative">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(5,150,105,0.24),transparent_34%),radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.14),transparent_28%)]" />
    <div className="absolute w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl animate-pulse" />
    <div className="relative z-10 flex flex-col items-center text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-[2rem] bg-emerald-400/25 blur-2xl animate-pulse" />
        <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-[2rem] bg-white/95 border border-emerald-300/30 shadow-2xl shadow-emerald-950/40 p-3 flex items-center justify-center">
          <img src="/app-icon.png" alt="LAZISNU POS" className="w-full h-full object-contain" />
        </div>
      </div>
      <h1 className="text-3xl md:text-4xl font-black tracking-tight">LAZISNU POS</h1>
      <p className="mt-2 text-sm md:text-base font-medium text-emerald-100/80">Aplikasi Penjualan LAZISNU Garut</p>
      <div className="mt-8 flex items-center gap-2" aria-label="Memuat aplikasi">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.2s]" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-bounce [animation-delay:-0.1s]" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-200 animate-bounce" />
      </div>
    </div>
  </div>
);

const Button = ({ children, variant = 'primary', className = '', isLoading, ...props }) => {
  // Mobile touch target min-height: 48px
  const base = "inline-flex items-center justify-center gap-2 px-5 py-3 md:py-2.5 min-h-[48px] md:min-h-[44px] text-base md:text-sm font-bold transition-all rounded-xl disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-900/20",
    secondary: "bg-white dark:bg-[#131b2f] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm",
    danger: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/20",
    ghost: "bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={isLoading || props.disabled} {...props}>
      {isLoading ? <RefreshCcw className="animate-spin" size={20} /> : null}
      {children}
    </button>
  );
};

const Input = ({ label, error, readOnly, className = '', ...props }) => (
  <div className="space-y-2">
    {label && <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</label>}
    <input 
      readOnly={readOnly}
      className={`w-full bg-white dark:bg-[#0a0f1c] border ${error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'} rounded-xl px-4 py-3 min-h-[48px] text-base md:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors ${readOnly ? 'bg-slate-50 dark:bg-[#131b2f] text-slate-500 dark:text-slate-400 cursor-not-allowed' : ''} ${className}`}
      {...props}
    />
    {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
  </div>
);

const PasswordInput = ({ label, error, readOnly, className = '', ...props }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</label>}
      <div className="relative">
        <input
          type={isVisible ? 'text' : 'password'}
          readOnly={readOnly}
          className={`w-full bg-white dark:bg-[#0a0f1c] border ${error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'} rounded-xl pl-4 pr-14 py-3 min-h-[48px] text-base md:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors ${readOnly ? 'bg-slate-50 dark:bg-[#131b2f] text-slate-500 dark:text-slate-400 cursor-not-allowed' : ''} ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setIsVisible(prev => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={isVisible ? 'Sembunyikan password' : 'Lihat password'}
        >
          {isVisible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
};

const Select = ({ label, options, error, ...props }) => (
  <div className="space-y-2">
    {label && <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</label>}
    <select 
      className={`w-full bg-white dark:bg-[#0a0f1c] border ${error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'} rounded-xl px-4 py-3 min-h-[48px] text-base md:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors appearance-none`}
      {...props}
    >
      <option value="" disabled>Pilih opsi...</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
  </div>
);

const Card = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-[#111828] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-sm ${className}`}>
    {children}
  </div>
);

const LazisnuLogo = ({ variant = 'color', size = 'md', className = '' }) => {
  const sizes = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-20 md:h-24'
  };

  return (
    <img
      src={variant === 'white' ? logoWhite : logoColor}
      alt="LAZISNU Garut"
      className={`${sizes[size]} w-auto max-w-full object-contain ${className}`}
    />
  );
};

const formatRp = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);
const formatDateTimeId = (value) => value ? new Date(value).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};
const parseDateInput = (value, endOfDay = false) => {
  if (!value) return null;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
};
const startOfLocalDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
const endOfLocalDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const getWeekBounds = (date) => {
  const start = startOfLocalDay(date);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  start.setDate(start.getDate() + diffToMonday);

  const end = endOfLocalDay(start);
  end.setDate(start.getDate() + 6);

  return { start, end };
};
const getMonthBounds = (date) => ({
  start: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0),
  end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
});
const getPeriodBounds = (periodFilter, customStartDate, customEndDate) => {
  const now = new Date();

  if (periodFilter === 'today') return { start: startOfLocalDay(now), end: endOfLocalDay(now), label: 'Hari Ini' };
  if (periodFilter === 'week') return { ...getWeekBounds(now), label: 'Minggu Ini' };
  if (periodFilter === 'month') return { ...getMonthBounds(now), label: 'Bulan Ini' };
  if (periodFilter === 'custom') {
    const start = parseDateInput(customStartDate);
    const end = parseDateInput(customEndDate, true);

    if (start && end) {
      return {
        start,
        end,
        label: `${start.toLocaleDateString('id-ID')} - ${end.toLocaleDateString('id-ID')}`
      };
    }

    return { start: new Date(0), end: new Date(-1), label: 'Custom Tanggal' };
  }

  return { start: null, end: null, label: 'Semua Waktu' };
};
const isDateInBounds = (value, bounds) => {
  if (!bounds.start || !bounds.end) return true;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date >= bounds.start && date <= bounds.end;
};
const getPeriodFilePart = (periodFilter, customStartDate, customEndDate) => {
  const today = formatDateInput(new Date());

  if (periodFilter === 'today') return `harian-${today}`;
  if (periodFilter === 'week') return `mingguan-${today}`;
  if (periodFilter === 'month') return `bulanan-${today}`;
  if (periodFilter === 'custom' && customStartDate && customEndDate) return `${customStartDate}-sd-${customEndDate}`;

  return `semua-waktu-${today}`;
};

const downloadJsonFile = (data, fileName) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// ============================================================================
// 4. CORE VIEWS: WELCOME & LOGIN
// ============================================================================

const WelcomeView = ({ onNext }) => {
  const { theme } = useContext(AppContext);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMousePosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <div onMouseMove={handleMouseMove} className="min-h-[100dvh] bg-slate-50 dark:bg-[#070b14] flex flex-col items-center justify-center p-6 relative overflow-x-hidden transition-colors duration-300">
      <div
        className="hidden md:block absolute w-[420px] h-[420px] rounded-full pointer-events-none opacity-80 dark:opacity-100 transition-[left,top] duration-500 ease-out"
        style={{
          left: mousePosition.x,
          top: mousePosition.y,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(16,185,129,0.22), rgba(20,184,166,0.10), transparent 60%)',
          filter: 'blur(40px)'
        }}
      />
      <div className="absolute top-[-12%] left-[-10%] w-[32rem] h-[32rem] bg-emerald-100/70 dark:bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-10%] w-[34rem] h-[34rem] bg-teal-100/70 dark:bg-teal-500/10 rounded-full blur-[130px] pointer-events-none"></div>
      <div className="absolute top-[20%] right-[15%] w-72 h-72 bg-blue-100/50 dark:bg-blue-900/10 rounded-full blur-[110px] pointer-events-none"></div>
      
      <div className="text-center z-10 max-w-2xl w-full flex flex-col items-center">
        <div className="bg-white/5 dark:bg-white/5 border border-white/10 rounded-3xl px-6 py-5 flex items-center justify-center mb-6 md:mb-8 shadow-xl shadow-emerald-900/10 backdrop-blur-sm">
          <LazisnuLogo variant={theme === 'dark' ? 'white' : 'color'} size="lg" />
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-3 md:mb-4 tracking-tight leading-tight uppercase">
          Aplikasi Penjualan <br />
          <span className="text-emerald-600 dark:text-emerald-500">LAZISNU Garut</span>
        </h1>
        <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 mb-10 md:mb-12 leading-relaxed px-4 md:px-0">
          Sistem digital untuk pengelolaan penjualan program LAZISNU Garut.
        </p>
        <Button onClick={onNext} className="w-full md:w-auto px-10 py-4 text-lg rounded-full shadow-emerald-600/20 shadow-lg">
          Masuk Aplikasi <ArrowRight size={22} className="ml-1" />
        </Button>
      </div>
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs font-medium text-slate-500 dark:text-slate-500 opacity-80 whitespace-nowrap">LAZISNU Garut v1.0</p>
    </div>
  );
};

const LoginView = ({ onLoginSuccess, showToast }) => {
  const { theme } = useContext(AppContext);
  const [role, setRole] = useState('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await loginWithDbFallback(username, password, role);
      if (result.source === 'local') showToast('Database tidak tersedia, menggunakan data lokal.', 'error');
      onLoginSuccess(result.user);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#070b14] flex flex-col items-center justify-center p-6 transition-colors duration-300 relative overflow-x-hidden">
      <div className="w-full max-w-md z-10">
        <div className="text-center mb-8 md:mb-10">
          <div className="inline-flex items-center justify-center bg-white dark:bg-[#111828] border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 mb-4 shadow-sm">
            <LazisnuLogo variant={theme === 'dark' ? 'white' : 'color'} size="md" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Login Aplikasi Penjualan</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Masuk untuk mengelola penjualan LAZISNU Garut.</p>
        </div>

        <Card className="shadow-xl shadow-slate-200/40 dark:shadow-none p-6 md:p-8 border-slate-200/60">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="flex bg-slate-100 dark:bg-[#0a0f1c] p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <button type="button" className={`flex-1 py-3 md:py-2.5 text-sm font-semibold rounded-lg transition-all select-none ${role === 'owner' ? 'bg-white dark:bg-[#111828] text-emerald-700 dark:text-emerald-500 shadow-sm border border-slate-200 dark:border-slate-700' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`} onClick={() => setRole('owner')}>Owner</button>
              <button type="button" className={`flex-1 py-3 md:py-2.5 text-sm font-semibold rounded-lg transition-all select-none ${role === 'admin' ? 'bg-white dark:bg-[#111828] text-emerald-700 dark:text-emerald-500 shadow-sm border border-slate-200 dark:border-slate-700' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`} onClick={() => setRole('admin')}>Petugas/Admin</button>
            </div>

            <Input label="Username" placeholder="Masukkan username..." value={username} onChange={e => setUsername(e.target.value)} required />
            <PasswordInput label="Password" placeholder="Masukkan password..." value={password} onChange={e => setPassword(e.target.value)} required />

            <Button type="submit" isLoading={isSubmitting} className="w-full py-4 mt-4 text-base shadow-lg">Login Sekarang</Button>
          </form>
        </Card>
        <p className="text-center mt-6 text-xs font-medium text-slate-500 dark:text-slate-500 opacity-80">LAZISNU Garut v1.0</p>
      </div>
    </div>
  );
};

// ============================================================================
// 5. MODULE SELECTION & DASHBOARD LAYOUT
// ============================================================================

const ModuleSelectionView = ({ onSelectModule, showToast }) => {
  const { theme } = useContext(AppContext);

  return (
  <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#070b14] p-6 flex flex-col items-center justify-center transition-colors duration-300 relative overflow-x-hidden">
    <div className="w-full max-w-4xl z-10">
      <div className="flex justify-center mb-6">
        <div className="bg-white dark:bg-[#111828] border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 shadow-sm">
          <LazisnuLogo variant={theme === 'dark' ? 'white' : 'color'} size="md" />
        </div>
      </div>
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3 text-center tracking-tight">Pilih Modul Aplikasi</h2>
      <p className="text-slate-600 dark:text-slate-400 text-center mb-10 md:mb-12">Silakan pilih modul yang ingin digunakan.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
        <button onClick={() => onSelectModule('dashboard')} className="group bg-white dark:bg-[#111828] border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 rounded-3xl p-6 md:p-8 text-left transition-all hover:shadow-xl md:hover:-translate-y-1 active:scale-[0.98]">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mb-5 md:mb-6 group-hover:scale-110 transition-transform"><Package size={28} /></div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2 md:mb-3">Stikernisasi</h3>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mb-6 md:mb-8 leading-relaxed">Kelola penjualan, stok, laporan, dan sinkronisasi spreadsheet.</p>
          <div className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5 rounded-xl text-sm md:text-base">Masuk Modul <ArrowRight size={18} className="ml-2" /></div>
        </button>

        <button onClick={() => showToast('Modul Produk Lazisnu x LPNU Garut belum tersedia saat ini.', 'error')} className="relative bg-slate-100/50 dark:bg-[#111828]/40 border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-6 md:p-8 text-left opacity-80 active:scale-[0.98] transition-transform overflow-hidden">
          <div className="absolute top-5 right-5 bg-slate-200 dark:bg-slate-800 text-[10px] md:text-xs font-bold text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg uppercase tracking-wider">Coming Soon</div>
          <div className="w-14 h-14 md:w-16 md:h-16 bg-slate-200 dark:bg-slate-800 text-slate-500 rounded-2xl flex items-center justify-center mb-5 md:mb-6"><ShoppingCart size={28} /></div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-700 dark:text-slate-300 mb-2 md:mb-3">Produk Lazisnu x LPNU Garut</h3>
          <p className="text-sm md:text-base text-slate-500 mb-6 md:mb-8 leading-relaxed">Kolaborasi penjualan produk unggulan bersama LPNU Garut.</p>
          <div className="inline-flex items-center text-slate-500 font-semibold bg-slate-200 dark:bg-slate-800 px-4 py-2.5 rounded-xl text-sm md:text-base">Belum Tersedia</div>
        </button>
      </div>
    </div>
    <p className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-xs font-medium text-slate-500 dark:text-slate-500 opacity-80 whitespace-nowrap">LAZISNU Garut v1.0</p>
  </div>
  );
};

const DashboardLayout = ({ children, currentView, setView, user, onLogout }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useContext(AppContext);

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'sales', label: 'Input Penjualan', icon: ShoppingCart },
    { id: 'products', label: 'Data Produk', icon: Package },
    ...(user.role === 'owner' ? [{ id: 'users', label: 'Pengguna', icon: User }] : []),
    { id: 'reports', label: 'Laporan & Laba', icon: PieChart },
    ...(user.role === 'owner' ? [{ id: 'profit-settings', label: 'Pengaturan Laba', icon: Settings }] : []),
    { id: 'spreadsheet', label: 'Spreadsheet', icon: Database },
  ];

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-slate-50 dark:bg-[#070b14] flex flex-col md:flex-row transition-colors duration-300">
      
      {/* Mobile Header (Sticky & Comfortable Touch Targets) */}
      <div className="md:hidden bg-white/90 backdrop-blur-md dark:bg-[#0a0f1c]/90 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between z-30 sticky top-0 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="bg-white dark:bg-[#111828] border border-slate-200 dark:border-slate-800 px-2 py-1.5 rounded-lg">
            <LazisnuLogo variant={theme === 'dark' ? 'white' : 'color'} size="sm" />
          </div>
          <span className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight leading-tight">LAZISNU GARUT</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleTheme} className="w-11 h-11 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
          </button>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="w-11 h-11 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
            {isMobileMenuOpen ? <X size={26}/> : <Menu size={26}/>}
          </button>
        </div>
      </div>

      {/* Sidebar / Mobile Drawer */}
      <aside className={`fixed md:sticky top-0 left-0 h-[100dvh] w-[280px] bg-white dark:bg-[#0a0f1c] border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col transition-transform duration-300 z-40 shadow-2xl md:shadow-none dark:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="hidden md:flex items-center gap-3 px-2 mb-10 mt-2">
          <div className="bg-white dark:bg-[#111828] border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl shadow-sm">
            <LazisnuLogo variant={theme === 'dark' ? 'white' : 'color'} size="sm" />
          </div>
          <div>
            <h2 className="font-extrabold text-lg text-slate-900 dark:text-white leading-tight tracking-tight">LAZISNU</h2>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-500 font-bold tracking-widest uppercase">Garut</p>
          </div>
        </div>

        {/* Mobile Sidebar User Info */}
        <div className="md:hidden mb-6 px-2 flex items-center gap-3">
           <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-full"><User size={24} className="text-slate-500 dark:text-slate-400" /></div>
           <div>
             <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Halo,</p>
             <p className="text-base font-extrabold text-slate-900 dark:text-white truncate">{user.name}</p>
           </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto pr-2 pb-6">
          {navItems.map(item => (
            <button key={item.id} onClick={() => { setView(item.id); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm md:text-base font-bold transition-all select-none ${currentView === item.id ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
              <item.icon size={22} className={currentView === item.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-5 mt-auto space-y-3">
          <div className="hidden md:flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-[#111828] rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Mode Gelap</span>
            <button onClick={toggleTheme} className={`w-12 h-6 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${theme === 'dark' ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="hidden md:flex px-4 py-3 bg-slate-50 dark:bg-[#111828] rounded-xl border border-slate-200 dark:border-slate-800 items-center gap-3">
            <div className="bg-slate-200 dark:bg-slate-700 p-2 rounded-lg text-slate-500 dark:text-slate-400"><User size={18} /></div>
            <div className="overflow-hidden">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Login Sebagai</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-200 capitalize truncate">{user.name}</p>
            </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 md:py-3 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors select-none"><LogOut size={20} className="md:w-[18px] md:h-[18px]" /> Keluar</button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 w-full p-4 sm:p-6 md:p-10 overflow-visible md:overflow-y-auto md:h-screen relative">
        {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 md:hidden transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />}
        
        {/* pb-32 on mobile to ensure bottom sticky buttons or safe areas are respected */}
        <div className="max-w-5xl mx-auto pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-10">
          {children}
        </div>
      </main>
    </div>
  );
};

// ============================================================================
// 6. CORE MODULES (Cleaned & Validated)
// ============================================================================

const DashboardOverview = ({ setView }) => {
  const [stats] = useState(() => {
    const transactions = db.getTransactions();
    const products = db.getProducts();
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);

    let todayTotal = 0, monthTotal = 0;
    transactions.forEach(tx => {
      const txDate = tx.date.split('T')[0];
      const txMonth = tx.date.substring(0, 7);
      if (txDate === today) todayTotal += (tx.total || 0);
      if (txMonth === thisMonth) monthTotal += (tx.total || 0);
    });

    return {
      todaySales: todayTotal, monthSales: monthTotal, txCount: transactions.length,
      activeProducts: products.filter(p => p.isActive).length,
      lowStock: products.filter(p => p.stock <= p.minStock && p.isActive).length
    };
  });

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      <header className="px-1 md:px-0">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Overview Stikernisasi</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm md:text-base">Ringkasan performa penjualan dan stok hari ini.</p>
      </header>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        <Card className="bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/50">
          <div className="flex justify-between items-start">
            <div><p className="text-emerald-800 dark:text-emerald-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-1">Penjualan Hari Ini</p><h3 className="text-3xl font-black text-emerald-600 dark:text-emerald-500">{formatRp(stats.todaySales)}</h3></div>
            <div className="p-3 bg-emerald-200/50 dark:bg-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400"><ShoppingCart size={24} /></div>
          </div>
        </Card>
        
        <Card>
          <div className="flex justify-between items-start">
            <div><p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-1">Bulan Ini</p><h3 className="text-3xl font-black text-slate-900 dark:text-white">{formatRp(stats.monthSales)}</h3></div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400"><LayoutDashboard size={24} /></div>
          </div>
        </Card>
        
        <Card>
          <div className="flex justify-between items-start">
            <div><p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-1">Total Transaksi</p><h3 className="text-3xl font-black text-slate-900 dark:text-white">{stats.txCount}</h3></div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400"><FileText size={24} /></div>
          </div>
        </Card>
        
        <Card>
          <div className="flex justify-between items-start">
            <div><p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-1">Produk Aktif</p><h3 className="text-3xl font-black text-slate-900 dark:text-white">{stats.activeProducts}</h3></div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400"><Package size={24} /></div>
          </div>
        </Card>
        
        <Card className={stats.lowStock > 0 ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-[#111828]' : ''}>
          <div className="flex justify-between items-start">
            <div><p className={`text-xs md:text-sm font-bold uppercase tracking-wider mb-1 ${stats.lowStock > 0 ? 'text-amber-700 dark:text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>Stok Kritis</p><h3 className={`text-3xl font-black ${stats.lowStock > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>{stats.lowStock}</h3></div>
            <div className={`p-3 rounded-xl ${stats.lowStock > 0 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}><AlertTriangle size={24} /></div>
          </div>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="px-1 md:px-0">
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Akses Cepat</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Buka menu utama yang paling sering dipakai.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <button
            type="button"
            onClick={() => setView('sales')}
            className="group text-left rounded-2xl bg-white dark:bg-[#111828] border border-slate-200 dark:border-slate-800 p-5 md:p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-4">
              <div className="w-[52px] h-[52px] rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                <ShoppingCart size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Input Penjualan</h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Catat transaksi baru</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setView('products')}
            className="group text-left rounded-2xl bg-white dark:bg-[#111828] border border-slate-200 dark:border-slate-800 p-5 md:p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-4">
              <div className="w-[52px] h-[52px] rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center border border-slate-100 dark:border-slate-700 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                <Package size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Data Produk</h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Kelola stok dan harga</p>
              </div>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
};

const UsersView = ({ showToast }) => {
  const { user: currentUser } = useContext(AppContext);
  const createUserFormData = (selectedUser = {}) => ({
    id: selectedUser.id || null,
    name: selectedUser.name || '',
    username: selectedUser.username || '',
    password: '',
    role: selectedUser.role || 'admin',
    status: selectedUser.status || 'active'
  });

  const [users, setUsers] = useState(() => db.getUsers());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [userSource, setUserSource] = useState('Lokal');
  const [formData, setFormData] = useState(createUserFormData);

  const loadUsers = () => setUsers(db.getUsers());

  const refreshUsers = async () => {
    const health = await checkDatabaseConnection();
    const result = await syncUsersCacheFromDb();

    if (result.success) {
      setUsers(result.data);
      setUserSource('Database');
      return result.data;
    }

    if (health.status === 'connected') {
      setUsers([]);
      setUserSource('Database');
      showToast('Gagal memuat data pengguna dari database.', 'error');
      return [];
    }

    const localUsers = db.getUsers();
    setUsers(localUsers);
    setUserSource('Lokal');
    if (result.status !== 'not_configured') showToast('Database tidak tersedia, menggunakan data lokal.', 'error');

    return localUsers;
  };

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(async () => {
      const health = await checkDatabaseConnection();
      const result = await syncUsersCacheFromDb();

      if (!isMounted) return;

      if (result.success) {
        setUsers(result.data);
        setUserSource('Database');
        return;
      }

      if (health.status === 'connected') {
        setUsers([]);
        setUserSource('Database');
        return;
      }

      setUsers(db.getUsers());
      setUserSource('Lokal');
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSubmittingUser) return;

    if (!formData.name.trim()) return showToast('Nama lengkap wajib diisi', 'error');
    if (!formData.username.trim()) return showToast('Username wajib diisi', 'error');
    if (!formData.id && !formData.password) return showToast('Password wajib untuk user baru', 'error');

    setIsSubmittingUser(true);
    try {
      const username = formData.username.trim().toLowerCase();
      const health = await checkDatabaseConnection();
      const nextUsers = formData.id
        ? users.map(item => item.id === formData.id ? { ...item, ...formData, username, password: formData.password || item.password, updatedAt: new Date().toISOString() } : item)
        : [...users, { ...formData, id: `U-${Date.now()}`, username, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];

      db.ensureActiveOwner(nextUsers);

      if (health.status === 'connected') {
        const result = formData.id
          ? await updateUserInDb(formData.id, {
              name: formData.name.trim(),
              username,
              password: formData.password,
              role: formData.role,
              status: formData.status
            })
          : await createUserInDb({
              name: formData.name.trim(),
              username,
              password: formData.password,
              role: formData.role,
              status: formData.status
            });

        if (!result.success) throw new Error('Gagal menyimpan pengguna ke database.');

        await refreshUsers();
        showToast('Data pengguna berhasil diperbarui.');
      } else {
        db.saveUser(formData);
        loadUsers();
        setUserSource('Lokal');
        showToast(health.status === 'not_configured' ? 'Data pengguna berhasil diperbarui.' : 'Database tidak tersedia, menggunakan data lokal.', health.status === 'not_configured' ? 'success' : 'error');
      }
      setIsModalOpen(false);
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui data pengguna.', 'error');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleStatusChange = async (selectedUser) => {
    const nextStatus = selectedUser.status === 'active' ? 'inactive' : 'active';

    try {
      const nextUsers = users.map(user => user.id === selectedUser.id ? { ...user, status: nextStatus } : user);
      const health = await checkDatabaseConnection();
      db.ensureActiveOwner(nextUsers);

      if (health.status === 'connected') {
        const result = await setUserStatusInDb(selectedUser.id, nextStatus);
        if (!result.success) throw new Error('Gagal menyimpan pengguna ke database.');

        await refreshUsers();
        showToast('Data pengguna berhasil diperbarui.');
      } else {
        db.setUserStatus(selectedUser.id, nextStatus);
        loadUsers();
        setUserSource('Lokal');
        showToast(health.status === 'not_configured' ? (nextStatus === 'active' ? 'Pengguna diaktifkan kembali' : 'Pengguna dinonaktifkan') : 'Database tidak tersedia, menggunakan data lokal.', health.status === 'not_configured' ? 'success' : 'error');
      }
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui data pengguna.', 'error');
    }
  };

  const userHasLocalTransactions = (selectedUser) => db.getTransactions().some(tx => (
    tx.petugasId === selectedUser.id
    || tx.petugasId === selectedUser.localId
    || tx.namaPetugasSnapshot === selectedUser.name
  ));

  const ensureUserCanBeDeleted = async (selectedUser, health) => {
    if (currentUser?.id === selectedUser.id || currentUser?.username === selectedUser.username) {
      throw new Error('Pengguna yang sedang login tidak bisa dihapus.');
    }

    const remainingUsers = users.filter(user => user.id !== selectedUser.id);
    db.ensureActiveOwner(remainingUsers);

    if (userHasLocalTransactions(selectedUser)) {
      throw new Error('Pengguna ini sudah memiliki transaksi. Nonaktifkan saja agar riwayat laporan tetap aman.');
    }

    if (health.status === 'connected') {
      const txResult = await checkUserHasTransactions(selectedUser);
      if (!txResult.success) throw new Error(txResult.error || 'Gagal mengecek transaksi pengguna.');
      if (txResult.data) throw new Error('Pengguna ini sudah memiliki transaksi. Nonaktifkan saja agar riwayat laporan tetap aman.');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget || isDeletingUser) return;

    setIsDeletingUser(true);
    try {
      const health = await checkDatabaseConnection();
      await ensureUserCanBeDeleted(deleteTarget, health);

      if (health.status === 'connected') {
        const result = await deleteUserFromDb(deleteTarget.id);
        if (!result.success) throw new Error('Gagal menghapus pengguna dari database.');

        await refreshUsers();
      } else {
        db.deleteUser(deleteTarget.id);
        loadUsers();
        setUserSource('Lokal');
      }

      showToast('Pengguna berhasil dihapus.');
      setDeleteTarget(null);
    } catch (err) {
      showToast(err.message || 'Gagal menghapus pengguna.', 'error');
    } finally {
      setIsDeletingUser(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      <header className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 px-1 md:px-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Data Pengguna</h1>
          <p className="text-sm text-slate-500 mt-1.5">Kelola owner dan petugas yang dapat login ke sistem.</p>
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-2">Sumber pengguna: {userSource}</p>
        </div>
        <Button onClick={() => { setFormData(createUserFormData()); setIsModalOpen(true); }} className="w-full sm:w-auto shadow-lg"><Plus size={20} /> Tambah Pengguna</Button>
      </header>

      <Card className="p-0 border-0 md:border shadow-sm overflow-hidden bg-transparent md:bg-white dark:bg-transparent md:dark:bg-[#111828]">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4 md:pb-0">
          <table className="w-full text-left text-sm whitespace-nowrap bg-white dark:bg-[#111828] rounded-2xl md:rounded-none border border-slate-200 dark:border-slate-800 md:border-0 shadow-sm md:shadow-none overflow-hidden">
            <thead className="bg-slate-50 dark:bg-[#0a0f1c] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Nama</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Username</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Role</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Status</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {users.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="p-4 font-extrabold text-slate-900 dark:text-slate-100">{item.name}</td>
                  <td className="p-4 text-slate-500 dark:text-slate-400 font-semibold">{item.username}</td>
                  <td className="p-4">
                    <span className="px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {getRoleLabel(item.role)}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider rounded-lg ${item.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button onClick={() => { setFormData(createUserFormData(item)); setIsModalOpen(true); }} className="px-3 py-2 min-h-[40px] text-xs font-bold text-slate-600 hover:text-emerald-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm transition-colors active:scale-95">Edit</button>
                      <button onClick={() => handleStatusChange(item)} className={`px-3 py-2 min-h-[40px] text-xs font-bold border rounded-xl shadow-sm transition-colors active:scale-95 ${item.status === 'active' ? 'text-red-600 border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400' : 'text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400'}`}>
                        {item.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button onClick={() => setDeleteTarget(item)} className="px-3 py-2 min-h-[40px] text-xs font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/20 rounded-xl shadow-sm transition-colors active:scale-95">Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-500">Belum ada pengguna.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl rounded-b-none md:rounded-2xl max-h-[90dvh] overflow-y-auto animate-fade-in-up">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white dark:bg-[#111828] z-10 pt-2 pb-2">
              <h2 className="text-2xl font-extrabold tracking-tight">{formData.id ? 'Edit Pengguna' : 'Tambah Pengguna'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-full"><X size={22} /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-5 pb-6">
              <Input label="Nama Lengkap" placeholder="Contoh: Desandi" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              <Input label="Username" placeholder="Contoh: desandi" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} required />
              <PasswordInput label="Password" placeholder={formData.id ? 'Kosongkan jika tidak diubah' : 'Masukkan password'} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} required={!formData.id} />
              <Select label="Role" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} options={USER_ROLES} required />
              <Select label="Status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} options={USER_STATUSES} required />

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>Batal</Button>
                <Button type="submit" isLoading={isSubmittingUser} className="flex-1 shadow-lg shadow-emerald-600/20">Simpan</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl rounded-b-none md:rounded-2xl animate-fade-in-up">
            <div className="flex justify-between items-start gap-4 mb-5">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Hapus Pengguna?</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Yakin ingin menghapus pengguna ini?</p>
              </div>
              <button onClick={() => setDeleteTarget(null)} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-full"><X size={22} /></button>
            </div>

            <div className="rounded-2xl border border-red-100 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-4 mb-6">
              <p className="font-extrabold text-red-700 dark:text-red-300">{deleteTarget.name}</p>
              <p className="text-sm text-red-600/80 dark:text-red-300/80 mt-1">Pengguna yang sudah memiliki transaksi sebaiknya dinonaktifkan agar riwayat laporan tetap aman.</p>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Batal</Button>
              <Button type="button" variant="danger" isLoading={isDeletingUser} className="flex-1" onClick={handleDeleteUser}>Hapus</Button>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
};

const ProductsView = ({ showToast }) => {
  const { user } = useContext(AppContext);
  const canManageProducts = user?.role === 'owner';

  const createProductFormData = (product = {}) => ({
    id: product.id || null,
    name: product.name || '',
    category: product.category || '',
    size: product.size || '',
    price: product.price ?? '',
    stock: product.stock ?? '',
    minStock: product.minStock ?? '10',
    isActive: product.isActive ?? true
  });

  const [products, setProducts] = useState(() => sortProductsByCategory(db.getProducts()));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [productSource, setProductSource] = useState('Lokal');
  const [formData, setFormData] = useState(createProductFormData);
  const [importFileName, setImportFileName] = useState('');
  const [importRows, setImportRows] = useState([]);

  const loadProducts = () => setProducts(sortProductsByCategory(db.getProducts()));

  const refreshProducts = async () => {
    const result = await syncProductsCacheFromDb();

    if (result.success) {
      const nextProducts = sortProductsByCategory(result.data);
      setProducts(nextProducts);
      setProductSource('Database');
      return nextProducts;
    }

    const localProducts = sortProductsByCategory(db.getProducts());
    setProducts(localProducts);
    setProductSource('Lokal');
    if (result.status !== 'not_configured') showToast('Database tidak tersedia, menggunakan data lokal.', 'error');

    return localProducts;
  };

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(async () => {
      const result = await syncProductsCacheFromDb();

      if (!isMounted) return;

      if (result.success) {
        setProducts(sortProductsByCategory(result.data));
        setProductSource('Database');
        return;
      }

      setProducts(sortProductsByCategory(db.getProducts()));
      setProductSource('Lokal');
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const normalizeImportHeader = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');

  const getImportValue = (row, aliases) => {
    const entries = Object.entries(row).map(([key, value]) => [normalizeImportHeader(key), value]);
    const normalizedAliases = aliases.map(normalizeImportHeader);
    const match = entries.find(([key]) => normalizedAliases.includes(key));

    return match ? match[1] : '';
  };

  const normalizeImportCategory = (value) => {
    const normalizedValue = String(value || '').toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

    if (['s', 'kecil', 'kecil s'].includes(normalizedValue)) return 'Kecil (S)';
    if (['m', 'sedang', 'sedang m'].includes(normalizedValue)) return 'Sedang (M)';
    if (['l', 'besar', 'besar l'].includes(normalizedValue)) return 'Besar (L)';

    return PRODUCT_CATEGORIES.some(item => item.value.toLowerCase() === String(value || '').toLowerCase().trim()) ? PRODUCT_CATEGORIES.find(item => item.value.toLowerCase() === String(value || '').toLowerCase().trim()).value : '';
  };

  const parseImportNumber = (value) => {
    if (typeof value === 'number') return value;

    const rawValue = String(value || '').trim();
    if (!rawValue) return Number.NaN;

    const normalizedValue = rawValue
      .replace(/rp/ig, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.-]/g, '');

    return Number(normalizedValue);
  };

  const parseImportStatus = (value) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) return { value: true, isValid: true };

    const normalizedValue = rawValue.toLowerCase();
    if (['aktif', 'active', 'true', 'ya', 'yes', '1'].includes(normalizedValue)) return { value: true, isValid: true };
    if (['nonaktif', 'inactive', 'false', 'tidak', 'no', '0'].includes(normalizedValue)) return { value: false, isValid: true };

    return { value: true, isValid: false };
  };

  const getProductImportKey = (product) => [product.name, product.category, product.size]
    .map(value => String(value || '').trim().toLowerCase())
    .join('|');

  const normalizeImportProductRow = (row, index) => {
    const name = String(getImportValue(row, ['Nama Produk', 'nama', 'name', 'produk', 'nama produk']) || '').trim();
    const category = normalizeImportCategory(getImportValue(row, ['Kategori', 'category']));
    const size = normalizeProductSize(getImportValue(row, ['Ukuran', 'size']));
    const price = parseImportNumber(getImportValue(row, ['Harga', 'price']));
    const stock = parseImportNumber(getImportValue(row, ['Stok', 'stock']));
    const minStockRaw = getImportValue(row, ['Stok Minimum', 'min stock', 'minStock']);
    const minStock = String(minStockRaw ?? '').trim() === '' ? 0 : parseImportNumber(minStockRaw);
    const status = parseImportStatus(getImportValue(row, ['Status', 'aktif', 'isActive']));
    const errors = [];

    if (!name) errors.push('Nama produk wajib');
    if (!category) errors.push('Kategori tidak valid');
    if (!size) errors.push('Ukuran wajib');
    if (Number.isNaN(price) || price <= 0) errors.push('Harga harus lebih dari 0');
    if (Number.isNaN(stock) || stock < 0) errors.push('Stok tidak boleh negatif');
    if (Number.isNaN(minStock) || minStock < 0) errors.push('Stok minimum tidak boleh negatif');
    if (!status.isValid) errors.push('Status tidak valid');

    const normalizedStock = Number.isNaN(stock) ? 0 : stock;

    return {
      rowNumber: index + 2,
      product: {
        name,
        category,
        size,
        price: Number.isNaN(price) ? 0 : price,
        stock: normalizedStock,
        minStock: Number.isNaN(minStock) ? 0 : minStock,
        isActive: normalizedStock > 0 ? status.value : false
      },
      errors,
      isValid: errors.length === 0
    };
  };

  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setIsParsingImport(true);
    setImportFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('File tidak memiliki sheet data.');

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' })
        .filter(row => Object.values(row).some(value => String(value || '').trim()));

      setImportRows(rows.map(normalizeImportProductRow));
      showToast(`${rows.length} baris produk terbaca.`, 'success');
    } catch (err) {
      setImportRows([]);
      showToast(err.message || 'Gagal membaca file import produk.', 'error');
    } finally {
      setIsParsingImport(false);
    }
  };

  const handleDownloadImportTemplate = async () => {
    const XLSX = await import('xlsx');
    const templateRows = [
      { 'Nama Produk': 'Stiker Donasi Kecil', Kategori: 'Kecil (S)', Ukuran: '5', Harga: 5000, Stok: 100, 'Stok Minimum': 10, Status: 'Aktif' },
      { 'Nama Produk': 'Stiker Donasi Sedang', Kategori: 'Sedang (M)', Ukuran: '10', Harga: 10000, Stok: 50, 'Stok Minimum': 5, Status: 'Aktif' },
      { 'Nama Produk': 'Stiker Donasi Besar', Kategori: 'Besar (L)', Ukuran: 'A4', Harga: 25000, Stok: 20, 'Stok Minimum': 3, Status: 'Aktif' }
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateRows);

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Produk');
    XLSX.writeFile(workbook, 'template-import-produk-lazisnu.xlsx');
  };

  const handleImportProducts = async () => {
    const validRows = importRows.filter(row => row.isValid);
    if (validRows.length === 0 || isImportingProducts) return;

    setIsImportingProducts(true);
    try {
      const health = await checkDatabaseConnection();
      const sourceProducts = health.status === 'connected' ? await refreshProducts() : db.getProducts();
      let workingProducts = [...sourceProducts];
      const summary = { created: 0, updated: 0, failed: 0 };

      for (const row of validRows) {
        const existingProduct = workingProducts.find(product => getProductImportKey(product) === getProductImportKey(row.product));

        if (health.status === 'connected') {
          const result = existingProduct
            ? await updateProductInDb(existingProduct.id, row.product)
            : await createProductInDb(row.product);

          if (!result.success) {
            summary.failed++;
            continue;
          }

          if (existingProduct) {
            summary.updated++;
            workingProducts = workingProducts.map(product => product.id === existingProduct.id ? result.data : product);
          } else {
            summary.created++;
            workingProducts.push(result.data);
          }
        } else {
          db.saveProduct(existingProduct ? { ...existingProduct, ...row.product } : row.product);
          workingProducts = db.getProducts();
          if (existingProduct) summary.updated++;
          else summary.created++;
        }
      }

      if (health.status === 'connected') {
        await refreshProducts();
      } else {
        loadProducts();
        setProductSource('Lokal');
        showToast('Database tidak tersedia, produk disimpan lokal.', 'error');
      }

      showToast(`Import selesai. Produk baru: ${summary.created}. Produk diperbarui: ${summary.updated}. Gagal: ${summary.failed}.`, summary.failed > 0 ? 'error' : 'success');
      setImportRows([]);
      setImportFileName('');
      setIsImportModalOpen(false);
    } catch (err) {
      showToast(err.message || 'Gagal import produk.', 'error');
    } finally {
      setIsImportingProducts(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSubmittingProduct) return;

    if (!formData.name.trim()) return showToast('Nama produk wajib diisi', 'error');
    if (!formData.category) return showToast('Kategori produk wajib dipilih', 'error');
    if (!formData.size.trim()) return showToast('Ukuran produk wajib diisi', 'error');
    if (Number(formData.price) <= 0) return showToast('Harga harus lebih dari 0', 'error');
    if (Number(formData.stock) < 0) return showToast('Stok tidak boleh negatif', 'error');
    if (Number(formData.minStock) < 0) return showToast('Stok minimum tidak boleh negatif', 'error');

    const productPayload = {
      name: formData.name.trim(),
      category: formData.category,
      size: normalizeProductSize(formData.size),
      price: Number(formData.price),
      stock: Number(formData.stock),
      minStock: Number(formData.minStock),
      isActive: Number(formData.stock) > 0 ? formData.isActive : false
    };

    setIsSubmittingProduct(true);
    try {
      const health = await checkDatabaseConnection();

      if (health.status === 'connected') {
        const result = formData.id
          ? await updateProductInDb(formData.id, productPayload)
          : await createProductInDb(productPayload);

        if (!result.success) throw new Error(formData.id ? 'Gagal memperbarui produk di database.' : 'Gagal menyimpan produk ke database.');

        await refreshProducts();
      } else {
        db.saveProduct({ ...formData, ...productPayload });
        loadProducts();
        setProductSource('Lokal');
        if (health.status !== 'not_configured') showToast('Database tidak tersedia, menggunakan data lokal.', 'error');
      }

      showToast('Produk tersimpan');
      setIsModalOpen(false);
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan produk.', 'error');
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const productHasLocalTransactions = (product) => db.getTransactions().some(tx => (
    tx.productId === product.id
    || tx.productId === product.localId
    || tx.productNameSnapshot === product.name
    || (Array.isArray(tx.items) && tx.items.some(item => item.productId === product.id || item.productId === product.localId || item.productNameSnapshot === product.name))
  ));

  const ensureProductCanBeDeleted = async (product, health) => {
    if (productHasLocalTransactions(product)) {
      throw new Error('Produk ini sudah memiliki riwayat transaksi. Nonaktifkan saja agar laporan tetap aman.');
    }

    if (health.status === 'connected') {
      const txResult = await checkProductHasTransactions(product);
      if (!txResult.success) throw new Error(txResult.error || 'Gagal mengecek transaksi produk.');
      if (txResult.data) throw new Error('Produk ini sudah memiliki riwayat transaksi. Nonaktifkan saja agar laporan tetap aman.');
    }
  };

  const handleActiveChange = async (product) => {
    const nextActive = !product.isActive;

    try {
      const health = await checkDatabaseConnection();

      if (health.status === 'connected') {
        const result = await setProductActiveInDb(product.id, nextActive);
        if (!result.success) throw new Error('Gagal memperbarui produk di database.');

        await refreshProducts();
      } else {
        db.saveProduct({ ...product, isActive: nextActive });
        loadProducts();
        setProductSource('Lokal');
        if (health.status !== 'not_configured') showToast('Database tidak tersedia, menggunakan data lokal.', 'error');
      }

      showToast(nextActive ? 'Produk diaktifkan kembali' : 'Produk dinonaktifkan');
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui produk.', 'error');
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus produk ini?')) return;

    try {
      const health = await checkDatabaseConnection();
      await ensureProductCanBeDeleted(product, health);

      if (health.status === 'connected') {
        const result = await deleteProductFromDb(product.id);
        if (!result.success) throw new Error('Gagal menghapus produk dari database.');

        await refreshProducts();
      } else {
        db.deleteProduct(product.id);
        loadProducts();
        setProductSource('Lokal');
      }

      showToast('Produk berhasil dihapus');
    } catch (err) {
      showToast(err.message || 'Gagal menghapus produk.', 'error');
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      <header className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 px-1 md:px-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Data Produk</h1>
          <p className="text-sm text-slate-500 mt-1.5">Kelola master data stiker dan pantau stok.</p>
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-2">Sumber Produk: {productSource}</p>
        </div>
        {canManageProducts && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:w-auto">
            <Button type="button" variant="secondary" onClick={() => setIsImportModalOpen(true)} className="w-full sm:w-auto shadow-sm"><Download size={18} /> Import Produk</Button>
            <Button onClick={() => { setFormData(createProductFormData()); setIsModalOpen(true); }} className="w-full sm:w-auto shadow-lg"><Plus size={20} /> Tambah Produk</Button>
          </div>
        )}
      </header>

      <Card className="p-0 border-0 md:border shadow-sm overflow-hidden bg-transparent md:bg-white dark:bg-transparent md:dark:bg-[#111828]">
        {/* Desktop Table, Mobile Edge-to-Edge Scroll */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4 md:pb-0">
          <table className="w-full text-left text-sm whitespace-nowrap bg-white dark:bg-[#111828] rounded-2xl md:rounded-none border border-slate-200 dark:border-slate-800 md:border-0 shadow-sm md:shadow-none overflow-hidden">
            <thead className="bg-slate-50 dark:bg-[#0a0f1c] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Nama Produk</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Kategori</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Ukuran</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Harga</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Stok</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Status</th>
                {canManageProducts && <th className="p-4 font-bold text-slate-600 dark:text-slate-400 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="p-4 font-extrabold text-slate-900 dark:text-slate-100">{p.name}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center justify-center min-w-8 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-black">
                      {getCategoryCode(p.category)}
                    </span>
                    <span className="ml-2 text-slate-500 font-medium">{p.category || '-'}</span>
                  </td>
                  <td className="p-4 text-slate-600 dark:text-slate-300 font-semibold">{p.size || '-'}</td>
                  <td className="p-4 text-emerald-600 font-black">{formatRp(p.price)}</td>
                  <td className="p-4 font-black text-base">
                    {p.stock} 
                    {p.stock <= p.minStock && <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 uppercase align-middle">Kritis</span>}
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider rounded-lg ${p.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {p.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  {canManageProducts && (
                    <td className="p-4 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button onClick={() => { setFormData(createProductFormData(p)); setIsModalOpen(true); }} className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-slate-500 hover:text-emerald-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm transition-colors active:scale-95"><Edit2 size={18} /></button>
                        <button onClick={() => handleActiveChange(p)} className={`px-3 py-2 min-h-[40px] text-xs font-bold border rounded-xl shadow-sm transition-colors active:scale-95 ${p.isActive ? 'text-red-600 border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400' : 'text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400'}`}>{p.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button>
                        <button onClick={() => handleDelete(p)} className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-slate-400 hover:text-red-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm transition-colors active:scale-95"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={canManageProducts ? 7 : 6} className="p-8 text-center text-slate-500">Belum ada produk.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl rounded-b-none md:rounded-2xl max-h-[90dvh] overflow-y-auto animate-fade-in-up">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white dark:bg-[#111828] z-10 pt-2 pb-2">
              <h2 className="text-2xl font-extrabold tracking-tight">{formData.id ? 'Edit Produk' : 'Tambah Produk'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-full"><X size={22} /></button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-5 pb-6">
              <Input label="Nama Produk" placeholder="Contoh: Stiker NU" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
              <Select label="Kategori" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} options={PRODUCT_CATEGORIES} required />
              <Input label="Ukuran" placeholder="Contoh: 10 x 15 cm, A5, Custom" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})} required />
              
              <div className="grid grid-cols-2 gap-4">
                <Input label="Harga" type="number" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} required />
                <Input label="Stok Tersedia" type="number" min="0" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} required />
              </div>
              <Input label="Batas Stok Kritis" type="number" min="0" value={formData.minStock} onChange={e => setFormData({...formData, minStock: e.target.value})} required />

              <div className="flex items-center gap-3 pt-3 pb-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} id="isActiveCheck" className="w-6 h-6 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="isActiveCheck" className="text-sm font-bold cursor-pointer select-none">Produk Aktif (Tampil di Penjualan)</label>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>Batal</Button>
                <Button type="submit" isLoading={isSubmittingProduct} className="flex-1 shadow-lg shadow-emerald-600/20">Simpan Data</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 z-50">
          <Card className="w-full max-w-5xl shadow-2xl rounded-b-none md:rounded-2xl max-h-[92dvh] overflow-y-auto animate-fade-in-up">
            <div className="flex justify-between items-start gap-4 mb-6 sticky top-0 bg-white dark:bg-[#111828] z-10 pt-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">Import Produk</h2>
                <p className="text-sm text-slate-500 mt-1">Upload file Excel (.xlsx) atau CSV dengan kolom produk.</p>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-full shrink-0"><X size={22} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-5">
              <label className="w-full min-h-[54px] inline-flex items-center justify-center px-4 py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f1c] text-sm font-extrabold text-slate-600 dark:text-slate-300 cursor-pointer hover:border-emerald-400 transition-colors">
                {isParsingImport ? 'Membaca file...' : (importFileName || 'Pilih file .xlsx / .csv')}
                <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImportFileChange} disabled={isParsingImport} />
              </label>
              <Button type="button" variant="secondary" onClick={handleDownloadImportTemplate} className="w-full md:w-auto">
                <Download size={18} /> Download Template
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-2xl bg-slate-50 dark:bg-[#0a0f1c] border border-slate-100 dark:border-slate-800 p-4 text-center">
                <p className="text-xs font-bold uppercase text-slate-500">Total Baris</p>
                <p className="text-2xl font-black mt-1">{importRows.length}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-4 text-center">
                <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400">Valid</p>
                <p className="text-2xl font-black mt-1 text-emerald-600 dark:text-emerald-400">{importRows.filter(row => row.isValid).length}</p>
              </div>
              <div className="rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 p-4 text-center">
                <p className="text-xs font-bold uppercase text-red-700 dark:text-red-400">Error</p>
                <p className="text-2xl font-black mt-1 text-red-600 dark:text-red-400">{importRows.filter(row => !row.isValid).length}</p>
              </div>
            </div>

            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4 max-h-[44dvh]">
              <table className="w-full text-left text-xs md:text-sm whitespace-nowrap bg-white dark:bg-[#111828] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <thead className="bg-slate-50 dark:bg-[#0a0f1c] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Nama Produk</th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Kategori</th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Ukuran</th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Harga</th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Stok</th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Stok Minimum</th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Status</th>
                    <th className="p-3 font-bold text-slate-600 dark:text-slate-400">Validasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {importRows.map(row => (
                    <tr key={row.rowNumber} className={row.isValid ? '' : 'bg-red-50/70 dark:bg-red-500/5'}>
                      <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{row.product.name || '-'}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-semibold">{row.product.category || '-'}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-semibold">{row.product.size || '-'}</td>
                      <td className="p-3 font-black text-emerald-600 dark:text-emerald-400">{formatRp(row.product.price)}</td>
                      <td className="p-3 font-bold">{row.product.stock}</td>
                      <td className="p-3 font-bold">{row.product.minStock}</td>
                      <td className="p-3 font-bold">{row.product.isActive ? 'Aktif' : 'Nonaktif'}</td>
                      <td className={`p-3 font-bold ${row.isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{row.isValid ? 'Valid' : row.errors.join(', ')}</td>
                    </tr>
                  ))}
                  {importRows.length === 0 && <tr><td colSpan="8" className="p-8 text-center text-slate-500 font-medium">Belum ada data preview. Pilih file import terlebih dahulu.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsImportModalOpen(false)}>Batal</Button>
              <Button type="button" className="flex-1" isLoading={isImportingProducts} disabled={importRows.filter(row => row.isValid).length === 0 || isImportingProducts} onClick={handleImportProducts}>Import Produk Valid</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

const SalesView = ({ showToast, setView, setInvoiceData, setInvoiceBackView }) => {
  const { user } = useContext(AppContext);
  const [products, setProducts] = useState(() => sortProductsByCategory(db.getProducts().filter(p => p.isActive && p.stock > 0)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ buyerName: '', productId: '', qty: 0, paymentMethod: 'Tunai', notes: '' });
  const [cartItems, setCartItems] = useState([]);

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(async () => {
      const result = await syncProductsCacheFromDb();
      const sourceProducts = result.success ? result.data : db.getProducts();

      if (!isMounted) return;
      setProducts(sortProductsByCategory(sourceProducts.filter(p => p.isActive && p.stock > 0)));
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedProduct = products.find(p => p.id === form.productId);
  const selectedQty = Number(form.qty) || 0;
  const cartTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

  const handleQtyChange = (value) => {
    const digitsOnly = value.replace(/\D/g, '');

    if (!digitsOnly) {
      setForm(prev => ({ ...prev, qty: '' }));
      return;
    }

    setForm(prev => ({ ...prev, qty: String(Number(digitsOnly)) }));
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return showToast('Pilih produk terlebih dahulu', 'error');
    if (selectedQty < 1) return showToast('Jumlah harus lebih dari 0.', 'error');

    const existingItem = cartItems.find(item => item.productId === selectedProduct.id);
    const nextQty = (existingItem?.qty || 0) + selectedQty;

    if (nextQty > selectedProduct.stock) return showToast('Stok tidak mencukupi.', 'error');

    setCartItems(prev => {
      if (existingItem) {
        return prev.map(item => item.productId === selectedProduct.id ? {
          ...item,
          qty: nextQty,
          subtotal: nextQty * item.priceSnapshot
        } : item);
      }

      return [...prev, {
        productId: selectedProduct.id,
        productNameSnapshot: selectedProduct.name || '-',
        productCategorySnapshot: selectedProduct.category || '-',
        productSizeSnapshot: selectedProduct.size || '-',
        priceSnapshot: Number(selectedProduct.price) || 0,
        qty: selectedQty,
        subtotal: (Number(selectedProduct.price) || 0) * selectedQty
      }];
    });
    setForm(prev => ({ ...prev, productId: '', qty: 0 }));
  };

  const handleRemoveCartItem = (productId) => {
    setCartItems(prev => prev.filter(item => item.productId !== productId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return; // Mencegah double submit
    if (cartItems.length === 0) return showToast('Keranjang transaksi masih kosong', 'error');

    setIsSubmitting(true);
    try {
      const txPayload = {
        buyerName: form.buyerName,
        items: cartItems.map(item => ({ ...item })),
        paymentMethod: form.paymentMethod, 
        notes: form.notes,
        petugasId: user.id,
        namaPetugasSnapshot: user.name,
        roleSnapshot: user.role
      };
      const health = await checkDatabaseConnection();
      let newTx;

      if (health.status === 'connected') {
        const productsResult = await syncProductsCacheFromDb();
        if (!productsResult.success) throw new Error('Gagal menyimpan transaksi ke database.');

        const profitSettingsResult = await syncProfitSharingSettingsCacheFromDb();
        if (!profitSettingsResult.success) throw new Error('Gagal menyimpan transaksi ke database.');

        const transactionDraft = db.buildTransaction(txPayload);
        const createResult = await createTransactionInDb(transactionDraft);
        if (!createResult.success) throw new Error('Gagal menyimpan transaksi ke database.');

        const latestProducts = db.getProducts();
        const qtyByProductId = transactionDraft.items.reduce((acc, item) => {
          acc[item.productId] = (acc[item.productId] || 0) + item.qty;
          return acc;
        }, {});
        const stockResults = await Promise.all(Object.entries(qtyByProductId).map(([productId, totalQty]) => {
          const latestProduct = latestProducts.find(product => product.id === productId);
          if (!latestProduct) return { success: false };

          return updateProductStockInDb(latestProduct.id, Math.max(0, latestProduct.stock - totalQty));
        }));

        if (stockResults.some(result => !result.success)) throw new Error('Gagal menyimpan transaksi ke database.');

        await Promise.all([syncProductsCacheFromDb(), syncTransactionsCacheFromDb()]);
        newTx = createResult.data;
      } else {
        newTx = db.addTransaction(txPayload);
      }

      setProducts(sortProductsByCategory(db.getProducts().filter(p => p.isActive && p.stock > 0)));
      showToast('Transaksi berhasil disimpan');
      setInvoiceData(newTx);
      setInvoiceBackView('sales');
      setView('invoice');
      setForm({ buyerName: '', productId: '', qty: 0, paymentMethod: 'Tunai', notes: '' });
      setCartItems([]);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in max-w-2xl mx-auto pt-2 md:pt-4 pb-[calc(140px+env(safe-area-inset-bottom))] md:pb-10">
      <header className="text-center px-1 md:px-0">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Input Penjualan</h1>
        <p className="text-slate-500 mt-1.5 text-sm md:text-base">Catat transaksi penjualan stiker baru.</p>
      </header>

      <Card className="shadow-lg border-slate-200/60 p-5 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Petugas Penjual</label>
              <div className="w-full bg-slate-50 dark:bg-[#0a0f1c] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 min-h-[48px] text-base md:text-sm text-slate-900 dark:text-slate-100 font-bold flex items-center">
                {user.name}
              </div>
            </div>
            <Input label="Nama Pembeli (Opsional)" placeholder="Hamba Allah" value={form.buyerName} onChange={e => setForm({...form, buyerName: e.target.value})} />
          </div>
          
          <div className="p-4 md:p-6 bg-slate-50 dark:bg-[#0a0f1c] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
            <Select 
              label="Pilih Produk" 
              value={form.productId} 
              onChange={e => setForm({...form, productId: e.target.value})} 
              options={products.map(p => ({ 
                value: p.id, 
                label: `${p.name} - ${p.category || '-'} - ${p.size || '-'}` 
              }))} 
            />
            
            <div className="grid grid-cols-2 gap-4 md:gap-5">
              <Input label="Jumlah (Qty)" type="number" min="0" value={form.qty} onChange={e => handleQtyChange(e.target.value)} required />
              <Button type="button" onClick={handleAddToCart} className="self-end h-[48px]">Tambah ke Keranjang</Button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#0a0f1c] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <h3 className="font-extrabold text-slate-900 dark:text-white">Keranjang Transaksi</h3>
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-500">{formatRp(cartTotal)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-[#111828] text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="p-3 font-bold">Produk</th>
                    <th className="p-3 font-bold">Kategori</th>
                    <th className="p-3 font-bold">Ukuran</th>
                    <th className="p-3 font-bold">Qty</th>
                    <th className="p-3 font-bold">Harga</th>
                    <th className="p-3 font-bold">Subtotal</th>
                    <th className="p-3 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {cartItems.map(item => (
                    <tr key={item.productId}>
                      <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{item.productNameSnapshot}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-semibold">{item.productCategorySnapshot}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-semibold">{item.productSizeSnapshot}</td>
                      <td className="p-3 font-black">{item.qty}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-semibold">{formatRp(item.priceSnapshot)}</td>
                      <td className="p-3 font-black text-emerald-600 dark:text-emerald-500">{formatRp(item.subtotal)}</td>
                      <td className="p-3 text-right"><button type="button" onClick={() => handleRemoveCartItem(item.productId)} className="px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg">Hapus</button></td>
                    </tr>
                  ))}
                  {cartItems.length === 0 && <tr><td colSpan="7" className="p-5 text-center text-slate-500 font-medium">Keranjang masih kosong.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="font-extrabold text-slate-700 dark:text-slate-300">Total Harga</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-500">{formatRp(cartTotal)}</span>
            </div>
          </div>
          
          <div>
            <Button type="submit" disabled={isSubmitting} isLoading={isSubmitting} className="w-full py-4 text-base shadow-emerald-600/20 shadow-lg">Simpan Transaksi</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

const InvoiceView = ({ invoiceData, setView, backView = 'sales' }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    const invoiceElement = document.getElementById('printable-invoice');

    if (!invoiceElement || isDownloading) return;

    setIsDownloading(true);

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const canvas = await html2canvas(invoiceElement, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true
      });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 80;
      const contentWidth = 72;
      const imgHeight = (canvas.height * contentWidth) / canvas.width;
      const pdfHeight = Math.max(140, imgHeight + 8);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] });
      const fileName = `struk-${invoiceData.id || 'transaksi'}.pdf`;

      pdf.addImage(imgData, 'PNG', 4, 4, contentWidth, imgHeight);
      pdf.save(fileName);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!invoiceData) return null;

  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-6 mt-2 md:mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:hidden px-4 md:px-0">
        <Button variant="secondary" onClick={() => setView(backView)} className="py-3.5"><ArrowRight className="rotate-180 mr-2" size={20}/> Kembali</Button>
        <Button onClick={() => window.print()} className="py-3.5"><Printer size={20} /> Print</Button>
        <Button onClick={handleDownloadPdf} isLoading={isDownloading} className="py-3.5"><Download size={20} /> Download PDF</Button>
      </div>
      
      <div className="bg-white text-black p-6 md:p-8 rounded-2xl shadow-xl border border-slate-200 mx-4 md:mx-0 print:m-0 print:shadow-none print:p-0 print:border-none relative" id="printable-invoice">
        <style>{`
          @media print { 
            body * { visibility: hidden; } 
            #printable-invoice, #printable-invoice * { visibility: visible; } 
            #printable-invoice { position: absolute; left: 0; top: 0; width: 100%; max-width: 80mm; padding: 10px; margin: 0; font-family: monospace; } 
            .print\\:hidden { display: none !important; } 
          }
        `}</style>
        
        <div className="text-center mb-6 border-b-2 border-dashed border-gray-300 pb-5">
          <div className="flex justify-center mb-3">
            <LazisnuLogo variant="color" size="md" className="max-h-14" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight">LAZISNU GARUT</h2>
          <p className="text-sm font-bold mt-1 text-gray-600 tracking-wide">Struk Donasi / Pembelian</p>
          <p className="text-xs mt-2 text-gray-500 font-medium">{new Date(invoiceData.date).toLocaleString('id-ID')}</p>
        </div>
        
        <div className="space-y-3 text-sm mb-6 font-medium">
          <div className="flex justify-between"><span>No. TX:</span><span className="font-bold">{invoiceData.id}</span></div>
          <div className="flex justify-between"><span>Pembeli:</span><span className="font-bold">{invoiceData.buyerName}</span></div>
          <div className="flex justify-between"><span>Petugas:</span><span className="font-bold">{getTransactionOfficerName(invoiceData)}</span></div>
          <div className="flex justify-between"><span>Metode:</span><span className="font-bold">{invoiceData.paymentMethod}</span></div>
          {invoiceData.notes && <div className="flex justify-between gap-4"><span>Catatan:</span><span className="font-bold text-right">{invoiceData.notes}</span></div>}
        </div>
        
        <div className="border-t-2 border-b-2 border-dashed border-gray-300 py-5 mb-6 space-y-4">
          {getTransactionItems(invoiceData).map((item, index) => (
            <div key={`${item.productId || index}-${index}`} className={index > 0 ? 'border-t border-dashed border-gray-200 pt-4' : ''}>
              <div className="font-extrabold text-base uppercase tracking-tight mb-1">{item.productNameSnapshot}</div>
              <div className="flex items-start justify-between gap-4 text-sm text-gray-600 font-medium">
                <span className="leading-relaxed">Ukuran {item.productSizeSnapshot || '-'} | {item.qty} x {formatRp(item.priceSnapshot)}</span>
                <span className="font-black text-gray-900 text-right shrink-0">{formatRp(item.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex justify-between items-center text-xl font-black mb-8">
          <span>TOTAL</span>
          <span>{formatRp(invoiceData.total)}</span>
        </div>
        
        <div className="text-center text-xs italic text-gray-500 font-medium">
          <p>Terima kasih atas partisipasinya.</p>
          <p className="mt-1">Semoga membawa berkah.</p>
        </div>
      </div>
    </div>
  );
};

const ProfitSettingsView = ({ showToast }) => {
  const [profitSettings, setProfitSettings] = useState(() => db.getProfitSharingSettings());
  const [profitSettingsSource, setProfitSettingsSource] = useState('Lokal');
  const [isSavingProfitSettings, setIsSavingProfitSettings] = useState(false);
  const profitTotalPercent = Number(profitSettings.lazisnuPercent) + Number(profitSettings.pcnuPercent) + Number(profitSettings.petugasPercent) + Number(profitSettings.pengelolaPercent);

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(async () => {
      const result = await syncProfitSharingSettingsCacheFromDb();

      if (!isMounted) return;

      if (result.success && result.data) {
        setProfitSettings(result.data);
        setProfitSettingsSource('Database');
        return;
      }

      setProfitSettings(db.getProfitSharingSettings());
      setProfitSettingsSource('Lokal');
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const validateProfitSettings = () => {
    const nextSettings = {
      lazisnuPercent: Number(profitSettings.lazisnuPercent),
      pcnuPercent: Number(profitSettings.pcnuPercent),
      petugasPercent: Number(profitSettings.petugasPercent),
      pengelolaPercent: Number(profitSettings.pengelolaPercent)
    };

    if (Object.values(nextSettings).some(value => Number.isNaN(value) || value < 0)) {
      throw new Error('Semua persentase harus angka 0 atau lebih.');
    }

    if (nextSettings.lazisnuPercent + nextSettings.pcnuPercent + nextSettings.petugasPercent + nextSettings.pengelolaPercent !== 100) {
      throw new Error('Total pembagian laba harus 100%.');
    }

    return nextSettings;
  };

  const handleSaveProfitSettings = async (e) => {
    e.preventDefault();
    if (isSavingProfitSettings) return;

    setIsSavingProfitSettings(true);
    try {
      const nextSettings = validateProfitSettings();
      const health = await checkDatabaseConnection();

      if (health.status === 'connected') {
        const result = await upsertProfitSharingSettingsToDb(nextSettings);
        if (!result.success) throw new Error('Gagal menyimpan pengaturan laba ke database.');

        const syncResult = await syncProfitSharingSettingsCacheFromDb();
        setProfitSettings(syncResult.success && syncResult.data ? syncResult.data : result.data);
        setProfitSettingsSource('Database');
        showToast('Pengaturan laba berhasil disimpan ke database.');
      } else {
        const savedSettings = db.saveProfitSharingSettings(nextSettings);
        setProfitSettings(savedSettings);
        setProfitSettingsSource('Lokal');
        showToast('Pengaturan pembagian laba tersimpan');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingProfitSettings(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in max-w-2xl mx-auto pt-2 md:pt-4">
      <header className="text-center px-1 md:px-0">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Pengaturan Laba</h1>
        <p className="text-slate-500 mt-1.5 text-sm md:text-base">Atur porsi persentase pembagian laba operasional.</p>
        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-2">Sumber Pengaturan Laba: {profitSettingsSource}</p>
      </header>

      <Card className="shadow-lg border-slate-200/60 p-5 md:p-8">
        <form onSubmit={handleSaveProfitSettings} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <Input label="LAZISNU (%)" type="number" min="0" value={profitSettings.lazisnuPercent} onChange={e => setProfitSettings({ ...profitSettings, lazisnuPercent: e.target.value })} required />
            <Input label="PCNU (%)" type="number" min="0" value={profitSettings.pcnuPercent} onChange={e => setProfitSettings({ ...profitSettings, pcnuPercent: e.target.value })} required />
            <Input label="Petugas (%)" type="number" min="0" value={profitSettings.petugasPercent} onChange={e => setProfitSettings({ ...profitSettings, petugasPercent: e.target.value })} required />
            <Input label="Pengelola (%)" type="number" min="0" value={profitSettings.pengelolaPercent} onChange={e => setProfitSettings({ ...profitSettings, pengelolaPercent: e.target.value })} required />
          </div>

          <div className="bg-slate-50 dark:bg-[#0a0f1c] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4">
            <span className="text-sm md:text-base font-extrabold text-slate-700 dark:text-slate-300">Total Persentase:</span>
            <span className={`text-2xl font-black ${profitTotalPercent === 100 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-500'}`}>{profitTotalPercent}%</span>
          </div>
          {profitTotalPercent !== 100 && <p className="text-sm font-bold text-red-500">Total pembagian laba harus 100%.</p>}

          <Button type="submit" isLoading={isSavingProfitSettings} className="w-full py-4 text-base shadow-emerald-600/20 shadow-lg">Simpan Pengaturan</Button>
        </form>
      </Card>
    </div>
  );
};

const ReportsView = ({ setView, setInvoiceData, setInvoiceBackView, showToast }) => {
  const [transactions, setTransactions] = useState(() => db.getTransactions());
  const [transactionSource, setTransactionSource] = useState('Lokal');
  const [activeReportTab, setActiveReportTab] = useState('history');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [officerFilter, setOfficerFilter] = useState('all');
  const [selectedOfficerName, setSelectedOfficerName] = useState(null);
  const [customStartDate, setCustomStartDate] = useState(formatDateInput(new Date()));
  const [customEndDate, setCustomEndDate] = useState(formatDateInput(new Date()));

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(async () => {
      const result = await refreshTransactionsCacheWithFallback();

      if (!isMounted) return;
      setTransactions(result.data);
      setTransactionSource(result.source === 'database' ? 'Database' : 'Lokal');
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const periodBounds = getPeriodBounds(periodFilter, customStartDate, customEndDate);
  const officerOptions = db.getUsers().filter(item => item.role === 'admin').map(item => item.name);
  const filteredTransactions = transactions.filter(tx => {
    const isTimeMatch = isDateInBounds(tx.date, periodBounds);
    const isOfficerMatch = officerFilter === 'all' || getTransactionOfficerName(tx) === officerFilter;

    return isTimeMatch && isOfficerMatch;
  });

  const totalOmzet = filteredTransactions.reduce((acc, curr) => acc + (curr.total || 0), 0);
  const totalQty = filteredTransactions.reduce((acc, curr) => acc + getTransactionTotalQty(curr), 0);
  const totalLazisnu = filteredTransactions.reduce((acc, curr) => acc + getTransactionProfitAmount(curr, 'lazisnu'), 0);
  const totalPcnu = filteredTransactions.reduce((acc, curr) => acc + getTransactionProfitAmount(curr, 'pcnu'), 0);
  const totalPetugas = filteredTransactions.reduce((acc, curr) => acc + getTransactionProfitAmount(curr, 'petugas'), 0);
  const totalPengelola = filteredTransactions.reduce((acc, curr) => acc + getTransactionProfitAmount(curr, 'pengelola'), 0);
  const pendingSyncCount = filteredTransactions.filter(tx => tx.syncStatus !== 'synced').length;
  const filterLabel = `Periode: ${periodBounds.label} | Petugas: ${officerFilter === 'all' ? 'Semua Petugas' : officerFilter}`;
  const reportSummaryRows = [
    ['Total Transaksi', filteredTransactions.length],
    ['Total Omzet', formatRp(totalOmzet)],
    ['Total Qty', totalQty],
    ['Total LAZISNU', formatRp(totalLazisnu)],
    ['Total PCNU', formatRp(totalPcnu)],
    ['Total Petugas', formatRp(totalPetugas)],
    ['Total Pengelola', formatRp(totalPengelola)],
    ['Data Belum Sync', pendingSyncCount],
    ['Filter', filterLabel],
    ['Tanggal Export', formatDateTimeId(new Date())]
  ];

  const profitRowsByOfficer = Object.values(filteredTransactions.reduce((acc, tx) => {
    const officerName = getTransactionOfficerName(tx);

    if (!acc[officerName]) {
      acc[officerName] = {
        officerName,
        role: getTransactionOfficerRole(tx),
        transactionCount: 0,
        totalQty: 0,
        totalSales: 0,
        lazisnuAmount: 0,
        pcnuAmount: 0,
        petugasAmount: 0,
        pengelolaAmount: 0,
        transactions: []
      };
    }

    acc[officerName].transactionCount++;
    acc[officerName].totalQty += getTransactionTotalQty(tx);
    acc[officerName].totalSales += tx.total || 0;
    acc[officerName].lazisnuAmount += getTransactionProfitAmount(tx, 'lazisnu');
    acc[officerName].pcnuAmount += getTransactionProfitAmount(tx, 'pcnu');
    acc[officerName].petugasAmount += getTransactionProfitAmount(tx, 'petugas');
    acc[officerName].pengelolaAmount += getTransactionProfitAmount(tx, 'pengelola');
    acc[officerName].transactions.push(tx);

    return acc;
  }, {}));

  const selectedOfficerReport = selectedOfficerName
    ? profitRowsByOfficer.find(row => row.officerName === selectedOfficerName) || {
        officerName: selectedOfficerName,
        role: '-',
        transactionCount: 0,
        totalQty: 0,
        totalSales: 0,
        lazisnuAmount: 0,
        pcnuAmount: 0,
        petugasAmount: 0,
        pengelolaAmount: 0,
        transactions: []
      }
    : null;

  const historyExportRows = filteredTransactions.flatMap(tx => getTransactionItems(tx).map(item => ({
    'No. Transaksi': tx.id,
    Tanggal: formatDateTimeId(tx.date),
    Pembeli: tx.buyerName || 'Hamba Allah',
    Petugas: getTransactionOfficerName(tx),
    Role: getTransactionOfficerRole(tx),
    Produk: item.productNameSnapshot,
    Kategori: item.productCategorySnapshot,
    Ukuran: item.productSizeSnapshot,
    Qty: item.qty || 0,
    'Harga Satuan': formatRp(item.priceSnapshot),
    Subtotal: formatRp(item.subtotal),
    'Total Transaksi': formatRp(tx.total),
    Metode: tx.paymentMethod || '-',
    Catatan: tx.notes || '',
    'Status Sync': tx.syncStatus || 'pending'
  })));
  const profitExportRows = profitRowsByOfficer.map(row => ({
    Petugas: row.officerName,
    Role: row.role || '-',
    'Jumlah Transaksi': row.transactionCount,
    'Total Qty': row.totalQty,
    'Total Omzet': formatRp(row.totalSales),
    'Bagian LAZISNU': formatRp(row.lazisnuAmount),
    'Bagian PCNU': formatRp(row.pcnuAmount),
    'Bagian Petugas': formatRp(row.petugasAmount),
    'Bagian Pengelola': formatRp(row.pengelolaAmount)
  }));
  const activeExportRows = activeReportTab === 'history' ? historyExportRows : profitExportRows;
  const activeReportTitle = activeReportTab === 'history' ? 'Laporan Penjualan LAZISNU Garut' : 'Laporan Pembagian Laba Petugas';
  const filePrefix = activeReportTab === 'history' ? 'laporan-transaksi' : 'laporan-laba';
  const filePeriodPart = getPeriodFilePart(periodFilter, customStartDate, customEndDate);

  const handleExportExcel = async () => {
    if (activeExportRows.length === 0) return showToast('Tidak ada data untuk diexport.', 'error');

    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const summarySheet = XLSX.utils.aoa_to_sheet([['Metrik', 'Nilai'], ...reportSummaryRows]);
      const dataSheet = XLSX.utils.json_to_sheet(activeExportRows);

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan');
      XLSX.utils.book_append_sheet(workbook, dataSheet, activeReportTab === 'history' ? 'Riwayat Transaksi' : 'Laba Petugas');
      XLSX.writeFile(workbook, `${filePrefix}-${filePeriodPart}.xlsx`);
      showToast('Laporan berhasil diexport.', 'success');
    } catch {
      showToast('Gagal export laporan.', 'error');
    }
  };

  const handleExportPdf = async () => {
    if (activeExportRows.length === 0) return showToast('Tidak ada data untuk diexport.', 'error');

    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      const autoTable = autoTableModule.default || autoTableModule.autoTable;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const dataHeaders = Object.keys(activeExportRows[0]);
      const dataRows = activeExportRows.map(row => dataHeaders.map(header => row[header]));

      pdf.setTextColor(15, 23, 42);
      pdf.setFontSize(14);
      pdf.setFont(undefined, 'bold');
      pdf.text(activeReportTitle, 14, 14);
      pdf.setFontSize(9);
      pdf.setFont(undefined, 'normal');
      pdf.text(`Periode: ${periodBounds.label}`, 14, 21);
      pdf.text(`Petugas: ${officerFilter === 'all' ? 'Semua Petugas' : officerFilter}`, 14, 27);
      pdf.text(`Tanggal Export: ${formatDateTimeId(new Date())}`, 14, 33);

      autoTable(pdf, {
        startY: 39,
        head: [['Ringkasan', 'Nilai']],
        body: reportSummaryRows.slice(0, activeReportTab === 'history' ? 8 : 7),
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 2 }
      });

      autoTable(pdf, {
        startY: pdf.lastAutoTable.finalY + 6,
        head: [dataHeaders],
        body: dataRows,
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 105], textColor: 255 },
        styles: { fontSize: activeReportTab === 'history' ? 6 : 8, cellPadding: 1.6, overflow: 'linebreak' },
        margin: { left: 8, right: 8 }
      });

      pdf.save(`${filePrefix}-${filePeriodPart}.pdf`);
      showToast('Laporan berhasil diexport.', 'success');
    } catch {
      showToast('Gagal export laporan.', 'error');
    }
  };

  const handleViewInvoice = (tx) => {
    setInvoiceData(tx);
    setInvoiceBackView('reports');
    setView('invoice');
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in max-w-5xl mx-auto">
      <header className="flex flex-col lg:flex-row justify-between lg:items-end gap-4 px-1 md:px-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Laporan & Laba</h1>
          <p className="text-sm text-slate-500 mt-1.5">Pantau riwayat transaksi dan bagi hasil.</p>
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-2">Sumber Transaksi: {transactionSource}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 w-full lg:w-auto">
          <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} className="bg-white dark:bg-[#0a0f1c] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 min-h-[44px] text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500">
            <option value="today">Hari Ini</option>
            <option value="week">Minggu Ini</option>
            <option value="month">Bulan Ini</option>
            <option value="all">Semua Waktu</option>
            <option value="custom">Custom Tanggal</option>
          </select>
          <select value={officerFilter} onChange={e => setOfficerFilter(e.target.value)} className="bg-white dark:bg-[#0a0f1c] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 min-h-[44px] text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500">
            <option value="all">Semua Petugas</option>
            {officerOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <Button type="button" variant="secondary" onClick={handleExportExcel} className="px-4 py-3 min-h-[44px] text-sm shadow-none"><Download size={16} /> Excel</Button>
          <Button type="button" variant="secondary" onClick={handleExportPdf} className="px-4 py-3 min-h-[44px] text-sm shadow-none"><Download size={16} /> PDF</Button>
        </div>
      </header>

      {periodFilter === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-1 md:px-0">
          <Input label="Tanggal Mulai" type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
          <Input label="Tanggal Selesai" type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
        </div>
      )}

      <div className="flex gap-6 border-b border-slate-200 dark:border-slate-800">
        <button type="button" onClick={() => setActiveReportTab('history')} className={`pb-3 text-sm font-extrabold transition-colors border-b-2 ${activeReportTab === 'history' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>Riwayat Transaksi</button>
        <button type="button" onClick={() => setActiveReportTab('profit')} className={`pb-3 text-sm font-extrabold transition-colors border-b-2 ${activeReportTab === 'profit' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>Pembagian Laba Petugas</button>
      </div>

      {activeReportTab === 'profit' && <>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">Pembagian Laba</h2>
          <p className="text-sm text-slate-500 mt-1">Ringkasan internal berdasarkan filter laporan.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-slate-50 dark:bg-[#111828]"><p className="text-xs font-bold uppercase text-slate-500 mb-1">Total Omzet</p><p className="text-2xl font-black text-slate-900 dark:text-white">{formatRp(totalOmzet)}</p></Card>
          <Card><p className="text-xs font-bold uppercase text-slate-500 mb-1">Total LAZISNU</p><p className="text-2xl font-black text-emerald-600 dark:text-emerald-500">{formatRp(totalLazisnu)}</p></Card>
          <Card><p className="text-xs font-bold uppercase text-slate-500 mb-1">Total PCNU</p><p className="text-2xl font-black text-slate-900 dark:text-white">{formatRp(totalPcnu)}</p></Card>
          <Card><p className="text-xs font-bold uppercase text-slate-500 mb-1">Total Petugas</p><p className="text-2xl font-black text-slate-900 dark:text-white">{formatRp(totalPetugas)}</p></Card>
          <Card><p className="text-xs font-bold uppercase text-slate-500 mb-1">Total Pengelola</p><p className="text-2xl font-black text-slate-900 dark:text-white">{formatRp(totalPengelola)}</p></Card>
        </div>
      </div>

      <Card className="p-0 border-0 md:border shadow-sm overflow-hidden bg-transparent md:bg-white dark:bg-transparent md:dark:bg-[#111828]">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4 md:pb-0">
          <table className="w-full text-left text-sm whitespace-nowrap bg-white dark:bg-[#111828] rounded-2xl md:rounded-none border border-slate-200 dark:border-slate-800 md:border-0 shadow-sm md:shadow-none overflow-hidden">
            <thead className="bg-slate-50 dark:bg-[#0a0f1c] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Petugas</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Jumlah Transaksi</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Total Penjualan</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">LAZISNU</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">PCNU</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Petugas</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Pengelola</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {profitRowsByOfficer.map(row => (
                <tr key={row.officerName} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="p-4 font-extrabold text-slate-900 dark:text-slate-100">{row.officerName}</td>
                  <td className="p-4 font-bold text-slate-600 dark:text-slate-300">{row.transactionCount} trx</td>
                  <td className="p-4 font-black text-emerald-600 dark:text-emerald-500">{formatRp(row.totalSales)}</td>
                  <td className="p-4 font-bold text-slate-600 dark:text-slate-300">{formatRp(row.lazisnuAmount)}</td>
                  <td className="p-4 font-bold text-slate-600 dark:text-slate-300">{formatRp(row.pcnuAmount)}</td>
                  <td className="p-4 font-bold text-slate-600 dark:text-slate-300">{formatRp(row.petugasAmount)}</td>
                  <td className="p-4 font-bold text-slate-600 dark:text-slate-300">{formatRp(row.pengelolaAmount)}</td>
                  <td className="p-4 text-center">
                    <Button variant="secondary" className="px-4 py-2 min-h-[40px] text-xs shadow-none" onClick={() => setSelectedOfficerName(row.officerName)}>
                      Lihat Detail
                    </Button>
                  </td>
                </tr>
              ))}
              {profitRowsByOfficer.length === 0 && <tr><td colSpan="8" className="p-8 text-center text-slate-500 font-medium">Tidak ada data petugas terkait.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      </>}

      {activeReportTab === 'history' && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><p className="text-xs font-bold uppercase text-slate-500 mb-1">Total Transaksi</p><p className="text-2xl font-black text-slate-900 dark:text-white">{filteredTransactions.length}</p></Card>
        <Card className="bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/50"><p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 mb-1">Total Omzet</p><p className="text-2xl font-black text-emerald-600 dark:text-emerald-500">{formatRp(totalOmzet)}</p></Card>
        <Card><p className="text-xs font-bold uppercase text-slate-500 mb-1">Total Qty</p><p className="text-2xl font-black text-slate-900 dark:text-white">{totalQty}</p></Card>
        <Card className={pendingSyncCount > 0 ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-[#111828]' : ''}><p className="text-xs font-bold uppercase text-slate-500 mb-1">Belum Sync</p><p className="text-2xl font-black text-slate-900 dark:text-white">{pendingSyncCount}</p></Card>
      </div>

      <Card className="p-0 border-0 md:border shadow-sm overflow-hidden bg-transparent md:bg-white dark:bg-transparent md:dark:bg-[#111828]">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4 md:pb-0">
          <table className="w-full text-left text-sm whitespace-nowrap bg-white dark:bg-[#111828] rounded-2xl md:rounded-none border border-slate-200 dark:border-slate-800 md:border-0 shadow-sm md:shadow-none overflow-hidden">
            <thead className="bg-slate-50 dark:bg-[#0a0f1c] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Waktu</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Petugas</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Produk</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Total</th>
                <th className="p-4 font-bold text-slate-600 dark:text-slate-400 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredTransactions.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="p-4 text-slate-600 dark:text-slate-300 font-medium">{new Date(t.date).toLocaleDateString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}</td>
                  <td className="p-4 text-slate-600 dark:text-slate-300 font-bold">{getTransactionOfficerName(t)}</td>
                  <td className="p-4">
                    <span className="font-bold text-slate-900 dark:text-slate-100">{getTransactionProductSummary(t)}</span> 
                    <span className="ml-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-slate-500 align-middle">{getTransactionItems(t).length} item</span>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">{getTransactionProductCategory(t)}</span>
                      <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800">{getTransactionProductSize(t)}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-black text-emerald-600 dark:text-emerald-500 text-base">{formatRp(t.total)}</div>
                  </td>
                  <td className="p-4 text-center">
                    <Button variant="secondary" className="px-4 py-2 min-h-[40px] text-xs shadow-none border-slate-200 dark:border-slate-700" onClick={() => handleViewInvoice(t)}>
                      <Receipt size={16} className="mr-2" /> Lihat Struk
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-500 font-medium">Tidak ada data.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      </>}

      {selectedOfficerReport && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 z-50">
          <Card className="w-full max-w-6xl shadow-2xl rounded-b-none md:rounded-2xl max-h-[92dvh] overflow-y-auto animate-fade-in-up">
            <div className="flex items-start justify-between gap-4 mb-6 sticky top-0 bg-white dark:bg-[#111828] z-10 pt-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">Detail Petugas</h2>
                <p className="text-sm text-slate-500 mt-1">{selectedOfficerReport.officerName}</p>
              </div>
              <button onClick={() => setSelectedOfficerName(null)} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-full shrink-0"><X size={22} /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-50 dark:bg-[#0a0f1c] rounded-2xl p-4 border border-slate-100 dark:border-slate-800"><p className="text-xs font-bold uppercase text-slate-500 mb-1">Jumlah Transaksi</p><p className="text-2xl font-black text-slate-900 dark:text-white">{selectedOfficerReport.transactionCount} trx</p></div>
              <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-800/50"><p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 mb-1">Total Penjualan</p><p className="text-2xl font-black text-emerald-600 dark:text-emerald-500">{formatRp(selectedOfficerReport.totalSales)}</p></div>
              <div className="bg-slate-50 dark:bg-[#0a0f1c] rounded-2xl p-4 border border-slate-100 dark:border-slate-800"><p className="text-xs font-bold uppercase text-slate-500 mb-1">Bagian Petugas</p><p className="text-2xl font-black text-slate-900 dark:text-white">{formatRp(selectedOfficerReport.petugasAmount)}</p></div>
              <div className="bg-slate-50 dark:bg-[#0a0f1c] rounded-2xl p-4 border border-slate-100 dark:border-slate-800"><p className="text-xs font-bold uppercase text-slate-500 mb-1">Bagian Pengelola</p><p className="text-2xl font-black text-slate-900 dark:text-white">{formatRp(selectedOfficerReport.pengelolaAmount)}</p></div>
              <div className="bg-slate-50 dark:bg-[#0a0f1c] rounded-2xl p-4 border border-slate-100 dark:border-slate-800"><p className="text-xs font-bold uppercase text-slate-500 mb-1">Bagian LAZISNU</p><p className="text-2xl font-black text-slate-900 dark:text-white">{formatRp(selectedOfficerReport.lazisnuAmount)}</p></div>
              <div className="bg-slate-50 dark:bg-[#0a0f1c] rounded-2xl p-4 border border-slate-100 dark:border-slate-800"><p className="text-xs font-bold uppercase text-slate-500 mb-1">Bagian PCNU</p><p className="text-2xl font-black text-slate-900 dark:text-white">{formatRp(selectedOfficerReport.pcnuAmount)}</p></div>
            </div>

            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4 md:pb-0">
              <table className="w-full text-left text-sm whitespace-nowrap bg-white dark:bg-[#111828] rounded-2xl md:rounded-none border border-slate-200 dark:border-slate-800 overflow-hidden">
                <thead className="bg-slate-50 dark:bg-[#0a0f1c] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Tanggal</th>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Nomor Transaksi</th>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Pembeli</th>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Produk</th>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Kategori</th>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Ukuran</th>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Qty</th>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Total</th>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400">Bagian Petugas</th>
                    <th className="p-4 font-bold text-slate-600 dark:text-slate-400 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {selectedOfficerReport.transactions.flatMap(tx => getTransactionItems(tx).map((item, itemIndex) => (
                    <tr key={`${tx.id}-${item.productId || itemIndex}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-4 text-slate-600 dark:text-slate-300 font-medium">{new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-4 font-bold text-slate-600 dark:text-slate-300">{tx.id}</td>
                      <td className="p-4 font-extrabold text-slate-900 dark:text-slate-100">{tx.buyerName}</td>
                      <td className="p-4 font-bold text-slate-900 dark:text-slate-100">{item.productNameSnapshot}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-300 font-semibold">{item.productCategorySnapshot}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-300 font-semibold">{item.productSizeSnapshot}</td>
                      <td className="p-4 font-black text-slate-900 dark:text-white">{item.qty}</td>
                      <td className="p-4 font-black text-emerald-600 dark:text-emerald-500">{formatRp(item.subtotal)}</td>
                      <td className="p-4 font-bold text-slate-600 dark:text-slate-300">{itemIndex === 0 ? formatRp(getTransactionProfitAmount(tx, 'petugas')) : '-'}</td>
                      <td className="p-4 text-center">
                        <Button variant="secondary" className="px-4 py-2 min-h-[40px] text-xs shadow-none" onClick={() => handleViewInvoice(tx)}>
                          <Receipt size={16} className="mr-2" /> Lihat Struk
                        </Button>
                      </td>
                    </tr>
                  )))}
                  {selectedOfficerReport.transactions.length === 0 && <tr><td colSpan="10" className="p-8 text-center text-slate-500 font-medium">Tidak ada transaksi untuk filter ini.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

const SpreadsheetView = ({ showToast }) => {
  const { user } = useContext(AppContext);
  const [pendingCount, setPendingCount] = useState(() => db.getPendingSyncs().length);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingDatabase, setIsCheckingDatabase] = useState(false);
  const [isMigratingDatabase, setIsMigratingDatabase] = useState(false);
  const [lastSync, setLastSync] = useState(localStorage.getItem('lazisnu_last_sync_core') || null);
  const [webAppUrl, setWebAppUrl] = useState(() => db.getSpreadsheetUrl());
  const [lastStatus, setLastStatus] = useState('Siap sinkronisasi.');
  const [databaseStatus, setDatabaseStatus] = useState({
    status: 'unknown',
    message: 'Belum dicek.'
  });

  const checkPending = async () => {
    const result = await refreshTransactionsCacheWithFallback();
    const pendingTransactions = result.data.filter(tx => tx.syncStatus === 'pending');
    setPendingCount(pendingTransactions.length);
    return { ...result, pendingTransactions };
  };

  useEffect(() => {
    let isMounted = true;

    queueMicrotask(async () => {
      const result = await refreshTransactionsCacheWithFallback();
      if (!isMounted) return;
      setPendingCount(result.data.filter(tx => tx.syncStatus === 'pending').length);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSaveUrl = () => {
    if (!webAppUrl.trim()) return showToast('Masukkan URL Google Apps Script terlebih dahulu.', 'error');

    db.saveSpreadsheetUrl(webAppUrl);
    showToast('URL Google Apps Script tersimpan');
  };

  const handleResetDefaultUrl = () => {
    const defaultUrl = db.resetSpreadsheetUrl();

    setWebAppUrl(defaultUrl);
    showToast('URL Spreadsheet dikembalikan ke default.', 'success');
  };

  const handleExportBackup = () => {
    const backupDate = new Date().toISOString().slice(0, 10);
    const fileName = `lazisnu-pos-backup-${backupDate}.json`;

    try {
      downloadJsonFile(db.exportBackupData(), fileName);
      showToast('Backup data berhasil diexport.', 'success');
    } catch {
      showToast('Gagal export backup data. Coba ulangi beberapa saat lagi.', 'error');
    }
  };

  const handleCheckDatabase = async () => {
    if (isCheckingDatabase) return;

    setIsCheckingDatabase(true);
    try {
      const result = await checkDatabaseConnection();
      setDatabaseStatus(result);
      showToast(result.message, result.status === 'connected' ? 'success' : 'error');
    } finally {
      setIsCheckingDatabase(false);
    }
  };

  const handleMigrateLocalData = async () => {
    if (isMigratingDatabase) return;

    const isConfirmed = window.confirm('Data lokal akan dikirim ke Supabase. Data lokal tidak akan dihapus.');
    if (!isConfirmed) return;

    setIsMigratingDatabase(true);
    try {
      await migrateLocalDataToSupabase(db.exportBackupData());
      setDatabaseStatus({ status: 'connected', message: 'Database terhubung. Migrasi terakhir berhasil.' });
      showToast('Data lokal berhasil dimigrasikan ke database.', 'success');
    } catch (err) {
      setDatabaseStatus({ status: 'error', message: err.message || 'Migrasi gagal.' });
      showToast('Migrasi gagal. Data lokal tetap aman.', 'error');
    } finally {
      setIsMigratingDatabase(false);
    }
  };

  const handleSync = async () => {
    if (isSubmitting) return; // Mencegah double submit
    if (!webAppUrl.trim()) return showToast('Masukkan URL Google Apps Script terlebih dahulu.', 'error');
    
    setIsSubmitting(true);
    setLastStatus('Mengirim data ke Google Sheets...');
    try {
      db.saveSpreadsheetUrl(webAppUrl);

      const health = await checkDatabaseConnection();
      let res;

      if (health.status === 'connected') {
        const { pendingTransactions } = await checkPending();
        if (pendingTransactions.length === 0) {
          res = { success: true, message: 'Tidak ada transaksi baru untuk disinkronkan.', count: 0, rows: 0, syncedAt: new Date().toISOString() };
        } else {
          const endpoint = webAppUrl.trim();
          const parsedUrl = new URL(endpoint);
          if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.pathname.endsWith('/exec')) {
            throw new Error('URL Google Apps Script tidak valid. Pastikan memakai URL Web App yang diakhiri /exec.');
          }

          const now = new Date().toISOString();
          const rowsToSync = db.getSpreadsheetRows(pendingTransactions, now);
          if (rowsToSync.length === 0) throw new Error('Tidak ada data transaksi yang bisa dikirim.');

          const response = await fetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({ rows: rowsToSync })
          });
          const responseText = await response.text();
          if (!response.ok) throw new Error('Apps Script gagal memproses data. Periksa deployment Web App dan izin aksesnya.');

          let sheetResult;
          try {
            sheetResult = JSON.parse(responseText);
          } catch (error) {
            throw new Error('Response Spreadsheet tidak valid. Pastikan URL Web App Apps Script benar.', { cause: error });
          }

          if (!sheetResult.success) throw new Error(sheetResult.message || 'Apps Script mengembalikan status gagal. Periksa log Apps Script.');

          const statusResults = await Promise.all(pendingTransactions.map(tx => updateTransactionSyncStatusInDb(tx.dbId || tx.id, 'synced', now)));
          if (statusResults.some(result => !result.success)) throw new Error('Spreadsheet berhasil diupdate, tetapi status sync database gagal diperbarui.');

          await syncTransactionsCacheFromDb();
          res = { success: true, message: `${pendingTransactions.length} transaksi berhasil ditambahkan ke Spreadsheet.`, count: pendingTransactions.length, rows: rowsToSync.length, syncedAt: now };
        }
      } else {
        res = await db.syncToSpreadsheet(webAppUrl);
      }

      showToast(res.message, 'success');
      setLastStatus(`${res.rows || 0} baris berhasil ditambahkan ke spreadsheet.`);
      setLastSync(res.syncedAt);
      if (res.syncedAt) localStorage.setItem('lazisnu_last_sync_core', res.syncedAt);
      await checkPending();
    } catch (err) {
      setLastStatus(`${err.message} Data tetap pending dan aman.`);
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto pt-2 md:pt-4 px-1 md:px-0">
       <header className="mb-8 md:mb-10 text-center">
        <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-5 md:mb-6 shadow-sm border border-blue-100 dark:border-blue-800/50"><Database className="w-8 h-8 md:w-10 md:h-10" /></div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Update Spreadsheet</h1>
        <p className="text-sm md:text-base text-slate-500 mt-2 md:mt-3">Sinkronisasi data penjualan ke Google Sheets.</p>
      </header>

      <Card className="p-6 md:p-8 shadow-xl border-slate-200/60 rounded-3xl space-y-6">
        <div className="space-y-3">
          <Input label="Google Apps Script Web App URL" placeholder="https://script.google.com/macros/s/.../exec" value={webAppUrl} onChange={e => setWebAppUrl(e.target.value)} />
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">URL default sudah disiapkan. Ubah hanya jika ingin memakai spreadsheet lain.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button type="button" variant="secondary" onClick={handleSaveUrl} className="w-full">Simpan URL</Button>
            <Button type="button" variant="ghost" onClick={handleResetDefaultUrl} className="w-full border border-slate-200 dark:border-slate-800">Reset ke URL Default</Button>
          </div>
        </div>

        <div className="text-center py-4">
          <p className="text-xs md:text-sm font-bold text-slate-500 mb-2 md:mb-3 uppercase tracking-widest">Transaksi Menunggu Sync</p>
          <div className="text-5xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tighter">
            {pendingCount} <span className="text-lg md:text-xl font-semibold text-slate-400">trx</span>
          </div>
        </div>

        <Button onClick={handleSync} isLoading={isSubmitting} disabled={pendingCount === 0 || isSubmitting} className={`w-full py-4 text-base rounded-2xl ${pendingCount > 0 ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/30 shadow-lg' : 'bg-slate-100 text-slate-400 shadow-none dark:bg-slate-800 dark:text-slate-500'}`}>
          {isSubmitting ? 'Proses Sinkronisasi...' : 'Kirim ke Spreadsheet'}
        </Button>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0a0f1c] p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">Backup Local Data</h2>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Export data lokal browser ke file JSON sebelum deploy atau pindah perangkat.</p>
          </div>
          <Button type="button" variant="secondary" onClick={handleExportBackup} className="w-full sm:w-auto shrink-0">
            <Download size={18} /> Export Backup Data
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0a0f1c] p-4 md:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h2 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-white">Status Database</h2>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {databaseStatus.status === 'connected'
                  ? 'Terhubung'
                  : databaseStatus.status === 'not_configured'
                    ? 'Belum dikonfigurasi'
                    : databaseStatus.status === 'error'
                      ? 'Gagal terhubung'
                      : 'Belum dicek'}
                {' - '}{databaseStatus.message}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={handleCheckDatabase} isLoading={isCheckingDatabase} className="w-full sm:w-auto shrink-0">
              Cek Koneksi Database
            </Button>
          </div>
          {user?.role === 'owner' && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Phase 1: kirim data lokal ke Supabase tanpa menghapus data browser.</p>
              <Button type="button" onClick={handleMigrateLocalData} isLoading={isMigratingDatabase} className="w-full sm:w-auto shrink-0">
                Migrasi Data Lokal ke Database
              </Button>
            </div>
          )}
        </div>

        <div className="pt-6 md:pt-8 border-t border-slate-100 dark:border-slate-800/80 flex flex-col items-center gap-3">
          {lastSync ? (
            <span className="flex flex-wrap items-center justify-center gap-2 text-center text-sm font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-lg max-w-full">
              <CheckCircle2 size={18} className="text-emerald-500" /> Sync terakhir: {new Date(lastSync).toLocaleString('id-ID')}
            </span>
          ) : (
            <span className="text-sm font-medium text-slate-500">Belum pernah melakukan sinkronisasi.</span>
          )}
          <span className="text-center text-sm font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-lg max-w-full break-words">Status: {lastStatus}</span>
          <div className="flex items-start gap-3 bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100/50 dark:border-blue-800/50 text-left mt-4 text-xs md:text-sm text-slate-600 dark:text-slate-400 leading-relaxed w-full">
            <Info size={20} className="text-blue-500 shrink-0 mt-0.5" />
            <p>Data akan ditambahkan ke spreadsheet yang sama dan meneruskan baris sebelumnya. Hanya transaksi berstatus <span className="font-extrabold text-slate-800 dark:text-slate-200">pending</span> yang dikirim, lalu berubah menjadi <span className="font-extrabold text-slate-800 dark:text-slate-200">synced</span> setelah sukses.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

// ============================================================================
// 7. MAIN APP COMPONENT
// ============================================================================

export default function App() {
  const [initialSession] = useState(getInitialSessionState);
  const [view, setView] = useState(initialSession.view);
  const [user, setUser] = useState(initialSession.user);
  const [toast, setToast] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceBackView, setInvoiceBackView] = useState('sales');
  const [theme, setTheme] = useState(getInitialTheme);
  const [isBooting, setIsBooting] = useState(true);
  const [isSessionReady, setIsSessionReady] = useState(!initialSession.user);
  const [, setCacheRefreshVersion] = useState(0);
  const viewRef = useRef(view);
  const userRef = useRef(user);
  const invoiceBackViewRef = useRef(invoiceBackView);
  const skipNextHistoryPushRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const showToast = (message, type = 'success') => setToast({ message, type });
  const closeToast = () => setToast(null);

  useEffect(() => {
    if (!user || !isSessionReady) return;

    let isCancelled = false;

    queueMicrotask(async () => {
      const result = await syncCoreCachesFromDb();
      if (!isCancelled && result.success) setCacheRefreshVersion(version => version + 1);
    });

    return () => {
      isCancelled = true;
    };
  }, [user, isSessionReady]);

  useEffect(() => {
    const timer = setTimeout(() => setIsBooting(false), 750);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    viewRef.current = view;
    userRef.current = user;
    invoiceBackViewRef.current = invoiceBackView;
  }, [view, user, invoiceBackView]);

  useEffect(() => {
    if (!user || !INTERNAL_HISTORY_VIEWS.includes(view)) return;

    const state = { lazisnuView: view };

    if (skipNextHistoryPushRef.current) {
      skipNextHistoryPushRef.current = false;
      window.history.replaceState(state, '', window.location.href);
      return;
    }

    if (window.history.state?.lazisnuView !== view) {
      window.history.pushState(state, '', window.location.href);
    }
  }, [user, view]);

  useEffect(() => {
    const handlePopState = () => {
      const currentUser = userRef.current;
      const currentView = viewRef.current;

      if (!currentUser || !INTERNAL_HISTORY_VIEWS.includes(currentView)) return;

      skipNextHistoryPushRef.current = true;

      if (currentView === 'invoice') {
        setView(invoiceBackViewRef.current || 'reports');
        return;
      }

      if (currentView !== 'dashboard') {
        setView('dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!user) return;

    let isCancelled = false;

    const validateSession = async () => {
      if (!sessionStorage.getItem(SESSION_STORAGE_KEY)) {
        clearStoredSession();
        setUser(null);
        setView('welcome');
        setIsSessionReady(true);
        return;
      }

      const validUser = await validateStoredUserWithDbFallback(user);

      if (isCancelled) return;

      if (!validUser) {
        clearStoredSession();
        setUser(null);
        setView('welcome');
        setIsSessionReady(true);
        return;
      }

      storeSessionUser(validUser);

      if (isRestorableView(view, validUser)) {
        sessionStorage.setItem(LAST_VIEW_STORAGE_KEY, view);
      }

      setIsSessionReady(true);
    };

    validateSession();

    return () => {
      isCancelled = true;
    };
  }, [user, view]);

  useEffect(() => {
    if (!user) return undefined;

    const validateActiveSession = async () => {
      if (!sessionStorage.getItem(SESSION_STORAGE_KEY)) {
        clearStoredSession();
        setUser(null);
        setView('welcome');
        setToast({ message: 'Sesi berakhir. Silakan masuk kembali.', type: 'error' });
        return;
      }

      const validUser = await validateStoredUserWithDbFallback(user);

      if (!validUser) {
        clearStoredSession();
        setUser(null);
        setView('welcome');
        setToast({ message: 'Sesi berakhir. Silakan masuk kembali.', type: 'error' });
      }
    };

    const handlePageShow = () => validateActiveSession();

    const handleStorageChange = (event) => {
      if ([SESSION_STORAGE_KEY, 'lazisnu_core_users'].includes(event.key)) validateActiveSession();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', validateActiveSession);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', validateActiveSession);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [user]);

  const handleLoginSuccess = (userData) => {
    storeSessionUser(userData);
    setUser(userData);
    showToast(`Selamat datang, ${userData.name}`);
    setView('modules');
  };
  const handleLogout = () => {
    clearStoredSession();
    setUser(null);
    setView('welcome');
  };

  useEffect(() => {
    // Style adjustments tailored for mobile experience and readability
    const style = document.createElement('style');
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      body { 
        font-family: 'Inter', sans-serif; 
        margin: 0; padding: 0; 
        -webkit-font-smoothing: antialiased; 
        overscroll-behavior-y: none; /* Prevent bounce on mobile */
      }
      .animate-fade-in { animation: fadeIn 0.3s ease-out; }
      .animate-fade-in-up { animation: fadeInUp 0.4s ease-out; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      
      /* Subtle Scrollbar */
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      .dark ::-webkit-scrollbar-track { background: transparent; }
      .dark ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      
      /* Fix iOS input zoom by enforcing 16px minimum text size */
      @media screen and (max-width: 768px) {
        input, select, textarea { font-size: 16px !important; }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <AppContext.Provider value={{ user, showToast, theme, toggleTheme }}>
        <div className="min-h-[100dvh] overflow-x-hidden bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-200 transition-colors duration-300 flex flex-col">
          {isBooting || !isSessionReady ? (
            <SplashScreen />
          ) : <>
            {view === 'welcome' && <WelcomeView onNext={() => setView('login')} />}
            {view === 'login' && <LoginView onLoginSuccess={handleLoginSuccess} showToast={showToast} />}
            {view === 'modules' && <ModuleSelectionView onSelectModule={setView} showToast={showToast} />}
            {['dashboard', 'products', 'sales', 'reports', 'spreadsheet', 'invoice', 'users', 'profit-settings'].includes(view) && user && (
              <DashboardLayout currentView={view} setView={setView} user={user} onLogout={handleLogout}>
                {view === 'dashboard' && <DashboardOverview setView={setView} />}
                {view === 'products' && <ProductsView showToast={showToast} />}
                {view === 'users' && user.role === 'owner' && <UsersView showToast={showToast} />}
                {view === 'sales' && <SalesView showToast={showToast} setView={setView} setInvoiceData={setInvoiceData} setInvoiceBackView={setInvoiceBackView} />}
                {view === 'reports' && <ReportsView setView={setView} setInvoiceData={setInvoiceData} setInvoiceBackView={setInvoiceBackView} showToast={showToast} />}
                {view === 'profit-settings' && user.role === 'owner' && <ProfitSettingsView showToast={showToast} />}
                {view === 'spreadsheet' && <SpreadsheetView showToast={showToast} />}
                {view === 'invoice' && <InvoiceView invoiceData={invoiceData} setView={setView} backView={invoiceBackView} />}
              </DashboardLayout>
            )}
          </>}

          {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
        </div>
      </AppContext.Provider>
    </div>
  );
}
