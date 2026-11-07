import {
  // Firebase
  db, COL, firebaseConfig,
  // Constants
  ELEC_METER_NO, ELEC_BASELINE_UNIT, ELEC_BASELINE_DATE, ELEC_RATE,
  WATER_RATE_PER_CAN, LANDLORD, BACKUP_EMAIL,
  MF, MS, MN, DOW, CAL_MONTHS, COLORS,
  CAT_GROUPS, getCatGroup,
  // Helpers
  $, esc, escQ, fmt, fmtAmt, fmt0, fmtDate, fmtDateShort, dayShort, fmtFull,
  monthLabel, localDateStr, today, mkey, mlabel, daysBetween, lastKeys,
  updateDateDayLabel, pmBadge, bars, avatarHTML, initials, hue,
  fillToday,
  latestActivity, fmtAgo, setHeaderLastActivity,
  // UI
  toast, pill, download, printLetterhead, openPrintWindow,
  showConfirm, ensureConfirmModal, closeMo, openMo,
  dataSaved, dataUpdated, dataDeleted,
  // Theme
  applyTheme, setThemeMode, setPalette, renderThemeGallery,
  // Session & header
  installSession, installHeader, setCounter, setSyncStatus,
  currentUser, isLoggedIn, touchSession,
  // CRUD
  addRecord, updateRecord, deleteRecord, setRecord,
  // History
  ACT, logHistory,
  // Export
  exportCSV, backupJSON, restoreJSON, readJSONFile, emailBackup,
  // Subscription
  subscribeCollection, subscribeDocument, registerUnsub,
  // Bootstrap
  initPage,
  // Settings
  saveHouseholdSettings, setSessionTimeout, HOUSEHOLD_SETTINGS,
  checkAutoClearHistory,           // ← ADD THIS LINE
  // Tab switcher
  switchTab, installSidebarTabs
} from './app.js';
/* ═══════════════════════════════════════════════════════════════
   PAGE STATE
   ═══════════════════════════════════════════════════════════════ */

// Data stores — populated by Firestore listeners
let expenses = [];
window.expenses = expenses; // Expose to window
let milkRecords     = []; // ADDED HERE to prevent initialization errors
let categories      = [];
let history         = [];
let elecReadings    = [];
let waterPurchases  = [];
let waterPayModes   = {};
let waterPayDates   = {};
let rentPayments    = [];

// Filter / sort / pagination
let filtered  = [];
let curPage   = 1;
const PG      = 25;
let sField    = 'date';
let sDir      = 'desc';
let histPage  = 1;
const HPG     = 20;
let curAnTab  = 'overview';

// Category picker values
let catVals = { add:'', edit:'', filter:'', catmon:'' };

// Multi-select for bulk delete
let selectedIds = new Set();

// Calendar view state
let calYear, calMonth;
(function initCal(){
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();
})();

// Date lock flag
let dateLocked = false;

// Default categories seeded on first install
const DEFAULT_CATS = [
  "Home Fitra","Home Fruits","Home Rations","Home Snacks","Home Travel","Home Vegetables",
  "Home Other Expenses","Home Electricity Bill","Home Rent","Home Gas Expenses",
  "Home Maid Expenses","Home NonVeg","Home Milk Expenses","Home Sadqah","Home Zakaat",
  "Saad Hospital","Saad Medicine","Saad School","Saad Shopping","Saad Snacks","Saad Travel",
  "Saif Medicine","Saif Office Food","Saif Office Travel","Saif Saloon","Saif Shopping",
  "Saif Snacks","Saif Travel","Saif Cycle Expenses","Saif Recharge",
  "Seema Hospital","Seema Medicine","Seema Recharge","Seema Shopping","Seema Travel","Seema Snacks",
  "Shama Hospital","Shama Medicine","Shama Recharge","Shama Shopping",
  "Subscription Muharram","Subscription WIFI","Subscription Water","Subscription Youtube",
  "No Expense","Miscellaneous","Cash Withdraw"
];

const REQUIRED_CATS = [
  "Home Gas Expenses","Home Maid Expenses","Home NonVeg","Home Milk Expenses",
  "Home Sadqah","Home Zakaat","Seema Snacks","Saif Recharge"
];


/* ═══════════════════════════════════════════════════════════════
   BOOTSTRAP — initPage wires theme, session, header, network
   ═══════════════════════════════════════════════════════════════ */
initPage({
  appName: 'Household Tracker',
  counters: [
    { id:'records',   icon:'📊', label:'rec',  value: 0 },
    { id:'cats',      icon:'📂', label:'cat',  value: 0 },
    { id:'rent',      icon:'🏠', label:'rent', value: 0 },
    { id:'elec',      icon:'⚡', label:'elec', value: 0 },
    { id:'water',     icon:'💧', label:'H2O',  value: 0 },
    { id:'milk',      icon:'🥛', label:'milk', value: 0 }
  ],
  onReady: () => {
    // Wire tabs after login
    installSidebarTabs();
    startPageListeners();
    hydrateUI();
  }
});


/* ═══════════════════════════════════════════════════════════════
   UI HYDRATION — one-time DOM setup after login
   ═══════════════════════════════════════════════════════════════ */
function hydrateUI(){
  // Populate year dropdowns
  populateYearSelectors();

  // Categories are seeded automatically inside loadCategories() now

  // Set default dates
  // Set default dates
['f-date','rent-paid-date','elec-date','elec-paid-date','water-date']
  .forEach(id => fillToday(id));

// Populate day-of-week badges on first load
updateDateDayLabel('f-date','f-date-day');
updateDateDayLabel('elec-date','elec-date-day');
updateDateDayLabel('water-date','water-date-day');

  // Set default month inputs
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  ['rent-month','elec-month'].forEach(id => {
    const el = $(id);
    if (el && !el.value) el.value = ym;
  });

  // Render theme gallery in Settings
  renderThemeGallery('palette-gallery', renderSettingsUI);

  // Initial renders
  renderSettingsUI();
  renderAll();
}


/* ═══════════════════════════════════════════════════════════════
   CATEGORIES SEEDING
   ═══════════════════════════════════════════════════════════════ */
/* seedCategories removed — folded into loadCategories() */

// Needed imports that aren't in our main import list
import {
  collection, doc, getDoc, getDocs, writeBatch,
  getDocsFromCache // <-- Add this
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


/* ═══════════════════════════════════════════════════════════════
   PAGE LISTENERS — live Firestore subscriptions
   ═══════════════════════════════════════════════════════════════ */
async function loadExpenses() {
  const loader = document.getElementById('global-loader');
  window._expensesLoaded = false;

  // ── CHECK 1: LOCAL STORAGE ──
  const cached = localStorage.getItem('cache_expenses');
  const cacheTime = localStorage.getItem('cache_expenses_time');
  const isFresh = cacheTime && (Date.now() - parseInt(cacheTime) < 24 * 60 * 60 * 1000);

  if (cached && isFresh) {
    try {
      expenses = JSON.parse(cached);
      window._expensesLoaded = true;
      setCounter('records', expenses.length);
      setSyncStatus('live');
      renderAll();
      renderCombinedReport();
      renderDashRecent();
      renderDashboardTiles();
      populateYearSelectors();
      if (loader) loader.classList.remove('active');
      return; // Done! 0 reads used.
    } catch (e) {
      localStorage.removeItem('cache_expenses');
    }
  }

  // ── CHECK 2: FIREBASE INDEXEDDB CACHE (The Laptop Restart Saver) ──
  // If localStorage is empty, but the 24 hours haven't passed, try IndexedDB.
  if (isFresh && !cached) { 
    try {
      const snap = await getDocsFromCache(collection(db, COL.EXPENSE));
      if (snap.docs.length > 0) {
        expenses = snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
                            .sort((a,b) => String(b.date).localeCompare(String(a.date)));
        window._expensesLoaded = true;
        
        // Sync it back to localStorage for next time
        try { localStorage.setItem('cache_expenses', JSON.stringify(expenses)); } catch(e) {}

        setCounter('records', expenses.length);
        setSyncStatus('live');
        renderAll();
        renderCombinedReport();
        renderDashRecent();
        renderDashboardTiles();
        populateYearSelectors();
        if (loader) loader.classList.remove('active');
        return; // Done! 0 reads used.
      }
    } catch (e) {
      console.log("IndexedDB cache miss or empty, falling back to server.");
    }
  }

  // ── CHECK 3: FIREBASE SERVER (The Heavy Download) ──
  if (loader) {
    loader.classList.add('active');
    loader.style.width = '20%';
    setTimeout(() => { loader.style.width = '50%'; }, 300);
    setTimeout(() => { loader.style.width = '80%'; }, 800);
  }

  try {
    const snap = await getDocs(collection(db, COL.EXPENSE));
    expenses = snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
                        .sort((a,b) => String(b.date).localeCompare(String(a.date)));
    
    window._expensesLoaded = true;
    
    // Save to LocalStorage & update timestamp
    try { 
      localStorage.setItem('cache_expenses', JSON.stringify(expenses)); 
      localStorage.setItem('cache_expenses_time', Date.now().toString());
    } catch(e) {}

    setCounter('records', expenses.length);
    setSyncStatus('live');
    renderAll();
    renderCombinedReport();
    renderDashRecent();
    renderDashboardTiles();
    populateYearSelectors();
  } catch (e) {
    console.error('Failed to load expenses:', e);
    window._expensesLoaded = true;
  } finally {
    if (loader) {
      loader.style.width = '100%';
      setTimeout(() => {
        loader.classList.remove('active');
        setTimeout(() => { loader.style.width = '0%'; }, 300);
      }, 400);
    }
  }
}

async function loadCategories() {
  // 1. Check if we have a valid category cache (less than 24 hours old)
  const cachedCats = localStorage.getItem('cache_categories');
  const cacheTime = localStorage.getItem('cache_categories_time');
  const isFresh = cacheTime && (Date.now() - parseInt(cacheTime) < 24 * 60 * 60 * 1000);

  if (cachedCats && isFresh) {
    try {
      categories = JSON.parse(cachedCats);
      setCounter('cats', categories.length);
      buildAllDropdowns();
      renderCatMgr();
      if (typeof renderDashboardTiles === 'function') renderDashboardTiles();
      return; // Exit early! 0 reads used.
    } catch (e) {
      localStorage.removeItem('cache_categories');
    }
  }

  // 2. If no cache, fetch from Firebase
  try {
    let snap = await getDocs(collection(db, COL.CATEGORY));
    
    // Seed if empty (your original logic)
    if (snap.empty) {
      const batch = writeBatch(db);
      DEFAULT_CATS.forEach(name => {
        batch.set(doc(collection(db, COL.CATEGORY)), { name, createdAt: new Date().toISOString() });
      });
      await batch.commit();
      snap = await getDocs(collection(db, COL.CATEGORY)); 
    } else {
      const existing = new Set(snap.docs.map(d => (d.data().name || '').toLowerCase()));
      const missing = REQUIRED_CATS.filter(n => !existing.has(n.toLowerCase()));
      if (missing.length) {
        const batch = writeBatch(db);
        missing.forEach(name => {
          batch.set(doc(collection(db, COL.CATEGORY)), { name, createdAt: new Date().toISOString() });
        });
        await batch.commit();
        snap = await getDocs(collection(db, COL.CATEGORY)); 
      }
    }

    categories = snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
                         .sort((a,b) => (a.name||'').localeCompare(b.name||''));

    // 3. Save to LOCAL storage with a timestamp
    try { 
      localStorage.setItem('cache_categories', JSON.stringify(categories)); 
      localStorage.setItem('cache_categories_time', Date.now().toString());
    } catch(e) {}

    setCounter('cats', categories.length);
    buildAllDropdowns();
    renderCatMgr();
    if (typeof renderDashboardTiles === 'function') renderDashboardTiles();
  } catch (e) {
    console.error('Failed to load categories:', e);
  }
}

function startPageListeners(){

    // ── Expenses ── (One-shot fetch)
  loadExpenses();

      // ── Categories ── (Fetched once to save quota)
  loadCategories();

  // ── History ──
  subscribeCollection(COL.HISTORY, rows => {
    history = rows;
    renderHistory();
  }, null, 'timestamp');

  // ── Electricity ──
  subscribeCollection(COL.ELEC, rows => {
    elecReadings = rows.sort((a,b) => (a.month||'').localeCompare(b.month||''));
    setCounter('elec', rows.length);
    if ($('tab-electricity').classList.contains('active')) renderElectricityTab();
    renderAll();
    renderCombinedReport();
  });

  // ── Water ──
  subscribeCollection(COL.WATER, rows => {
    waterPurchases = rows.sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
    setCounter('water', rows.length);
    if ($('tab-water').classList.contains('active')) renderWaterTab();
    renderAll();
    renderCombinedReport();
  });

  // ── Water payment modes ──
  // ── Water payment modes ──
subscribeCollection(COL.WATER_PAY, rows => {
  waterPayModes = {};
  waterPayDates = {};
  rows.forEach(r => {
    waterPayModes[r.id] = r.mode;
    if (r.paidOn) waterPayDates[r.id] = r.paidOn;
  });
  if ($('tab-water').classList.contains('active')) renderWaterTab();
  renderCombinedReport();
});

  // ── Rent ──
  subscribeCollection(COL.RENT, rows => {
    rentPayments = rows.sort((a,b) => (b.month||b.date||'').localeCompare(a.month||a.date||''));
    setCounter('rent', rows.length);
    if ($('tab-rent').classList.contains('active')) renderRentTab();
    renderAll();
    renderCombinedReport();
  });
}


/* ═══════════════════════════════════════════════════════════════
   MASTER RENDER DISPATCHER
   ═══════════════════════════════════════════════════════════════ */
function renderAll(){
  renderDashboardTiles();
  renderDaily();
  renderCalendar(); // Keep calendar, but skip records
  renderLastActivity();
  
  // Only render records if the tab is actually active
  if (document.getElementById('tab-records')?.classList.contains('active')) {
    renderRecords();
  }
}

/* ═══════════════════════════════════════════════════════════════
   LAST-ACTIVITY BADGES
   Updates per-module badges + header global pill.
   ═══════════════════════════════════════════════════════════════ */
function renderLastActivity(){
  // If we are on the tracker and expenses are still loading, don't update the header yet
  if (window._expensesLoaded === false) return;

  const dailyIso = latestActivity(expenses);
  const rentIso  = latestActivity(rentPayments);
  const elecIso  = latestActivity(elecReadings);
  const waterIso = latestActivity(waterPurchases);
  const milkIso  = latestActivity(milkRecords);

  // Update the record counts
  if ($('daily-rec-count')) $('daily-rec-count').textContent = expenses.length;
  if ($('rent-rec-count'))  $('rent-rec-count').textContent = rentPayments.length;
  if ($('elec-rec-count'))  $('elec-rec-count').textContent = elecReadings.length;
  if ($('water-rec-count')) $('water-rec-count').textContent = waterPurchases.length;
  if ($('milk-rec-count'))  $('milk-rec-count').textContent = milkRecords.length;

  // Per-module badges
  const setBadge = (id, iso) => {
    const el = $(id);
    if (!el) return;
    el.textContent = iso ? fmtAgo(iso) : '—';
    el.title = iso ? new Date(iso).toLocaleString('en-IN') : 'No activity yet';
  };
  setBadge('last-daily', dailyIso);
  setBadge('last-rent',  rentIso);
  setBadge('last-elec',  elecIso);
  setBadge('last-water', waterIso);
  setBadge('last-milk',  milkIso);

  // Header global pill
  const globalIso = latestActivity([
    { createdAt: dailyIso },
    { createdAt: rentIso },
    { createdAt: elecIso },
    { createdAt: waterIso },
    { createdAt: milkIso }
  ]);
  setHeaderLastActivity(globalIso);
}

// NEW: Automatically update the "X mins ago" text every 60 seconds
setInterval(() => {
  // Only run if the app has finished loading data
  if (window.__householdSettingsLoaded || expenses.length > 0) {
    renderLastActivity();
  }
}, 60000);

function renderTabContent(tabId){
  switch (tabId){
    case 'dashboard':   renderDashboardTiles(); renderCombinedReport(); renderDashRecent(); break;
    case 'daily':       renderDaily(); break;
    case 'records':     renderRecords(); renderCalendar(); break;
    case 'analytics':   renderAnTab(curAnTab); break;
    case 'categories':  renderCatMgr(); break;
    case 'history':     histPage = 1; renderHistory(); break;
    case 'export':      updateBackupStatusUI(); break;
    case 'rent':        renderRentTab(); break;
    case 'electricity': renderElectricityTab(); break;
    case 'water':       renderWaterTab(); break;
    case 'milk':        renderMilkTab(); break;
    case 'settings':    
      renderSettingsUI(); 
      // Set the date picker to local IST date before loading stats
      if ($('stat-date-pick')) {
        const now = new Date();
        $('stat-date-pick').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      }
      loadSessionStats(); 
      updateBackupStatusUI(); // <--- ADD THIS LINE
      break;
  }
}

// Hook into switchTab from app.js
window.__onTabChange = (tabId) => {
  const counters = $('dashboard-counters');
  if (counters) {
    counters.style.display = (tabId === 'dashboard') ? 'grid' : 'none';
  }
  renderTabContent(tabId);
};


/* ═══════════════════════════════════════════════════════════════
   DASHBOARD TILES + COMBINED SUMMARY + RECENT
   ═══════════════════════════════════════════════════════════════ */
function renderDashboardTiles(){
  // Update the new Bento-style counters
  if ($('dc-rec')) {
    $('dc-rec').textContent = expenses.length;
    $('dc-cat').textContent = categories.length;
    $('dc-rent').textContent = rentPayments.length;
    $('dc-elec').textContent = elecReadings.length;
    $('dc-water').textContent = waterPurchases.length;
    $('dc-milk').textContent = milkRecords.length;
  }

  const now = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const curY  = String(now.getFullYear());

    // One-pass calculation for all tiles
  let dailyMAmt = 0, dailyMCount = 0, dailyYAmt = 0;
  expenses.forEach(e => {
    if (e.category === 'No Expense') return;
    const amt = +e.amount || 0;
    if (String(e.date).startsWith(curY)) dailyYAmt += amt;
    if (String(e.date).startsWith(curYM)) { dailyMAmt += amt; dailyMCount++; }
  });
  $('tile-daily-amt').textContent = '₹' + fmtAmt(dailyMAmt);
  $('tile-daily-sub').textContent = `${dailyMCount} entries this month · YTD ₹${fmtAmt(dailyYAmt)}`;

  // Rent
  let rentMAmt = 0, rentMCount = 0, rentYAmt = 0;
  rentPayments.forEach(r => {
    const amt = +r.amount || 0;
    const m = r.month || r.date || '';
    if (m.startsWith(curY)) rentYAmt += amt;
    if (m.startsWith(curYM)) { rentMAmt += amt; rentMCount++; }
  });
  $('tile-rent-amt').textContent = '₹' + fmtAmt(rentMAmt);
  $('tile-rent-sub').textContent = `${rentMCount} payment(s) this month · YTD ₹${fmtAmt(rentYAmt)}`;

  // Electricity
  let elecMAmt = 0, elecMUnits = 0, elecYAmt = 0;
  getElecComputed().forEach(r => {
    if (r.month.startsWith(curY)) elecYAmt += r.amount;
    if (r.month === curYM) { elecMAmt += r.amount; elecMUnits += r.consumed; }
  });
  $('tile-elec-amt').textContent = '₹' + fmtAmt(elecMAmt);
  $('tile-elec-sub').textContent = `${elecMUnits} units this month · YTD ₹${fmtAmt(elecYAmt)}`;

  // Water
  let waterMAmt = 0, waterMCount = 0, waterYAmt = 0;
  waterPurchases.forEach(w => {
    const amt = +w.amount || 0;
    if (String(w.date).startsWith(curY)) waterYAmt += amt;
    if (String(w.date).startsWith(curYM)) { waterMAmt += amt; waterMCount++; }
  });
  $('tile-water-amt').textContent = '₹' + fmtAmt(waterMAmt);
  $('tile-water-sub').textContent = `${waterMCount} cans this month · YTD ₹${fmtAmt(waterYAmt)}`;

  // Milk
  let milkMAmt = 0, milkMCount = 0, milkYAmt = 0, milkQty = 0;
  milkRecords.forEach(m => {
    const amt = +m.amount || 0;
    if (String(m.date).startsWith(curY)) milkYAmt += amt;
    if (String(m.date).startsWith(curYM)) { milkMAmt += amt; milkMCount++; milkQty += (+m.unit || 0); }
  });
  $('tile-milk-amt').textContent = '₹' + fmtAmt(milkMAmt);
  $('tile-milk-sub').textContent = `${fmtAmt(milkQty)} kg this month · YTD ₹${fmtAmt(milkYAmt)}`;

  // Combined monthly summary elements removed from dashboard
  
  // Note: c-grand and c-grand-year removed from UI
}

function renderDashRecent(){
  const real = expenses.filter(e => e.category !== 'No Expense');
  const recent = [...real]
    .sort((a,b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10);
  $('dash-recent-badge').textContent = `${recent.length} of ${real.length}`;
  $('dash-recent-tbody').innerHTML = recent.length
    ? recent.map((e,i) => `<tr>
        <td data-label="#">${i+1}</td>
        <td data-label="Date" class="dc">${fmtDate(e.date)}</td>
        <td data-label="Category"><span class="cb">${esc(e.category)}</span></td>
        <td data-label="Amount" class="amc">₹${fmtAmt(e.amount)}</td>
        <td data-label="Mode">${e.category === 'No Expense' ? '<span class="dc">—</span>' : pmBadge(e.paymentMode)}</td>
        <td data-label="Note" class="nc">${esc(e.note || '—')}</td>
        <td data-label="Actions"><div class="ab">
          <button class="btn bo bxs" onclick="openEditMo('${e.id}')" type="button">✏️</button>
          <button class="btn bd bxs" onclick="deleteExp('${e.id}')" type="button">🗑️</button>
        </div></td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="es"><div class="ei">📭</div><p>No expenses yet</p></td></tr>`;
}


/* ═══════════════════════════════════════════════════════════════
   DAILY EXPENSE TAB
   ═══════════════════════════════════════════════════════════════ */
function renderDaily(){
  const todayStr = localDateStr();
  const now = new Date();
  const tm  = now.getMonth() + 1;
  const ty  = now.getFullYear();

  const real = expenses.filter(e => e.category !== 'No Expense');
  const sum  = arr => arr.reduce((s,e) => s + (+e.amount || 0), 0);

  const tE = real.filter(e => e.date === todayStr);
  const mE = real.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getMonth() + 1 === tm && d.getFullYear() === ty;
  });
  const yE = real.filter(e => new Date(e.date + 'T00:00:00').getFullYear() === ty);

  $('s-today').textContent = '₹' + fmtAmt(sum(tE));
  $('s-month').textContent = '₹' + fmtAmt(sum(mE));
  $('s-year').textContent  = '₹' + fmtAmt(sum(yE));
  $('s-total').textContent = '₹' + fmtAmt(sum(real));
  $('s-today-c').textContent = `${tE.length} entries`;
  $('s-month-c').textContent = `${mE.length} entries`;
  $('s-year-c').textContent  = `${yE.length} entries`;
  $('s-total-c').textContent = `${real.length} entries`;

  // Today's entries (in the Daily tab, not the dashboard)
  const recent = [...real]
    .sort((a,b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10);
    $('rec-badge').textContent = `${recent.length} of ${real.length}`;
  renderRecordsTable('rec-tbody', recent, 0);
  
  if (window.updateAddDateCount) window.updateAddDateCount();
}

function renderRecordsTable(tbodyId, rows, offset){
  const tb = $(tbodyId);
  if (!tb) return;
  if (!rows.length){
        tb.innerHTML = `<tr><td colspan="6" class="es"><div class="ei">📭</div><p>No entries</p></td></tr>`;
    return;
  }
    tb.innerHTML = rows.map((e,i) => `<tr>
    <td data-label="#">${offset + i + 1}</td>
    <td data-label="Date" class="dc">${fmtDate(e.date)}</td>
    <td data-label="Category"><span class="cb">${esc(e.category)}</span></td>
    <td data-label="Amount" class="amc">₹${fmtAmt(e.amount)}</td>
    <td data-label="Note" class="nc">${esc(e.note || '—')}</td>
    <td data-label="Actions"><div class="ab">
      <button class="btn bo bxs" onclick="openEditMo('${e.id}')" type="button">✏️</button>
      <button class="btn bd bxs" onclick="deleteExp('${e.id}')" type="button">🗑️</button>
    </div></td>
  </tr>`).join('');
}


/* ═══════════════════════════════════════════════════════════════
   RECORDS TAB — filters, calendar, table, pagination
   ═══════════════════════════════════════════════════════════════ */
function renderRecords(){
  applyFilters();
}

function applyFilters(){
  const q   = ($('r-search')?.value || '').toLowerCase().trim();
  const yr  = $('r-year')?.value || '';
  const mon = $('r-month')?.value || '';
  const day = $('r-day')?.value || '';
  const cat = $('r-cat')?.value || '';

  filtered = expenses.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    if (yr && d.getFullYear() !== parseInt(yr)) return false;
    if (mon && d.getMonth()+1 !== parseInt(mon)) return false;
    if (day && e.date !== day) return false;
    if (cat && e.category !== cat) return false;
    if (q){
      const hay = `${e.date} ${e.category} ${e.amount} ${e.note || ''} ${e.paymentMode || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a,b) => {
    let va = a[sField], vb = b[sField];
    if (sField === 'date'){ va = new Date(va + 'T00:00:00'); vb = new Date(vb + 'T00:00:00'); }
    if (sField === 'amount'){ va = +va; vb = +vb; }
    return (va < vb ? -1 : va > vb ? 1 : 0) * (sDir === 'asc' ? 1 : -1);
  });

  const total = filtered.reduce((s,e) => s + (+e.amount || 0), 0);
   const sumEl = $('f-summary');
  if (sumEl) sumEl.textContent = `${filtered.length} records | ₹${total.toLocaleString('en-IN',{minimumFractionDigits:2})}`;

  // Force the All Records accordion to open if a filter is active
  const recordsAccordion = document.getElementById('all-records-details');
  if (recordsAccordion) recordsAccordion.setAttribute('open', '');

  curPage = 1;
  renderRecPage();
};

function renderRecPage(){
  clearSelection(); // <-- CLEAR SELECTION ON EVERY RENDER/FILTER
  const total = filtered.length;
  window.__isDataRefresh = false; // Reset flag after rendering
  const pages = Math.ceil(total / PG) || 1;
  if (curPage > pages) curPage = pages;
  const start = (curPage - 1) * PG;
  const badge = $('all-badge');
  if (badge) badge.textContent = `${total} records`;

  // Calculate and display the total amount for the filtered records
  const totalAmt = filtered.reduce((sum, e) => sum + (+e.amount || 0), 0);
  const totalEl = $('all-total');
  if (totalEl) totalEl.textContent = '₹' + fmtAmt(totalAmt);

  renderAllRecordsTable(filtered.slice(start, start + PG), start);
  renderPag(pages, total);
}

function renderAllRecordsTable(rows, offset){
  const tb = $('all-tbody');
  if (!tb) return;
  if (!rows.length){
    tb.innerHTML = `<tr><td colspan="8" class="es"><div class="ei">📭</div><p>No records found</p></td></tr>`;
    return;
  }
  tb.innerHTML = rows.map((e,i) => {
    const checked = selectedIds.has(e.id) ? 'checked' : '';
    const rowCls  = selectedIds.has(e.id) ? ' class="row-selected"' : '';
    return `<tr${rowCls}>
      <td><input type="checkbox" data-id="${e.id}" ${checked} onchange="toggleRowSel(this,'${e.id}')"/></td>
      <td data-label="#">${offset + i + 1}</td>
      <td data-label="Date" class="dc">${fmtDate(e.date)}</td>
      <td data-label="Category"><span class="cb">${esc(e.category)}</span></td>
      <td data-label="Amount" class="amc">₹${fmtAmt(e.amount)}</td>
      <td data-label="Mode">${pmBadge(e.paymentMode)}</td>
      <td data-label="Note" class="nc">${esc(e.note || '—')}</td>
      <td data-label="Actions"><div class="ab">
        <button class="btn bo bxs" onclick="openEditMo('${e.id}')" type="button">✏️</button>
        <button class="btn bd bxs" onclick="deleteExp('${e.id}')" type="button">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
  updateBulkToolbar();
}

function renderPag(pages, total){
  const el = $('pagination');
  if (!el) return;
  if (pages <= 1){ el.innerHTML = ''; return; }
  const s = (curPage - 1) * PG + 1;
  const e = Math.min(curPage * PG, total);
  let btns = '';
  for (let i = 1; i <= pages; i++){
    if (i === 1 || i === pages || Math.abs(i - curPage) <= 1){
      btns += `<button class="pb ${i === curPage ? 'active' : ''}" data-p="${i}" type="button">${i}</button>`;
    } else if (Math.abs(i - curPage) === 2){
      btns += `<span style="padding:4px 2px;color:var(--muted)">…</span>`;
    }
  }
  el.innerHTML = `<span class="pi">Showing ${s}–${e} of ${total}</span>
    <div class="pb2">
      <button class="pb" data-p="${curPage-1}" ${curPage===1?'disabled':''} type="button">◀</button>
      ${btns}
      <button class="pb" data-p="${curPage+1}" ${curPage===pages?'disabled':''} type="button">▶</button>
    </div>`;
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    const p = parseInt(b.dataset.p);
    if (p >= 1 && p <= pages){ 
      curPage = p; 
      clearSelection(); // <-- CLEAR SELECTION ON PAGE CHANGE
      renderRecPage(); 
    }
  });
}

window.applyFilters = applyFilters;

window.doSort = function(field){
  sDir = sField === field ? (sDir === 'asc' ? 'desc' : 'asc') : 'desc';
  sField = field;
  applyFilters();
};

window.clearFilters = function(){
  ['r-search','r-day','r-year','r-month'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  setCat('filter', '');
  applyFilters();
  pill('Filters reset', '↺');
};


/* ═══════════════════════════════════════════════════════════════
   CALENDAR
   ═══════════════════════════════════════════════════════════════ */
function renderCalendar(){
  const grid = $('cal-grid');
  if (!grid) return;

  buildCalSelectors();

  const firstDow    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const todayStr    = localDateStr();

    const counts    = {};
  const amounts   = {};
  const noExpDays = new Set();

  expenses.forEach(e => {
    const d = new Date(e.date + 'T00:00:00');
    if (d.getFullYear() === calYear && d.getMonth() === calMonth){
      if (e.category === 'No Expense') noExpDays.add(e.date);
      else {
        counts[e.date]  = (counts[e.date]  || 0) + 1;
        amounts[e.date] = (amounts[e.date] || 0) + (+e.amount || 0);
      }
    }
  });

  /* Monthly total for the header badge */
  const monthTotal = Object.values(amounts).reduce((s, v) => s + v, 0);
  const monthCount = Object.values(counts).reduce((s, v) => s + v, 0);
  const totalEl = $('cal-total');
  if (totalEl){
    totalEl.textContent = monthCount
      ? `${monthCount} rec · ₹${fmtAmt(monthTotal)}`
      : 'No records this month';
  }

  let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    .map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++){
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const c = counts[dateStr] || 0;
    const isToday  = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    const isNoExp  = noExpDays.has(dateStr) && c === 0;

    html += `<div class="cal-day${isToday?' cd-today':''}${isNoExp?' cd-noexp':''}${isFuture?' cd-future':''}"
                  onclick="calDayClick('${dateStr}')"
                  title="${dateStr}">
      <div class="cd-num">${day}</div>
      ${isFuture ? ''
        : c > 0 ? `<div class="cd-count">${c} rec</div><div class="cd-amt">₹${fmtAmt(amounts[dateStr])}</div>`
        : isNoExp ? `<div class="cd-noexp-lbl">✅</div>`
        : '<div class="cd-na">N/A</div>'}
    </div>`;
  }
  grid.innerHTML = html;
}

function buildCalSelectors(){
  const mSel = $('cal-sel-month');
  const ySel = $('cal-sel-year');
  if (!mSel || !ySel) return;

  mSel.innerHTML = CAL_MONTHS.map((m,i) =>
    `<option value="${i}"${i === calMonth ? ' selected' : ''}>${m}</option>`).join('');

  const nowY = new Date().getFullYear();
  const years = expenses.map(e => parseInt((e.date || '').slice(0,4))).filter(Boolean);
  const minY = years.length ? Math.min(...years) : nowY - 5;
  const maxY = nowY + 1;

  ySel.innerHTML = '';
  for (let y = maxY; y >= minY; y--){
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === calYear) opt.selected = true;
    ySel.appendChild(opt);
  }
}

window.calSelChange = function(){
  const mSel = $('cal-sel-month');
  const ySel = $('cal-sel-year');
  if (mSel) calMonth = parseInt(mSel.value);
  if (ySel) calYear  = parseInt(ySel.value);
  renderCalendar();
};

window.changeCalMonth = function(delta){
  calMonth += delta;
  if (calMonth < 0){ calMonth = 11; calYear--; }
  if (calMonth > 11){ calMonth = 0;  calYear++; }
  renderCalendar();
};

window.jumpCalToday = function(){
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
};

window.calDayClick = function(dateStr){
  if (dateStr > localDateStr()) return;
  switchTab('records', document.querySelector('[data-tab="records"]'));
  const s = $('r-search'); if (s) s.value = '';
  const d = $('r-day');    if (d) d.value = dateStr;
  
  // Force the All Records accordion to open
  const details = document.getElementById('all-records-details');
  if (details) details.setAttribute('open', '');
  
  applyFilters();
  toast(`📅 Showing records for ${dateStr}`, 'info');
};


/* ═══════════════════════════════════════════════════════════════
   EXPENSE CRUD
   ═══════════════════════════════════════════════════════════════ */
window.toggleDateLock = function(){
  dateLocked = !dateLocked;
  const btn   = $('date-lock-btn');
  const hint  = $('date-lock-hint');
  const input = $('f-date');
  if (!btn || !input) return;

  if (dateLocked){
    btn.textContent = '🔒 Date locked';
    btn.classList.add('locked');
    const locked = input.value || localDateStr();
    input.value = locked;
    const d = new Date(locked + 'T00:00:00');
    hint.textContent = `📌 Locked to ${d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}`;
    } else {
    btn.textContent = '🔓 Lock date';
    btn.classList.remove('locked');
    hint.textContent = '';
    // Removed input.value = localDateStr(); so the date stays where you left it
    updateDateDayLabel('f-date','f-date-day');
    if (window.updateAddDateCount) window.updateAddDateCount();
  }
};

window.updateAddDateCount = function(){
  const d = $('f-date')?.value;
  const el = $('add-date-count');
  if (!d || !el) return;
  
  // Count records from the main data array
  const count = expenses.filter(e => e.date === d).length;
  
  el.textContent = count === 1 ? '1 record on this day' : `${count} records on this day`;
  el.style.background = count > 0 ? 'var(--pl)' : 'var(--sec)';
  el.style.color = count > 0 ? 'var(--p)' : 'var(--muted)';
};

window.clearForm = function(){
  ['f-amount','f-note'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  
  setCat('add', '');
  if (!dateLocked){
    const d = $('f-date');
    if (d) d.value = localDateStr();
  }
    updateDateDayLabel('f-date','f-date-day');
  if (window.updateAddDateCount) window.updateAddDateCount();
  setTimeout(() => $('f-amount')?.focus(), 50);
};

window.focusAdd = function(){
  switchTab('daily', document.querySelector('[data-tab="daily"]'));
  setTimeout(() => $('f-amount')?.focus(), 200);
};

window.saveExp = async function(force){
  const date    = $('f-date').value;
  let amount    = parseFloat($('f-amount').value);
  const cat     = $('f-cat').value;
  const note    = ($('f-note').value || '').trim();
  let payMode   = $('f-pay').value;

  if (!date){ toast('Select a date.', 'error'); return; }
  if (!cat){ toast('Select a category.', 'error'); return; }

  const isNoExpense = cat === 'No Expense';

  // 1. Force amount to 0 and payMode to empty for "No Expense"
  if (isNoExpense) {
    amount = 0;
    payMode = '';
  } else {
    // Only validate amount if it's NOT "No Expense"
    if (isNaN(amount) || amount < 0){ 
      toast('Enter a valid amount.', 'error'); 
      return; 
    }
  }

  // 2. Prevent duplicates and conflicts
  const dayEntries = expenses.filter(e => e.date === date);
  if (isNoExpense) {
    if (dayEntries.some(e => e.category !== 'No Expense')) {
      toast('❌ Cannot mark as "No Expense" because other expenses already exist on this date.', 'error');
      return;
    }
    if (dayEntries.some(e => e.category === 'No Expense')) {
      toast('❌ This date is already marked as "No Expense".', 'error');
      return;
    }
  } else {
    if (dayEntries.some(e => e.category === 'No Expense')) {
      toast('❌ This date is marked as "No Expense". Please delete that entry first.', 'error');
      return;
    }
  }

  if (!force && !isNoExpense){
    const dup = expenses.find(e =>
      e.date === date && e.category === cat && Math.abs((+e.amount || 0) - amount) < 0.01);
    if (dup){
      showConfirm(
        '⚠️ Possible Duplicate',
        `<div class="confirm-box"><div class="impact">A similar entry already exists for this date:</div>
         <div style="margin-top:8px;font-size:.82rem">${fmtDate(date)} | <strong>${esc(cat)}</strong> | ₹${fmtAmt(amount)}</div></div>
         <p style="font-size:.8rem;color:var(--muted);margin-top:10px">Save anyway?</p>`,
        'Save Anyway',
        () => saveExp(true),
        'bp'
      );
      return;
    }
  }

  const res = await addRecord(COL.EXPENSE,
    { date, amount, category: cat, note, paymentMode: payMode },
    {
      pillMsg: isNoExpense ? 'Day marked as No Expense' : 'Expense saved',
      pillIcon: isNoExpense ? '✅' : '💾',
      historyAction: ACT.CREATE,
      historyData: { date, amount, category: cat, note, paymentMode: payMode }
    });

    if (res.ok) { 
    // 1. Instantly add the new record to the local array
    expenses.unshift({ id: res.id, date, amount, category: cat, note, paymentMode: payMode, createdAt: new Date().toISOString() });
    expenses.sort((a,b) => String(b.date).localeCompare(String(a.date)));

    // 2. Save the updated array to the cache
    try { localStorage.setItem('cache_expenses', JSON.stringify(expenses)); } catch(e) {}

    // 3. Re-render the UI instantly without a network call
    renderAll();
    renderCombinedReport();
    renderDashRecent();
    renderDashboardTiles();

    // 4. Clear the form
    clearForm(); 

    // Increment backup counter
    let currentCount = parseInt(localStorage.getItem('backup_entry_count') || '0');
    localStorage.setItem('backup_entry_count', (currentCount + 1).toString());
    
    if (typeof updateBackupStatusUI === 'function') updateBackupStatusUI();
  }
};

window.openEditMo = function(id){
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  $('m-id').value     = id;
  $('m-date').value   = e.date;
  $('m-amount').value = e.amount;
  $('m-note').value   = e.note || '';
  
  const isNoExp = e.category === 'No Expense';
  $('m-pay').value    = isNoExp ? '' : (e.paymentMode || 'UPI');
  $('m-pay').disabled = isNoExp;
  $('m-amount').disabled = isNoExp; // Disable amount field too
  
  setCat('edit', e.category);
  $('edit-mo').classList.add('open');
};

window.updateExp = async function(){
  const id      = $('m-id').value;
  const date    = $('m-date').value;
  let amount    = parseFloat($('m-amount').value);
  const cat     = $('m-cat').value;
  const note    = ($('m-note').value || '').trim();
  let payMode   = $('m-pay').value;

  if (!date || !cat){
    toast('Fill all required fields.', 'error');
    return;
  }

  const isNoExpense = cat === 'No Expense';

  if (isNoExpense) {
    amount = 0;
    payMode = '';
  } else {
    if (isNaN(amount) || amount < 0){
      toast('Enter a valid amount.', 'error');
      return;
    }
  }

  const old = expenses.find(e => e.id === id);
  if (!old) return;

  const changes = [];
  if (old.date !== date)       changes.push({ field:'Date',   from: fmtDate(old.date),      to: fmtDate(date) });
  if (old.amount !== amount)   changes.push({ field:'Amount', from: `₹${fmtAmt(old.amount)}`, to: `₹${fmtAmt(amount)}` });
  if (old.category !== cat)    changes.push({ field:'Category', from: old.category,           to: cat });
  if ((old.note || '') !== note) changes.push({ field:'Note', from: old.note || '(none)',    to: note || '(none)' });
  if ((old.paymentMode || 'UPI') !== payMode)
    changes.push({ field:'Payment Mode', from: old.paymentMode || 'UPI', to: payMode });

  const res = await updateRecord(COL.EXPENSE, id,
    { date, amount, category: cat, note, paymentMode: payMode },
    {
      pillMsg: 'Expense updated',
      pillIcon: '✏️',
      historyAction: ACT.UPDATE,
      historyData: { id, changes }
    });

    if (res.ok) { 
      // 1. Find the record in the local array and update it
      const idx = expenses.findIndex(x => x.id === id);
      if (idx > -1) {
        expenses[idx] = { ...expenses[idx], date, amount, category: cat, note, paymentMode: payMode, updatedAt: new Date().toISOString() };
        expenses.sort((a,b) => String(b.date).localeCompare(String(a.date)));
      }

      // 2. Save the updated array to the cache
      try { localStorage.setItem('cache_expenses', JSON.stringify(expenses)); } catch(e) {}

      // 3. Re-render the UI instantly
      renderAll();
      renderCombinedReport();
      renderDashRecent();
      renderDashboardTiles();

      closeMo('edit-mo'); 

      // Increment backup counter
      let currentCount = parseInt(localStorage.getItem('backup_entry_count') || '0');
      localStorage.setItem('backup_entry_count', (currentCount + 1).toString());
    }
};

window.deleteExp = function(id){
  const rec = expenses.find(e => e.id === id);
  if (!rec) return;

  showConfirm(
    '🗑️ Delete Expense',
    `<div class="confirm-box"><div class="impact">
       ${fmtDate(rec.date)} | <strong>${esc(rec.category)}</strong> | ₹${fmtAmt(rec.amount)}
     </div></div>
     <div class="fg2" style="margin-top:12px">
       <label>Reason for deletion <span style="color:var(--muted);font-weight:400">(required)</span></label>
       <textarea id="del-reason-single" class="fc2" rows="2" placeholder="e.g. Entered by mistake…" maxlength="300"></textarea>
     </div>`,
    'Delete',
    async () => {
      const reason = ($('del-reason-single')?.value || '').trim();
      if (!reason){ toast('❌ Please enter a reason.', 'error'); return; }
            const res = await deleteRecord(COL.EXPENSE, id, {
        pillMsg: 'Expense deleted',
        pillIcon: '🗑️',
        historyAction: ACT.DELETE,
        historyData: { id: rec.id, date: rec.date, amount: rec.amount, category: rec.category, reason }
      });
      if (res.ok) {
        // 1. Remove the record from the local array
        expenses = expenses.filter(x => x.id !== id);

        // 2. Save the updated array to the cache
        try { localStorage.setItem('cache_expenses', JSON.stringify(expenses)); } catch(e) {}

        // 3. Re-render the UI instantly
        renderAll();
        renderCombinedReport();
        renderDashRecent();
        renderDashboardTiles();

        // 4. Increment backup counter
        let currentCount = parseInt(localStorage.getItem('backup_entry_count') || '0');
        localStorage.setItem('backup_entry_count', (currentCount + 1).toString());
      }
    },
    'bd'
  );
  setTimeout(() => $('del-reason-single')?.focus(), 150);
};

window.confirmDeleteAll = function(){
  showConfirm(
    '🧨 Delete ALL Data',
    `<p style="font-size:.83rem;margin-bottom:11px">This will permanently delete <strong>ALL ${expenses.length} expense record(s)</strong>.</p>
     <div class="confirm-box"><div class="impact">⚠️ Type <strong>DELETE</strong> to confirm.</div></div>
     <div class="fg2"><label>Confirm</label><input type="text" id="del-all-confirm" class="fc2" placeholder="DELETE" maxlength="10"/></div>`,
    'Delete Everything',
    async () => {
      const el = $('del-all-confirm');
      if (!el || el.value !== 'DELETE'){ toast('❌ Type DELETE to confirm.', 'error'); return; }
      const n = await wipeCollection(COL.EXPENSE);
      await logHistory(ACT.DELETE_ALL, { count: n });
      pill('All expenses deleted', '🧨');
    },
    'bd'
  );
};


/* ═══════════════════════════════════════════════════════════════
   BULK DELETE
   ═══════════════════════════════════════════════════════════════ */
function updateBulkToolbar(){
  const toolbar = $('bulk-toolbar');
  const countEl = $('bulk-count');
  if (!toolbar || !countEl) return;
  const n = selectedIds.size;
  toolbar.style.display = n > 0 ? 'flex' : 'none';
  countEl.textContent = `${n} selected`;
}

window.toggleRowSel = function(cb, id){
  if (cb.checked) selectedIds.add(id);
  else selectedIds.delete(id);
  cb.closest('tr').classList.toggle('row-selected', cb.checked);
  updateBulkToolbar();
};

window.toggleSelAll = function(masterCb){
  // If checking the box, clear old selections first to only select the current page
  if (masterCb.checked) selectedIds.clear(); 

  document.querySelectorAll('#all-tbody input[type=checkbox]').forEach(cb => {
    cb.checked = masterCb.checked;
    if (masterCb.checked) selectedIds.add(cb.dataset.id);
    else selectedIds.delete(cb.dataset.id);
    cb.closest('tr').classList.toggle('row-selected', masterCb.checked);
  });
  updateBulkToolbar();
};

window.clearSelection = function(){
  selectedIds.clear();
  document.querySelectorAll('#all-tbody input[type=checkbox]').forEach(cb => {
    cb.checked = false;
    cb.closest('tr').classList.remove('row-selected');
  });
  const sa = $('sel-all');
  if (sa){ sa.checked = false; sa.indeterminate = false; }
  updateBulkToolbar();
};

window.openBulkDelete = function(){
  if (!selectedIds.size){ toast('No records selected.', 'error'); return; }
  const selected = expenses.filter(e => selectedIds.has(e.id));
  const total = selected.reduce((s,e) => s + (+e.amount || 0), 0);
  $('bulk-del-summary').innerHTML = `<div class="confirm-box"><div class="impact">
    Deleting <strong>${selected.length} record(s)</strong> totalling <strong>₹${fmtAmt(total)}</strong>
    <div style="margin-top:8px;font-size:.75rem;max-height:110px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${selected.slice(0,8).map(e => `<span>• ${fmtDate(e.date)} — ${esc(e.category)} — ₹${fmtAmt(e.amount)}</span>`).join('')}
      ${selected.length > 8 ? `<span style="color:var(--muted)">…and ${selected.length-8} more</span>` : ''}
    </div></div></div>`;
  const reason = $('bulk-del-reason');
  reason.value = '';
  $('bulk-reason-len').textContent = '0';
  $('bulk-del-mo').classList.add('open');
  setTimeout(() => reason.focus(), 150);
};

window.executeBulkDelete = async function(){
  const reason = ($('bulk-del-reason').value || '').trim();
  if (!reason){ toast('❌ Please enter a reason.', 'error'); return; }
  
  const ids = [...selectedIds]; // <-- Takes EXACTLY the IDs in the Set
  const selected = expenses.filter(e => ids.includes(e.id));
  const total = selected.reduce((s,e) => s + (+e.amount || 0), 0);

  const btn = document.querySelector('#bulk-del-mo .btn.bd');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Deleting...'; }

  try {
    // 1. Send to Firebase
    for (let i = 0; i < ids.length; i += 400){
      const batch = writeBatch(db);
      ids.slice(i, i + 400).forEach(id => batch.delete(doc(db, COL.EXPENSE, id)));
      await batch.commit(); 
    }

    // 2. Log History
    await logHistory(ACT.DELETE, {
      bulk: true, count: ids.length, totalAmount: total, reason,
      records: selected.map(e => ({ id: e.id, date: e.date, category: e.category, amount: e.amount }))
    });

    // 3. Remove from local memory
    expenses = expenses.filter(x => !ids.includes(x.id));

    // 4. Update the local storage cache
    try { localStorage.setItem('cache_expenses', JSON.stringify(expenses)); } catch(e) {}
    
    // 5. Clear UI and Re-render
    closeMo('bulk-del-mo');
    selectedIds.clear();
    updateBulkToolbar();
    renderAll();
    renderCombinedReport();
    renderDashRecent();
    renderDashboardTiles();
    populateYearSelectors();

    // 6. Increment backup counter
    let currentCount = parseInt(localStorage.getItem('backup_entry_count') || '0');
    localStorage.setItem('backup_entry_count', (currentCount + ids.length).toString());
    if (typeof updateBackupStatusUI === 'function') updateBackupStatusUI();

    pill(`${ids.length} record(s) deleted`, '🗑️');

  } catch (err){
    toast('❌ Bulk delete failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ Delete Records'; }
  }
};

document.addEventListener('input', e => {
  if (e.target.id === 'bulk-del-reason'){
    const el = $('bulk-reason-len');
    if (el) el.textContent = e.target.value.length;
  }
});


/* ═══════════════════════════════════════════════════════════════
   BULK REASSIGN CATEGORY
   Move selected records from their current category to a new one.
   ═══════════════════════════════════════════════════════════════ */
window.openBulkReassign = function(){
  if (!selectedIds.size){ toast('No records selected.', 'error'); return; }

  const selected = expenses.filter(e => selectedIds.has(e.id));
  if (!selected.length) return;

  const total = selected.reduce((s,e) => s + (+e.amount || 0), 0);

  /* Distinct source categories in the selection */
  const fromCats = [...new Set(selected.map(e => e.category))];

  /* Build destination list: all categories EXCEPT the ones already
     present in the selection, and EXCEPT "No Expense". */
  const excluded = new Set([...fromCats, 'No Expense']);
  const options = categories
    .filter(c => !excluded.has(c.name))
    .sort((a,b) => a.name.localeCompare(b.name));

  if (!options.length){
    toast('No other categories available to move to.', 'error');
    return;
  }

  /* Summary */
  $('bulk-reassign-summary').innerHTML = `
    <div class="confirm-box">
      <div class="impact">Reassigning <strong>${selected.length} record(s)</strong> totalling <strong>₹${fmtAmt(total)}</strong></div>
      <div style="margin-top:8px;font-size:.75rem;max-height:110px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
        ${selected.slice(0,8).map(e => `<span>• ${fmtDate(e.date)} — ${esc(e.category)} — ₹${fmtAmt(e.amount)}</span>`).join('')}
        ${selected.length > 8 ? `<span style="color:var(--muted)">…and ${selected.length-8} more</span>` : ''}
      </div>
      <div style="margin-top:8px;font-size:.75rem;color:var(--muted)">
        Currently in: <strong>${fromCats.map(esc).join(', ')}</strong>
      </div>
    </div>`;

  /* Populate destination dropdown */
  const sel = $('bulk-reassign-dest');
  sel.innerHTML = '<option value="">— Select destination category —</option>' +
    options.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');

  $('bulk-reassign-mo').classList.add('open');
};

window.executeBulkReassign = async function(){
  const dest = $('bulk-reassign-dest').value;
  if (!dest){ toast('❌ Select a destination category.', 'error'); return; }
  if (!selectedIds.size){ toast('No records selected.', 'error'); return; }

  const ids = [...selectedIds];
  const selected = expenses.filter(e => ids.includes(e.id));
  const total = selected.reduce((s,e) => s + (+e.amount || 0), 0);

  const bySource = {};
  selected.forEach(e => { bySource[e.category] = (bySource[e.category] || 0) + 1; });

  closeMo('bulk-reassign-mo');
  setSyncStatus('saving');

  try {
    // 1. Send to Firebase
    for (let i = 0; i < ids.length; i += 400){
      const batch = writeBatch(db);
      ids.slice(i, i + 400).forEach(id => {
        batch.update(doc(db, COL.EXPENSE, id), { category: dest, updatedAt: new Date().toISOString() });
      });
      await batch.commit();
    }

    // 2. Log History
    await logHistory(ACT.UPDATE, {
      bulk: true, action: 'reassign', count: ids.length, totalAmount: total, to: dest, from: bySource
    });

    // 3. Update local memory
    expenses.forEach(e => {
      if (ids.includes(e.id)) {
        e.category = dest;
        e.updatedAt = new Date().toISOString();
      }
    });

    // 4. Update local storage cache
    try { localStorage.setItem('cache_expenses', JSON.stringify(expenses)); } catch(e) {}
    
    // 5. Clear UI and Re-render
    setSyncStatus('live');
    selectedIds.clear();
    updateBulkToolbar();
    renderAll();
    renderCombinedReport();
    renderDashRecent();
    renderDashboardTiles();
    
    const sa = $('sel-all');
    if (sa){ sa.checked = false; sa.indeterminate = false; }

    pill(`Reassigned ${ids.length} record(s) to ${dest}`, '🔄');

  } catch (err){
    setSyncStatus('error');
    toast('❌ Reassign failed: ' + (err.message || err), 'error');
  }
};


/* ═══════════════════════════════════════════════════════════════
   CATEGORY DROPDOWN ENGINE
   ═══════════════════════════════════════════════════════════════ */
let _catCounts = {};
function buildAllDropdowns(){
  // Pre-calculate counts ONCE so we don't loop 5,000 expenses 54 times
  _catCounts = {};
  expenses.forEach(e => {
    _catCounts[e.category] = (_catCounts[e.category] || 0) + 1;
  });
  
  ['add','edit','filter','catmon'].forEach(ctx => buildOpts(ctx));
}

function buildOpts(ctx, q){
  const el = $('cl-' + ctx);
  if (!el) return;
  const ql  = (q || '').toLowerCase().trim();
  const src = ql ? categories.filter(c => c.name.toLowerCase().includes(ql)) : [...categories];

  let html = '';
  if (ctx === 'filter' || ctx === 'catmon'){
    html += `<div class="co ${catVals[ctx] === '' ? 'sel' : ''}" onclick="selectCat('${ctx}','','All Categories')">All Categories <span class="cob">${expenses.length}</span></div>`;
  }
  if (!src.length){
    el.innerHTML = html + '<div class="co nr">No results</div>';
    return;
  }

  if (ql){
        src.forEach(cat => {
      const cnt = _catCounts[cat.name] || 0;
      html += `<div class="co ${catVals[ctx] === cat.name ? 'sel' : ''}" onclick="selectCat('${ctx}','${escQ(cat.name)}','${escQ(cat.name)}')">${esc(cat.name)}${cnt > 0 ? `<span class="cob">${cnt}</span>` : ''}</div>`;
    });
  } else {
    CAT_GROUPS.forEach(grp => {
      const grpCats = src.filter(c => grp.prefixes.some(p => c.name.startsWith(p)));
      if (!grpCats.length) return;
      html += `<div class="co-grp-hdr" style="border-left:3px solid ${grp.color}">${grp.label}</div>`;
            grpCats.forEach(cat => {
        const cnt = _catCounts[cat.name] || 0;
        html += `<div class="co co-grp ${catVals[ctx] === cat.name ? 'sel' : ''}" onclick="selectCat('${ctx}','${escQ(cat.name)}','${escQ(cat.name)}')">${esc(cat.name)}${cnt > 0 ? `<span class="cob">${cnt}</span>` : ''}</div>`;
      });
    });
    const ungrouped = src.filter(c => !CAT_GROUPS.some(g => g.prefixes.some(p => c.name.startsWith(p))));
    if (ungrouped.length){
      html += `<div class="co-grp-hdr" style="border-left:3px solid #94a3b8">🏷️ Other</div>`;
            ungrouped.forEach(cat => {
        const cnt = _catCounts[cat.name] || 0;
        html += `<div class="co co-grp ${catVals[ctx] === cat.name ? 'sel' : ''}" onclick="selectCat('${ctx}','${escQ(cat.name)}','${escQ(cat.name)}')">${esc(cat.name)}${cnt > 0 ? `<span class="cob">${cnt}</span>` : ''}</div>`;
      });
    }
  }
  el.innerHTML = html;
}

window.filterOpts = function(ctx){
  const el = $('cs-' + ctx);
  buildOpts(ctx, el ? el.value : '');
};

window.toggleDrop = function(ctx){
  const panel = $('cdp-' + ctx);
  const disp  = $('csd-' + ctx);
  if (!panel || !disp) return;
  const isOpen = panel.classList.contains('open');
  ['add','edit','filter','catmon'].forEach(c => {
    const p = $('cdp-' + c), d = $('csd-' + c);
    if (p) p.classList.remove('open');
    if (d) d.classList.remove('open');
  });
  if (!isOpen){
    panel.classList.add('open');
    disp.classList.add('open');
    buildOpts(ctx, '');
    const si = $('cs-' + ctx);
    if (si){ si.value = ''; setTimeout(() => si.focus(), 40); }
  }
};

window.selectCat = function(ctx, val, label){
  catVals[ctx] = val;
  const txt = $('ct-' + ctx);
  if (txt){
    txt.textContent = label;
    txt.classList.toggle('ph', !val && ctx !== 'filter' && ctx !== 'catmon');
  }
  const hidId = ctx === 'add' ? 'f-cat' : ctx === 'edit' ? 'm-cat' : ctx === 'catmon' ? 'cm-cat' : 'r-cat';
  const hid = $(hidId);
  if (hid) hid.value = val;

  ['add','edit','filter','catmon'].forEach(c => {
    const p = $('cdp-' + c), d = $('csd-' + c);
    if (p) p.classList.remove('open');
    if (d) d.classList.remove('open');
  });

  // Disable "Paid Via" and "Amount" if "No Expense" is selected
  if (ctx === 'add' || ctx === 'edit') {
    const isNoExp = val === 'No Expense';
    const payField = $(ctx === 'add' ? 'f-pay' : 'm-pay');
    const amtField = $(ctx === 'add' ? 'f-amount' : 'm-amount');
    
    if (payField) {
      payField.disabled = isNoExp;
      if (isNoExp) payField.value = ''; 
      else if (!payField.value) payField.value = 'UPI'; 
    }
    
    if (amtField) {
      amtField.disabled = isNoExp;
      if (isNoExp) amtField.value = '0.00';
    }
  }

  if (ctx === 'filter') applyFilters();
  if (ctx === 'catmon') renderCatMon();
};

function setCat(ctx, val){
  catVals[ctx] = val;
  const txt = $('ct-' + ctx);
  if (txt){
    if (val){ txt.textContent = val; txt.classList.remove('ph'); }
    else { txt.textContent = (ctx === 'filter' || ctx === 'catmon') ? 'All Categories' : 'Select Category'; txt.classList.add('ph'); }
  }
  const hidId = ctx === 'add' ? 'f-cat' : ctx === 'edit' ? 'm-cat' : ctx === 'catmon' ? 'cm-cat' : 'r-cat';
  const hid = $(hidId);
  if (hid) hid.value = val;
}


/* ═══════════════════════════════════════════════════════════════
   CATEGORIES TAB
   ═══════════════════════════════════════════════════════════════ */
function renderCatMgr(){
  const input = $('cat-search-mgr');
  const q = (input ? input.value || '' : '').toLowerCase().trim();
  const list = q ? categories.filter(c => c.name.toLowerCase().includes(q)) : [...categories];
  const cnt = $('cat-count-lbl');
  if (cnt) cnt.textContent = `(${categories.length} total)`;

  const used = new Set(expenses.map(e => e.category));
  const stats = $('cat-stats');
  if (stats) stats.innerHTML = `
    <div class="cstat"><div class="cv">${categories.length}</div><div class="cl">Total</div></div>
    <div class="cstat"><div class="cv">${used.size}</div><div class="cl">Used</div></div>
    <div class="cstat clickable-cstat" onclick="openUnusedModal()" title="Click to view and delete unused categories">
      <div class="cv" style="color:var(--warn)">${categories.length - used.size}</div>
      <div class="cl">Unused 🔍</div>
    </div>
    <div class="cstat"><div class="cv">${expenses.length}</div><div class="cl">Records</div></div>`;

  const grid = $('cat-grid');
  if (!grid) return;
  if (!list.length){
    grid.innerHTML = `<div style="color:var(--muted);font-size:.83rem;padding:10px">No categories found.</div>`;
    return;
  }
  grid.innerHTML = list.map(cat => {
    const count = expenses.filter(e => e.category === cat.name).length;
    return `<div class="cat-item">
      <div class="cn">${esc(cat.name)}</div>
      <div class="cc">${count} rec</div>
      <div class="cact">
        <button class="btn bo bxs" onclick="promptEditCat('${escQ(cat.id)}','${escQ(cat.name)}')" type="button">✏️</button>
        <button class="btn bd bxs" onclick="promptDeleteCat('${escQ(cat.id)}','${escQ(cat.name)}')" type="button">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

window.addCategory = async function(){
  const input = $('new-cat-name');
  const name = (input.value || '').trim();
  if (!name){ toast('Enter a category name.', 'error'); return; }
  if (categories.find(c => c.name.toLowerCase() === name.toLowerCase())){
    toast('Already exists.', 'warning');
    return;
  }
  const res = await addRecord(COL.CATEGORY, { name }, {
    pillMsg: `Category "${name}" added`,
    pillIcon: '🏷️',
    historyAction: ACT.CAT_ADD,
    historyData: { name }
  });
  if (res.ok) {
    input.value = '';
    localStorage.removeItem('cache_categories'); // <-- Changed to localStorage
    loadCategories(); // Refresh the list manually
  }
};

window.promptEditCat = function(id, name){
  const affected = expenses.filter(e => e.category === name).length;
  showConfirm(
    '✏️ Rename Category',
    `<p style="font-size:.83rem;margin-bottom:11px">Rename: <strong>${esc(name)}</strong></p>
     <div class="confirm-box"><div class="impact">⚠️ ${affected} record(s) will be affected</div></div>
     <div class="fg2" style="margin-top:11px"><label>New Name</label>
     <input type="text" id="edit-cat-input" class="fc2" value="${esc(name)}" maxlength="60"/></div>`,
    'Rename',
    async () => {
      const newName = ($('edit-cat-input').value || '').trim();
      if (!newName){ toast('Name cannot be empty.', 'error'); return; }
      if (newName === name) return;

      await updateRecord(COL.CATEGORY, id, { name: newName }, { pillMsg: `Renamed to "${newName}"`, pillIcon: '✏️' });

      const toUpdate = expenses.filter(e => e.category === name);
      if (toUpdate.length){
        const batch = writeBatch(db);
        toUpdate.forEach(e => batch.update(doc(db, COL.EXPENSE, e.id), { category: newName }));
        await batch.commit();
      }
            await logHistory(ACT.CAT_EDIT, { from: name, to: newName, affected });
      localStorage.removeItem('cache_categories'); // Clear category cache only
      loadCategories(); // Refresh the list manually
    },
    'bp'
  );
};

window.promptDeleteCat = function(id, name){
  const affected = expenses.filter(e => e.category === name).length;
  showConfirm(
    '🗑️ Delete Category',
    `<p style="font-size:.83rem;margin-bottom:11px">Delete: <strong>${esc(name)}</strong></p>
     <div class="confirm-box"><div class="impact">⚠️ ${affected} record(s) use this category. Records are NOT deleted.</div></div>`,
    'Delete',
    async () => {
            const res = await deleteRecord(COL.CATEGORY, id, {
        pillMsg: `Category "${name}" deleted`,
        pillIcon: '🗑️',
        historyAction: ACT.CAT_DELETE,
        historyData: { name, affected }
      });
      if (res.ok) {
        localStorage.removeItem('cache_categories'); // Clear category cache only
        loadCategories(); // Refresh the list manually
      }
    },
    'bd'
  );
};


/* ═══════════════════════════════════════════════════════════════
   HISTORY TAB
   ═══════════════════════════════════════════════════════════════ */
function renderHistory(){
  const total = history.length;
  const tp = Math.ceil(total / HPG) || 1;
  if (histPage > tp) histPage = 1;
  const items = history.slice((histPage - 1) * HPG, histPage * HPG);
  const lbl = $('hist-count-lbl');
  if (lbl) lbl.textContent = `${total} entries`;

  const host = $('hist-list');
  if (!host) return;
  if (!items.length){
    host.innerHTML = `<div class="es"><div class="ei">📭</div><p>No history.</p></div>`;
    renderHistPag(tp, total);
    return;
  }

  host.innerHTML = items.map(h => {
    const d = h.data || {};
    const timeStr = h.timestamp
      ? new Date(h.timestamp).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';

    let detail = '', diff = '';
    if (h.action === 'create'){
      detail = `${fmtDate(d.date||'')} | <strong>${esc(d.category||'')}</strong> | ₹${fmtAmt(d.amount)}${d.paymentMode ? ` | ${esc(d.paymentMode)}` : ''}`;
        } else if (h.action === 'update'){
      if (d.bulk && d.action === 'reassign'){
        const fromList = Object.entries(d.from || {})
          .map(([cat, cnt]) => `${esc(cat)} (${cnt})`)
          .join(', ');
        detail = `Bulk reassigned <strong>${d.count}</strong> record(s) totalling <strong>₹${fmtAmt(d.totalAmount)}</strong>
                  → <strong>${esc(d.to)}</strong>
                  <div style="margin-top:4px;color:var(--muted);font-size:.72rem">from: ${fromList}</div>`;
      } else {
        detail = `ID: ${d.id || ''}`;
        if (d.changes && d.changes.length){
          diff = `<div class="hdiff">${d.changes.map(c =>
            `<div><span class="old">${esc(c.field)}: ${esc(String(c.from))}</span> → <span class="new">${esc(String(c.to))}</span></div>`
          ).join('')}</div>`;
        }
      }
    }
	else if (h.action === 'delete'){
      detail = d.bulk
        ? `Bulk deleted <strong>${d.count}</strong> record(s) totalling <strong>₹${fmtAmt(d.totalAmount)}</strong>${d.reason ? ` · Reason: <em>${esc(d.reason)}</em>` : ''}`
        : `${fmtDate(d.date||'')} — <strong>${esc(d.category||'')}</strong> — ₹${fmtAmt(d.amount)}${d.reason ? ` · Reason: <em>${esc(d.reason)}</em>` : ''}`;
    } else if (h.action === 'cat_add')    detail = `New: <strong>${esc(d.name||'')}</strong>`;
    else if (h.action === 'cat_edit')     detail = `<strong>${esc(d.from||'')}</strong> → <strong>${esc(d.to||'')}</strong>`;
    else if (h.action === 'cat_delete')   detail = `Deleted: <strong>${esc(d.name||'')}</strong>`;
    else if (h.action === 'export'){
      if (d.kind === 'daily_csv'){
        detail = `Daily Expense CSV exported — <strong>${d.expenses || d.count || 0}</strong> record(s)`;
      } else if (d.kind === 'master_json' || d.kind === 'master_csv') {
        detail = d.message || 'Master Backup downloaded';
      } else {
        detail = `Exported ${d.expenses || 0} expense(s)`;
      }
    }
    else if (h.action === 'import'){
      if (d.kind === 'daily_csv'){
        detail = `Daily Expense CSV imported — <strong>${d.expenses || d.count || 0}</strong> record(s)`
               + (d.skipped ? ` · skipped <strong>${d.skipped}</strong> duplicate(s)` : '')
               + (d.newCategories && d.newCategories.length
                    ? ` · created ${d.newCategories.length} new categor${d.newCategories.length === 1 ? 'y' : 'ies'}`
                    : '');
      } else {
        detail = `Imported <strong>${d.expenses || 0}</strong> record(s)`;
      }
    }
    else if (h.action === 'delete_all')   detail = `Permanently deleted <strong>${d.count || 0}</strong> record(s)`;
    else if (h.action === 'login')        detail = `User unlocked the app`;
    else if (h.action === 'logout')       detail = d.reason === 'timeout' ? `Session expired` : `User logged out`;
    else                                  detail = '';

    return `<div class="hist-item ${h.action || ''}">
      <div class="hico">${h.icon || '•'}</div>
      <div class="hbody">
        <div class="hact"><span class="hbadge ${h.badge || 'hb-cat'}">${esc(h.label || h.action || '')}</span></div>
        <div class="hdet">${detail}</div>${diff}
      </div>
      <div class="htime">${timeStr}</div>
    </div>`;
  }).join('');

  renderHistPag(tp, total);
}

function renderHistPag(tp, total){
  const el = $('hist-pag');
  if (!el) return;
  if (tp <= 1){ el.innerHTML = ''; return; }
  const s = (histPage - 1) * HPG + 1;
  const e = Math.min(histPage * HPG, total);
  let btns = '';
  for (let i = 1; i <= tp; i++){
    if (i === 1 || i === tp || Math.abs(i - histPage) <= 1){
      btns += `<button class="pb ${i === histPage ? 'active' : ''}" data-hp="${i}" type="button">${i}</button>`;
    }
  }
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:7px">
    <span class="pi">Showing ${s}–${e} of ${total}</span>
    <div class="pb2">
      <button class="pb" data-hp="${histPage-1}" ${histPage===1?'disabled':''} type="button">◀</button>
      ${btns}
      <button class="pb" data-hp="${histPage+1}" ${histPage===tp?'disabled':''} type="button">▶</button>
    </div>
  </div>`;
  el.querySelectorAll('[data-hp]').forEach(b => b.onclick = () => {
    const p = parseInt(b.dataset.hp);
    if (p >= 1 && p <= tp){ histPage = p; renderHistory(); }
  });
}

window.clearHistory = async function(){
  if (!confirm('Clear all history from Firebase?')) return;
  await wipeCollection(COL.HISTORY);
  pill('History cleared', '🗑️');
};


/* ═══════════════════════════════════════════════════════════════
   ANALYTICS — Overview, Yearwise, Monthwise, DateRange, Compare3, CatMon
   ═══════════════════════════════════════════════════════════════ */
window.renderOverview = function(){
  const yr  = $('a-year')?.value || '';
  const mon = $('a-month')?.value || '';

  const data = expenses.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    if (yr && d.getFullYear() !== parseInt(yr)) return false;
    if (mon && d.getMonth()+1 !== parseInt(mon)) return false;
    return true;
  });

  const bld = (map, id, cls, fmtLabel) => {
    const sorted = Object.entries(map).sort((a,b) => b[1] - a[1]);
    const mx = sorted[0]?.[1] || 1;
    const el = $(id);
    if (!el) return;
    el.innerHTML = sorted.length
      ? sorted.map(([k, v]) => {
          const label = fmtLabel ? fmtLabel(k) : k;
          return `<div class="br">
            <span class="bl" title="${esc(k)}">${esc(label)}</span>
            <div class="bt"><div class="bf ${cls}" style="width:${(v/mx*100).toFixed(1)}%"></div></div>
            <span class="bamt">₹${fmtAmt(v)}</span>
          </div>`;
        }).join('')
      : '<p style="color:var(--muted);font-size:.82rem">No data.</p>';
  };

  const cm = {}, mm = {}, dm = {};
  data.forEach(e => {
    cm[e.category] = (cm[e.category] || 0) + (+e.amount || 0);
    const d = new Date(e.date + 'T00:00:00');
    const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    mm[mk] = (mm[mk] || 0) + (+e.amount || 0);
    dm[e.date] = (dm[e.date] || 0) + (+e.amount || 0);
  });
  bld(cm, 'ac-cat', 'bf-p');
  bld(mm, 'ac-mon', 'bf-ok', mk => mlabel(mk));
  bld(
    Object.fromEntries(Object.entries(dm).sort((a,b) => b[1]-a[1]).slice(0, 10)),
    'ac-day', 'bf-w', d => fmtDateShort(d)
  );
}

function renderYearWise(){
  const grand = expenses.reduce((s,e) => s + (+e.amount || 0), 0);
  const yrMap = {};
  expenses.forEach(e => {
    const y = new Date(e.date + 'T00:00:00').getFullYear();
    if (!yrMap[y]) yrMap[y] = { total: 0, count: 0 };
    yrMap[y].total += (+e.amount || 0);
    yrMap[y].count++;
  });
  const sorted = Object.entries(yrMap).sort((a,b) => b[0] - a[0]);
  const maxV = sorted[0]?.[1].total || 1;
  const brkEl = $('yw-breakdown');
  if (!sorted.length){
    if (brkEl) brkEl.innerHTML = '<p style="color:var(--muted)">No data.</p>';
    const t = $('yw-table'); if (t) t.innerHTML = '';
    return;
  }
      brkEl.innerHTML = sorted.map(([yr, { total }], i) => {
    const pct = grand > 0 ? (total / grand * 100).toFixed(2) : 0;
    const col = COLORS[i % COLORS.length];
    const w = (total/maxV*100).toFixed(1);
    return `<div class="pct-row">
      <span class="pct-label">${yr}</span>
      <div class="pct-track"><div class="pct-fill" style="width:${w}%;background:${col}">
        <span>${pct}%</span></div></div>
      <span class="pct-amt">₹${fmtAmt(total)}</span></div>`;
  }).join('');
  $('yw-table').innerHTML = mkTable(
    ['Year', 'Total', 'Records', '% Share'],
    sorted.map(([yr, { total, count }]) => [yr, `₹${fmtAmt(total)}`, count, `${grand > 0 ? (total/grand*100).toFixed(2) : 0}%`]),
    ['All Time', `₹${fmtAmt(grand)}`, expenses.length, '100%']
  );
}

window.renderMonthWise = function(){
  const selYr = $('mw-year')?.value || '';
  const data = selYr ? expenses.filter(e => new Date(e.date + 'T00:00:00').getFullYear() === parseInt(selYr)) : expenses;
  const grand = data.reduce((s,e) => s + (+e.amount || 0), 0);
  const monMap = {};
  data.forEach(e => {
    const d = new Date(e.date + 'T00:00:00');
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!monMap[k]) monMap[k] = { total: 0, count: 0 };
    monMap[k].total += (+e.amount || 0);
    monMap[k].count++;
  });
  const sorted = Object.entries(monMap).sort((a,b) => b[1].total - a[1].total);
  const maxV = sorted[0]?.[1].total || 1;
  const brkEl = $('mw-breakdown');
  if (!sorted.length){
    if (brkEl) brkEl.innerHTML = '<p style="color:var(--muted)">No data.</p>';
    const t = $('mw-table'); if (t) t.innerHTML = '';
    return;
  }
  brkEl.innerHTML = sorted.map(([k, { total }], i) => {
    const pct = grand > 0 ? (total/grand*100).toFixed(2) : 0;
    return `<div class="pct-row">
      <span class="pct-label">${mlabel(k)}</span>
      <div class="pct-track"><div class="pct-fill" style="width:${(total/maxV*100).toFixed(1)}%;background:${COLORS[i%COLORS.length]}"></div></div>
      <span class="pct-pct">${pct}%</span>
      <span class="pct-amt">₹${fmtAmt(total)}</span></div>`;
  }).join('');
  $('mw-table').innerHTML = mkTable(
    ['Month', 'Total', 'Records', '% Share'],
    sorted.map(([k, { total, count }]) => [mlabel(k), `₹${fmtAmt(total)}`, count, `${grand > 0 ? (total/grand*100).toFixed(2) : 0}%`]),
    ['Total', `₹${fmtAmt(grand)}`, data.length, '100%']
  );
};

window.renderDateRange = function(){
  let from = $('dr-from')?.value || '';
  let to   = $('dr-to')?.value   || '';
  const badge = $('dr-badge');

  if (!from || !to){
    $('dr-summary-cards').innerHTML = '';
    $('dr-cat').innerHTML = '<p style="color:var(--muted);font-size:.82rem">Select both dates.</p>';
    $('dr-day').innerHTML = '<p style="color:var(--muted);font-size:.82rem">Select both dates.</p>';
    $('dr-tbody').innerHTML = `<tr><td colspan="5"><div class="es"><div class="ei">🗓️</div><p>Pick a From and To date.</p></div></td></tr>`;
    if (badge) badge.textContent = '0 records';
    return;
  }
  if (from > to){ const t = from; from = to; to = t; }

  const data = expenses.filter(e => e.date >= from && e.date <= to)
                       .sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const total = data.reduce((s,e) => s + (+e.amount || 0), 0);
  const dayCount = Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000) + 1;
  const avgPerDay = dayCount > 0 ? total / dayCount : 0;

  $('dr-summary-cards').innerHTML = `
    <div class="sc"><div class="lbl">Total Amount</div><div class="amt">₹${fmtAmt(total)}</div><div class="sub">${data.length} record(s)</div></div>
    <div class="sc t"><div class="lbl">Days in Range</div><div class="amt">${dayCount}</div><div class="sub">${fmtDate(from)} – ${fmtDate(to)}</div></div>
    <div class="sc m"><div class="lbl">Average / Day</div><div class="amt">₹${fmtAmt(avgPerDay)}</div><div class="sub">over the selected range</div></div>`;
  if (badge) badge.textContent = `${data.length} record(s)`;

  const bld = (map, id, cls, fmtLabel) => {
    const sorted = Object.entries(map).sort((a,b) => b[1] - a[1]);
    const mx = sorted[0]?.[1] || 1;
    $(id).innerHTML = sorted.length
      ? sorted.map(([k, v]) => {
          const label = fmtLabel ? fmtLabel(k) : k;
          return `<div class="br">
            <span class="bl">${esc(label)}</span>
            <div class="bt"><div class="bf ${cls}" style="width:${(v/mx*100).toFixed(1)}%"></div></div>
            <span class="bamt">₹${fmtAmt(v)}</span></div>`;
        }).join('')
      : '<p style="color:var(--muted);font-size:.82rem">No data.</p>';
  };

  const cm = {}, dm = {};
  data.forEach(e => {
    cm[e.category] = (cm[e.category] || 0) + (+e.amount || 0);
    dm[e.date] = (dm[e.date] || 0) + (+e.amount || 0);
  });
  bld(cm, 'dr-cat', 'bf-p');
  bld(dm, 'dr-day', 'bf-w', d => `${fmtDateShort(d)} (${dayShort(d)})`);

  $('dr-tbody').innerHTML = data.length
    ? data.map(e => `<tr>
        <td class="dc">${fmtDate(e.date)} <span style="color:var(--muted);font-size:.7rem">(${dayShort(e.date)})</span></td>
        <td><span class="cb">${esc(e.category)}</span></td>
        <td class="amc">₹${fmtAmt(e.amount)}</td>
        <td>${pmBadge(e.paymentMode)}</td>
        <td class="nc">${esc(e.note || '—')}</td>
      </tr>`).join('')
    : `<tr><td colspan="5"><div class="es"><div class="ei">🗓️</div><p>No expenses found in this range.</p></div></td></tr>`;
};

window.renderCompare3 = function(){
  const getV = (yId, mId) => {
    const yr  = $(yId)?.value || '';
    const mon = $(mId)?.value || '';
    if (!yr) return { label: '—', data: {}, total: 0 };
    const label = mon ? `${MS[parseInt(mon)]} ${yr}` : String(yr);
    const data = expenses.filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      if (d.getFullYear() !== parseInt(yr)) return false;
      if (mon && d.getMonth()+1 !== parseInt(mon)) return false;
      return true;
    });
    const map = {};
    data.forEach(e => { map[e.category] = (map[e.category] || 0) + (+e.amount || 0); });
    return { label, data: map, total: data.reduce((s,e) => s + (+e.amount || 0), 0) };
  };

  const A = getV('cya', 'cma');
  const B = getV('cyb', 'cmb');
  const C = getV('cyc', 'cmc');
  const { label: lA, data: cA, total: tA } = A;
  const { label: lB, data: cB, total: tB } = B;
  const { label: lC, data: cC, total: tC } = C;
  const allCats = [...new Set([...Object.keys(cA), ...Object.keys(cB), ...Object.keys(cC)])].sort();

  const miniBar = (map, maxV, col) => Object.entries(map)
    .sort((a,b) => b[1] - a[1])
    .map(([cat, v]) => `<div class="br">
      <span class="bl">${esc(cat)}</span>
      <div class="bt"><div class="bf" style="width:${(v/maxV*100).toFixed(1)}%;background:${col}"></div></div>
      <span class="bamt">₹${fmtAmt(v)}</span></div>`).join('')
    || '<p style="color:var(--muted)">No data.</p>';

  const chg = (from, to) => {
    if (from === 0 && to === 0) return { txt: '—', cls: 'chg-eq' };
    if (from === 0) return { txt: 'New', cls: 'chg-up' };
    const p = ((to - from) / from * 100).toFixed(1);
    return { txt: `${p > 0 ? '+' : ''}${p}%`, cls: p > 0 ? 'chg-up' : p < 0 ? 'chg-down' : 'chg-eq' };
  };

  const diff = (a,b) => a - b;
  $('cmp3-result').innerHTML = `
    <div class="sum-bar">
      <div class="sb-item"><div class="sb-val">₹${fmtAmt(tA)}</div><div class="sb-lbl">A — ${esc(lA)}</div></div>
      <div class="sb-div"></div>
      <div class="sb-item"><div class="sb-val acc">₹${fmtAmt(tB)}</div><div class="sb-lbl">B — ${esc(lB)}</div></div>
      <div class="sb-div"></div>
      <div class="sb-item"><div class="sb-val ok2">₹${fmtAmt(tC)}</div><div class="sb-lbl">C — ${esc(lC)}</div></div>
    </div>
    <div class="cmp3-cards grid g3">
      <div class="cmp3-card pa">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:.83rem;font-weight:700;color:var(--p)">📘 A — ${esc(lA)}</span>
          <span style="font-size:1.1rem;font-weight:800;color:var(--p)">₹${fmtAmt(tA)}</span>
        </div>
        ${miniBar(cA, Math.max(tA, 1), '#6c63ff')}
      </div>
      <div class="cmp3-card pb2x">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:.83rem;font-weight:700;color:var(--acc)">📙 B — ${esc(lB)}</span>
          <span style="font-size:1.1rem;font-weight:800;color:var(--acc)">₹${fmtAmt(tB)}</span>
        </div>
        ${miniBar(cB, Math.max(tB, 1), '#ff6584')}
      </div>
      <div class="cmp3-card pc">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:.83rem;font-weight:700;color:var(--ok)">📗 C — ${esc(lC)}</span>
          <span style="font-size:1.1rem;font-weight:800;color:var(--ok)">₹${fmtAmt(tC)}</span>
        </div>
        ${miniBar(cC, Math.max(tC, 1), '#22c55e')}
      </div>
    </div>
    <div class="cmp3-diff">
      <h3>📊 Category Comparison — A vs B vs C</h3>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem">
        <thead><tr style="background:var(--sec)">
          <th style="padding:9px 11px;text-align:left;font-size:.69rem;color:var(--p)">Category</th>
          <th style="padding:9px 11px;text-align:right;font-size:.69rem;color:var(--p)">A</th>
          <th style="padding:9px 11px;text-align:right;font-size:.69rem;color:var(--acc)">B</th>
          <th style="padding:9px 11px;text-align:right;font-size:.69rem;color:var(--ok)">C</th>
        </tr></thead>
        <tbody>${allCats.map(cat => {
          const vA = cA[cat] || 0, vB = cB[cat] || 0, vC = cC[cat] || 0;
          return `<tr style="border-bottom:1px solid var(--bdr)">
            <td style="padding:9px 11px;font-weight:600">${esc(cat)}</td>
            <td style="padding:9px 11px;text-align:right;color:var(--p);font-weight:700">${vA > 0 ? '₹' + fmtAmt(vA) : '—'}</td>
            <td style="padding:9px 11px;text-align:right;color:var(--acc);font-weight:700">${vB > 0 ? '₹' + fmtAmt(vB) : '—'}</td>
            <td style="padding:9px 11px;text-align:right;color:var(--ok);font-weight:700">${vC > 0 ? '₹' + fmtAmt(vC) : '—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
};

window.renderCatMon = function(){
  const yr = $('cm-year')?.value || '';
  const catFilter = $('cm-cat')?.value || '';
  const host = $('catmon-result');
  if (!yr){ host.innerHTML = `<div class="es"><div class="ei">📅</div><p>Select a year.</p></div>`; return; }

  const data = expenses.filter(e => {
    if (new Date(e.date + 'T00:00:00').getFullYear() !== parseInt(yr)) return false;
    if (catFilter && e.category !== catFilter) return false;
    return true;
  });
  if (!data.length){ host.innerHTML = `<div class="es"><div class="ei">📭</div><p>No data.</p></div>`; return; }

  const usedCats = [...new Set(data.map(e => e.category))].sort();
  const usedMonths = [...new Set(data.map(e => new Date(e.date + 'T00:00:00').getMonth() + 1))].sort((a,b) => a - b);
  const map = {};
  usedCats.forEach(c => { map[c] = {}; });
  data.forEach(e => {
    const m = new Date(e.date + 'T00:00:00').getMonth() + 1;
    map[e.category][m] = (map[e.category][m] || 0) + (+e.amount || 0);
  });

  let grandMax = 0;
  usedCats.forEach(c => usedMonths.forEach(m => { if ((map[c][m] || 0) > grandMax) grandMax = map[c][m] || 0; }));

  const rowTotals = {}, monTotals = {};
  usedCats.forEach(c => rowTotals[c] = usedMonths.reduce((s,m) => s + (map[c][m] || 0), 0));
  usedMonths.forEach(m => monTotals[m] = usedCats.reduce((s,c) => s + (map[c][m] || 0), 0));
  const grandTotal = usedCats.reduce((s,c) => s + rowTotals[c], 0);

  const cellBg = val => {
    if (!val) return 'background:#f8f8ff;color:#ccc';
    return `background:rgba(108,99,255,${(val/grandMax*.7+.08).toFixed(2)});color:${val/grandMax>.5?'#fff':'#1e1e2e'}`;
  };

  host.innerHTML = `<div style="overflow-x:auto;margin-bottom:18px">
    <table style="width:100%;border-collapse:collapse;font-size:.76rem;min-width:600px">
      <thead><tr style="background:var(--sec)">
        <th style="padding:9px 12px;text-align:left;font-size:.69rem;color:var(--p)">Category</th>
        ${usedMonths.map(m => `<th style="padding:9px 10px;text-align:center;font-size:.69rem;color:var(--p)">${MS[m]}</th>`).join('')}
        <th style="padding:9px 10px;text-align:right;font-size:.69rem;color:var(--p)">Total</th>
      </tr></thead>
      <tbody>${usedCats.map(cat => `<tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:8px 12px;font-weight:600;white-space:nowrap">${esc(cat)}</td>
        ${usedMonths.map(m => {
          const v = map[cat][m] || 0;
          return `<td style="padding:6px 8px;text-align:center">
            ${v > 0 ? `<span class="heatmap-cell" style="${cellBg(v)}">₹${fmtAmt(v)}</span>` : `<span style="color:#ddd">—</span>`}
          </td>`;
        }).join('')}
        <td style="padding:8px 10px;text-align:right;font-weight:800;color:var(--err)">₹${fmtAmt(rowTotals[cat])}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:var(--sec);font-weight:800">
        <td style="padding:9px 12px">Monthly Total</td>
        ${usedMonths.map(m => `<td style="padding:9px 10px;text-align:center;color:var(--p)">₹${fmtAmt(monTotals[m])}</td>`).join('')}
        <td style="padding:9px 10px;text-align:right;color:var(--err)">₹${fmtAmt(grandTotal)}</td>
      </tr></tfoot>
    </table></div>
    <div class="ac"><h3>📊 Category Share per Month — ${yr}</h3>
      ${usedMonths.map(m => {
        const mt = monTotals[m];
        if (!mt) return '';
        return `<div style="margin-bottom:14px">
          <div style="font-size:.78rem;font-weight:700;color:var(--p);margin-bottom:7px">${MF[m]} — ₹${fmtAmt(mt)}</div>
          ${usedCats.filter(c => map[c][m]).map((cat, i) => {
            const v = map[cat][m] || 0, pct = (v/mt*100).toFixed(1);
                        return `<div class="pct-row">
              <span class="pct-label" style="min-width:140px;font-size:.74rem">${esc(cat)}</span>
              <div class="pct-track"><div class="pct-fill" style="width:${pct}%;background:${COLORS[i%COLORS.length]}"></div></div>
              <span class="pct-pct">${pct}%</span>
              <span class="pct-amt">₹${fmtAmt(v)}</span></div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>`;
};

// Add global listeners for the Group filters so they work instantly
document.addEventListener('change', (e) => {
  if (e.target.id === 'grp-year' || e.target.id === 'grp-month') {
    renderGroupAnalytics();
  }
});

window.switchAnTab = function(id, btn){
  curAnTab = id;
  document.querySelectorAll('.an-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.at').forEach(b => b.classList.remove('active'));
  const panel = $('an-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  renderAnTab(id);
};

function renderAnTab(id){
  if (id === 'overview')  renderOverview();
  else if (id === 'groups') {
    // Populate the year dropdown dynamically
    const ySel = $('grp-year');
    if (ySel && ySel.options.length <= 1) {
      const yrs = [...new Set(expenses.map(e => new Date(e.date + 'T00:00:00').getFullYear()))].sort((a,b) => b - a);
      yrs.forEach(y => ySel.innerHTML += `<option value="${y}">${y}</option>`);
    }
    renderGroupAnalytics();
  }
  else if (id === 'yearwise')  renderYearWise();
  else if (id === 'monthwise') renderMonthWise();
  else if (id === 'catmon')    renderCatMon();
  else if (id === 'daterange'){
    const fromEl = $('dr-from'), toEl = $('dr-to');
    if (fromEl && !fromEl.value){
      const now = new Date();
      fromEl.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    }
    if (toEl && !toEl.value) toEl.value = localDateStr();
    renderDateRange();
  }
}


/* ═══════════════════════════════════════════════════════════════
   HELPER — Summary table
   ═══════════════════════════════════════════════════════════════ */
function mkTable(headers, rows, footer){
  return `<table style="width:100%;border-collapse:collapse;font-size:.78rem">
    <thead><tr style="background:var(--sec)">${headers.map((h,i) =>
      `<th style="padding:8px 10px;text-align:${i===0?'left':'right'};font-size:.69rem;color:var(--p)">${h}</th>`
    ).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr style="border-bottom:1px solid var(--bdr)">${r.map((c,i) =>
      `<td style="padding:8px 10px;text-align:${i===0?'left':'right'};${i===1?'font-weight:700;color:var(--err)':''}">${c}</td>`
    ).join('')}</tr>`).join('')}</tbody>
    ${footer ? `<tfoot><tr style="background:var(--sec);font-weight:800">${footer.map((c,i) =>
      `<td style="padding:8px 10px;text-align:${i===0?'left':'right'}">${c}</td>`
    ).join('')}</tr></tfoot>` : ''}
  </table>`;
}


/* ═══════════════════════════════════════════════════════════════
   YEAR DROPDOWNS
   ═══════════════════════════════════════════════════════════════ */
function populateYearSelectors(){
  const yrs = [...new Set(expenses.map(e => new Date(e.date + 'T00:00:00').getFullYear()))].sort((a,b) => b - a);
  const cy = new Date().getFullYear();
  if (!yrs.includes(cy)) yrs.unshift(cy);

    ['r-year','a-year','cya','cyb','cyc','mw-year','cm-year','grp-year'].forEach(id => {
    const el = $(id);
    if (!el) return;
    const v = el.value;
    el.innerHTML = id === 'mw-year' ? '<option value="">All Years</option>'
                 : id === 'cm-year' ? '<option value="">Select Year</option>'
                 : '<option value="">All Years</option>';
    yrs.forEach(y => {
      const o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      el.appendChild(o);
    });
    if (v) el.value = v;
  });

  const comboYear = $('combo-year');
  if (comboYear){
    const v = comboYear.value;
    comboYear.innerHTML = '';
    yrs.forEach(y => {
      const o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      comboYear.appendChild(o);
    });
    comboYear.value = yrs.includes(parseInt(v)) ? v : String(cy);
  }

  const sumYear = $('sum-year');
  if (sumYear && !sumYear.options.length){
    const nowY = new Date().getFullYear();
    const minY = yrs.length ? Math.min(...yrs) : nowY - 3;
    for (let y = nowY; y >= minY; y--){
      const o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      if (y === nowY) o.selected = true;
      sumYear.appendChild(o);
    }
  }
}


/* ═══════════════════════════════════════════════════════════════
   COMBINED REPORT
   ═══════════════════════════════════════════════════════════════ */
function rentMonthOf(r){ return r.month || (r.date ? r.date.slice(0,7) : ''); }
function rentPaidOnOf(r){ return r.paidOnDate || r.date || ''; }
function elecPaidOnOf(r){ return r.paidOnDate || r.enteredDate || ''; }

function getElecComputed(){
  const sorted = [...elecReadings].sort((a,b) => String(a.month).localeCompare(String(b.month)));
  let prev = ELEC_BASELINE_UNIT;
  return sorted.map(r => {
    const consumed = Math.max(0, (+r.reading || 0) - prev);
    const amount = consumed * ELEC_RATE;
    const row = Object.assign({}, r, { prevReading: prev, consumed, amount });
    prev = +r.reading || 0;
    return row;
  });
}

window.renderCombinedReport = function(){
  const mSel = $('combo-month');
  const ySel = $('combo-year');
  if (!mSel || !ySel || !ySel.value) return;

  const y = ySel.value;
  const m = mSel.value;
  const monthKey = m ? `${y}-${String(m).padStart(2,'0')}` : null;
  const matchesYM = ds => monthKey ? ds.startsWith(monthKey) : ds.startsWith(y);

  const rentRows = rentPayments
    .filter(r => { const rm = rentMonthOf(r); return monthKey ? rm === monthKey : rm.startsWith(y); })
    .sort((a,b) => rentMonthOf(a).localeCompare(rentMonthOf(b)));

  const elecRows = getElecComputed().filter(r => monthKey ? r.month === monthKey : r.month.startsWith(y));
  const waterRows = waterPurchases.filter(w => matchesYM(String(w.date))).sort((a,b) => String(a.date).localeCompare(String(b.date)));

  const rentTotal = rentRows.reduce((s,r) => s + (+r.amount || 0), 0);
  const elecTotal = elecRows.reduce((s,r) => s + r.amount, 0);
  const waterCansX20 = waterRows.length * WATER_RATE_PER_CAN;
  
  const milkRows = milkRecords.filter(m => matchesYM(String(m.date))).sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const milkTotalAmt = milkRows.reduce((s,m) => s + (+m.amount || 0), 0);
  const milkTotalQty = milkRows.reduce((s,m) => s + (+m.unit || 0), 0);
  const grandTotal = rentTotal + elecTotal + waterCansX20 + milkTotalAmt;

  const periodLabel = monthKey ? monthLabel(monthKey) : y;

  const waterModesSet = new Set();
  let waterPaidOn = null;
  const allWaterPaidOns = [];
  waterRows.forEach(w => {
    if (w.paymentMode) waterModesSet.add(w.paymentMode);
    if (w.paidOnDate) allWaterPaidOns.push(w.paidOnDate);
  });
  if (monthKey && waterPayModes[monthKey]) waterModesSet.add(waterPayModes[monthKey]);
  else Object.keys(waterPayModes).forEach(mm => { if (mm.startsWith(y)) waterModesSet.add(waterPayModes[mm]); });
  if (allWaterPaidOns.length){ allWaterPaidOns.sort(); waterPaidOn = allWaterPaidOns[allWaterPaidOns.length - 1]; }

  const milkModesSet = new Set();
  let milkPaidOn = null;
  const allMilkPaidOns = [];
  milkRows.forEach(m => {
    if (monthKey && milkPayModes[monthKey]) milkModesSet.add(milkPayModes[monthKey]);
    else Object.keys(milkPayModes).forEach(mm => { if (mm.startsWith(y)) milkModesSet.add(milkPayModes[mm]); });
    if (monthKey && milkPayDates[monthKey]) allMilkPaidOns.push(milkPayDates[monthKey]);
    else Object.keys(milkPayDates).forEach(mm => { if (mm.startsWith(y)) allMilkPaidOns.push(milkPayDates[mm]); });
  });
  if (allMilkPaidOns.length){ allMilkPaidOns.sort(); milkPaidOn = allMilkPaidOns[allMilkPaidOns.length - 1]; }

  let sharedUsed = false, sharedMode = null, sharedPaidOn = null;
  if (rentRows.length && elecRows.length && waterRows.length && milkRows.length){
    const rentModes    = [...new Set(rentRows.map(r => r.paymentMode).filter(Boolean))];
    const elecModes    = [...new Set(elecRows.map(r => r.paymentMode).filter(Boolean))];
    const waterModes   = [...waterModesSet].filter(Boolean);
    const milkModes    = [...milkModesSet].filter(Boolean);
    const rentPaidOns  = [...new Set(rentRows.map(r => rentPaidOnOf(r)).filter(Boolean))];
    const elecPaidOns  = [...new Set(elecRows.map(r => elecPaidOnOf(r)).filter(Boolean))];
    const waterPaidOns = [...new Set(allWaterPaidOns.filter(Boolean))];
    const milkPaidOns  = [...new Set(allMilkPaidOns.filter(Boolean))];

    const modesAllSame = rentModes.length === 1 && elecModes.length === 1 && waterModes.length === 1 && milkModes.length === 1 && rentModes[0] === elecModes[0] && elecModes[0] === waterModes[0] && waterModes[0] === milkModes[0];
    const paidOnAllSame = rentPaidOns.length === 1 && elecPaidOns.length === 1 && waterPaidOns.length === 1 && milkPaidOns.length === 1 && rentPaidOns[0] === elecPaidOns[0] && elecPaidOns[0] === waterPaidOns[0] && waterPaidOns[0] === milkPaidOns[0];

    if (modesAllSame && paidOnAllSame){
      sharedUsed = true;
      sharedMode = rentModes[0];
      sharedPaidOn = rentPaidOns[0];
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     1. BUILD DESKTOP TABLE HTML
     ═══════════════════════════════════════════════════════════════ */
  let desktopHtml = `<div>
    <div style="text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid var(--bdr)">
      <div style="font-family:var(--fontd);font-size:1.15rem;font-weight:800;color:var(--p)">📄 Combined Report</div>
      <div style="font-size:.82rem;color:var(--muted);margin-top:4px">${periodLabel} · Room Rent + Electricity + Water + Milk</div>
    </div>`;

  // Rent Table
  desktopHtml += `<div style="margin-bottom:22px">
    <div style="display:flex;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px dashed var(--bdr)">
      <div style="font-size:.92rem;font-weight:800;color:var(--acc)">🏠 Room Rent</div>
      <div style="font-size:.78rem;color:var(--muted)">${rentRows.length} month(s) · Total <strong style="color:var(--err)">₹${fmtAmt(rentTotal)}</strong></div>
    </div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead><tr style="background:var(--sec)">
        <th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--muted);text-transform:uppercase">Month</th>
        ${!sharedUsed ? '<th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--muted);text-transform:uppercase">Paid Via</th><th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--muted);text-transform:uppercase">Paid On</th>' : ''}
        <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--muted);text-transform:uppercase">Amount</th>
      </tr></thead><tbody>
      ${rentRows.length ? rentRows.map(r => `<tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:9px 12px;font-weight:700;white-space:nowrap">${monthLabel(rentMonthOf(r))}</td>
        ${!sharedUsed ? `<td style="padding:9px 12px">${pmBadge(r.paymentMode)}</td><td style="padding:9px 12px;color:var(--muted);white-space:nowrap">${rentPaidOnOf(r) ? fmtDate(rentPaidOnOf(r)) : '—'}</td>` : ''}
        <td style="padding:9px 12px;text-align:right;font-weight:800;color:var(--err);white-space:nowrap">₹${fmtAmt(r.amount)}</td>
      </tr>`).join('') : `<tr><td colspan="${sharedUsed ? 2 : 4}" style="padding:14px;text-align:center;color:var(--muted);font-style:italic">No rent payments in this period</td></tr>`}
      </tbody>
      ${rentRows.length ? `<tfoot><tr style="border-top:2px solid var(--acc)">
        <td style="padding:9px 12px;font-weight:800;color:var(--acc)" colspan="${sharedUsed ? 1 : 3}">Subtotal</td>
        <td style="padding:9px 12px;text-align:right;font-weight:800;color:var(--err)">₹${fmtAmt(rentTotal)}</td>
      </tr></tfoot>` : ''}
    </table></div>
  </div>`;

  // Electricity Table
  desktopHtml += `<div style="margin-bottom:22px">
    <div style="display:flex;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px dashed var(--bdr)">
      <div style="font-size:.92rem;font-weight:800;color:var(--warn)">⚡ Electricity Bill</div>
      <div style="font-size:.78rem;color:var(--muted)">${elecRows.length} month(s) · Total <strong style="color:var(--err)">₹${fmtAmt(elecTotal)}</strong></div>
    </div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem">
      <thead><tr style="background:var(--sec)">
        <th style="padding:9px 10px;text-align:left;font-size:.66rem;color:var(--muted);text-transform:uppercase">Month</th>
        <th style="padding:9px 10px;text-align:right;font-size:.66rem;color:var(--muted);text-transform:uppercase">Last Reading</th>
        <th style="padding:9px 10px;text-align:right;font-size:.66rem;color:var(--muted);text-transform:uppercase">Current Reading</th>
        <th style="padding:9px 10px;text-align:right;font-size:.66rem;color:var(--muted);text-transform:uppercase">Consumed</th>
        ${!sharedUsed ? '<th style="padding:9px 10px;text-align:left;font-size:.66rem;color:var(--muted);text-transform:uppercase">Paid Via</th><th style="padding:9px 10px;text-align:left;font-size:.66rem;color:var(--muted);text-transform:uppercase">Paid On</th>' : ''}
        <th style="padding:9px 10px;text-align:right;font-size:.66rem;color:var(--muted);text-transform:uppercase">Amount</th>
      </tr></thead><tbody>
      ${elecRows.length ? elecRows.map(r => `<tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:9px 10px;font-weight:700;white-space:nowrap">${monthLabel(r.month)}</td>
        <td style="padding:9px 10px;text-align:right;color:var(--muted)">${r.prevReading.toLocaleString('en-IN')}</td>
        <td style="padding:9px 10px;text-align:right;color:var(--muted)">${(+r.reading || 0).toLocaleString('en-IN')}</td>
        <td style="padding:9px 10px;text-align:right;font-weight:700">${r.consumed.toLocaleString('en-IN')}</td>
        ${!sharedUsed ? `<td style="padding:9px 10px">${pmBadge(r.paymentMode)}</td><td style="padding:9px 10px;color:var(--muted);white-space:nowrap">${r.paidOnDate ? fmtDate(r.paidOnDate) : (r.enteredDate ? fmtDate(r.enteredDate) : '—')}</td>` : ''}
        <td style="padding:9px 10px;text-align:right;font-weight:800;color:var(--err);white-space:nowrap">₹${fmtAmt(r.amount)}</td>
      </tr>`).join('') : `<tr><td colspan="${sharedUsed ? 5 : 7}" style="padding:14px;text-align:center;color:var(--muted);font-style:italic">No electricity readings in this period</td></tr>`}
      </tbody>
      ${elecRows.length ? `<tfoot><tr style="border-top:2px solid var(--warn)">
        <td style="padding:9px 10px;font-weight:800;color:var(--warn)" colspan="${sharedUsed ? 4 : 6}">Subtotal</td>
        <td style="padding:9px 10px;text-align:right;font-weight:800;color:var(--err)">₹${fmtAmt(elecTotal)}</td>
      </tr></tfoot>` : ''}
    </table></div>
  </div>`;

  // Water Table
  desktopHtml += `<div style="margin-bottom:22px">
    <div style="display:flex;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px dashed var(--bdr)">
      <div style="font-size:.92rem;font-weight:800;color:var(--info)">💧 Water Bill</div>
      <div style="font-size:.78rem;color:var(--muted)">${waterRows.length} can(s) · Total <strong style="color:var(--err)">₹${fmtAmt(waterCansX20)}</strong> · (${waterRows.length} × ₹${WATER_RATE_PER_CAN})</div>
    </div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead><tr style="background:var(--sec)">
        <th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--muted);text-transform:uppercase">Month</th>
        <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--muted);text-transform:uppercase">Total Cans</th>
        ${!sharedUsed ? '<th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--muted);text-transform:uppercase">Paid Via</th><th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--muted);text-transform:uppercase">Paid On</th>' : ''}
        <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--muted);text-transform:uppercase">Amount</th>
      </tr></thead><tbody>
      ${waterRows.length ? `<tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:9px 12px;font-weight:700">${monthKey ? monthLabel(monthKey) : y}</td>
        <td style="padding:9px 12px;text-align:right;font-weight:700">${waterRows.length}</td>
        ${!sharedUsed ? `<td style="padding:9px 12px">${[...waterModesSet].filter(Boolean).map(m => pmBadge(m)).join(' ') || '<span class="pm-badge pm-none">—</span>'}</td>
        <td style="padding:9px 12px;color:var(--muted);white-space:nowrap">${waterPaidOn ? fmtDate(waterPaidOn) : '—'}</td>` : ''}
        <td style="padding:9px 12px;text-align:right;font-weight:800;color:var(--err);white-space:nowrap">₹${fmtAmt(waterCansX20)}</td>
      </tr>` : `<tr><td colspan="${sharedUsed ? 3 : 5}" style="padding:14px;text-align:center;color:var(--muted);font-style:italic">No water purchases in this period</td></tr>`}
      </tbody>
      ${waterRows.length ? `<tfoot><tr style="border-top:2px solid var(--info)">
        <td style="padding:9px 12px;font-weight:800;color:var(--info)" colspan="${sharedUsed ? 2 : 4}">Subtotal</td>
        <td style="padding:9px 12px;text-align:right;font-weight:800;color:var(--err)">₹${fmtAmt(waterCansX20)}</td>
      </tr></tfoot>` : ''}
    </table></div>
  </div>`;

  // Milk Table
  desktopHtml += `<div style="margin-bottom:22px">
    <div style="display:flex;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px dashed var(--bdr)">
      <div style="font-size:.92rem;font-weight:800;color:var(--warn)">🥛 Milk Bill</div>
      <div style="font-size:.78rem;color:var(--muted)">${milkRows.length} days · Total <strong style="color:var(--err)">₹${fmtAmt(milkTotalAmt)}</strong></div>
    </div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead><tr style="background:var(--sec)">
        <th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--muted);text-transform:uppercase">Month</th>
        <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--muted);text-transform:uppercase">Total Days</th>
        <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--muted);text-transform:uppercase">Total Qty</th>
        ${!sharedUsed ? '<th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--muted);text-transform:uppercase">Paid Via</th><th style="padding:9px 12px;text-align:left;font-size:.68rem;color:var(--muted);text-transform:uppercase">Paid On</th>' : ''}
        <th style="padding:9px 12px;text-align:right;font-size:.68rem;color:var(--muted);text-transform:uppercase">Amount</th>
      </tr></thead><tbody>
      ${milkRows.length ? `<tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:9px 12px;font-weight:700">${monthKey ? monthLabel(monthKey) : y}</td>
        <td style="padding:9px 12px;text-align:right;font-weight:700">${milkRows.length}</td>
        <td style="padding:9px 12px;text-align:right;font-weight:700">${fmtAmt(milkTotalQty)} kg</td>
        ${!sharedUsed ? `<td style="padding:9px 12px">${[...milkModesSet].filter(Boolean).map(m => pmBadge(m)).join(' ') || '<span class="pm-badge pm-none">—</span>'}</td>
        <td style="padding:9px 12px;color:var(--muted);white-space:nowrap">${milkPaidOn ? fmtDate(milkPaidOn) : '—'}</td>` : ''}
        <td style="padding:9px 12px;text-align:right;font-weight:800;color:var(--err);white-space:nowrap">₹${fmtAmt(milkTotalAmt)}</td>
      </tr>` : `<tr><td colspan="${sharedUsed ? 4 : 6}" style="padding:14px;text-align:center;color:var(--muted);font-style:italic">No milk purchases in this period</td></tr>`}
      </tbody>
    </table></div>
  </div>`;

  // Desktop Grand Total
  desktopHtml += `<div style="background:var(--pl);border-radius:var(--rs);padding:18px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border:1.5px solid var(--p)">
    <div>
      <div style="font-family:var(--fontd);font-size:.85rem;font-weight:700;color:var(--p);opacity:.75;text-transform:uppercase;letter-spacing:.5px">GRAND TOTAL</div>
      <div style="font-size:.78rem;color:var(--muted);margin-top:3px">${periodLabel} · Room Rent + Electricity + Water + Milk</div>
      ${sharedUsed ? `<div style="margin-top:9px;font-size:.78rem;color:var(--txt)"><strong>Paid Via:</strong> ${pmBadge(sharedMode)} &nbsp;·&nbsp; <strong>Paid On:</strong> ${sharedPaidOn ? fmtDate(sharedPaidOn) : '—'}</div>` : ''}
    </div>
    <div style="font-family:var(--fontd);font-size:1.6rem;font-weight:800;color:var(--p)">₹${fmtAmt(grandTotal)}</div>
  </div>
  <div style="font-size:.74rem;color:var(--muted);margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;justify-content:center;padding-top:8px;border-top:1px dashed var(--bdr)">
    <span>🏠 Rent: <strong>₹${fmtAmt(rentTotal)}</strong></span>
    ${elecTotal > 0 ? `<span>⚡ Electricity: <strong>₹${fmtAmt(elecTotal)}</strong></span>` : ''}
    ${waterCansX20 > 0 ? `<span>💧 Water: <strong>₹${fmtAmt(waterCansX20)}</strong></span>` : ''}
    ${milkTotalAmt > 0 ? `<span>🥛 Milk: <strong>₹${fmtAmt(milkTotalAmt)}</strong></span>` : ''}
  </div>
  </div>`;

  $('combo-report-body-desktop').innerHTML = desktopHtml;

  /* ═══════════════════════════════════════════════════════════════
     2. BUILD MOBILE CARDS HTML
     ═══════════════════════════════════════════════════════════════ */
  let mobileHtml = `<div>
    <div style="text-align:center;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid var(--bdr)">
      <div style="font-size:1.05rem;font-weight:800;color:var(--p)">📄 Combined Report</div>
      <div style="font-size:.78rem;color:var(--muted);margin-top:4px">${periodLabel}</div>
    </div>`;

  mobileHtml += `
    <div style="background:var(--card); border:1px solid var(--bdr); border-radius:12px; padding:14px; margin-bottom:12px; box-shadow:var(--sh);">
      <div style="display:flex; justify-content:space-between; font-weight:800; margin-bottom:8px;">
        <span style="color:var(--acc)">🏠 Room Rent</span>
        <span style="color:var(--err)">₹${fmtAmt(rentTotal)}</span>
      </div>
      <div style="font-size:.75rem; color:var(--muted);">${rentRows.length} month(s) recorded</div>
    </div>`;

  mobileHtml += `
    <div style="background:var(--card); border:1px solid var(--bdr); border-radius:12px; padding:14px; margin-bottom:12px; box-shadow:var(--sh);">
      <div style="display:flex; justify-content:space-between; font-weight:800; margin-bottom:8px;">
        <span style="color:var(--warn)">⚡ Electricity Bill</span>
        <span style="color:var(--err)">₹${fmtAmt(elecTotal)}</span>
      </div>
      <div style="font-size:.75rem; color:var(--muted);">${elecRows.length} month(s) recorded</div>
    </div>`;

  mobileHtml += `
    <div style="background:var(--card); border:1px solid var(--bdr); border-radius:12px; padding:14px; margin-bottom:12px; box-shadow:var(--sh);">
      <div style="display:flex; justify-content:space-between; font-weight:800; margin-bottom:8px;">
        <span style="color:var(--info)">💧 Water Bill</span>
        <span style="color:var(--err)">₹${fmtAmt(waterCansX20)}</span>
      </div>
      <div style="font-size:.75rem; color:var(--muted);">${waterRows.length} cans</div>
    </div>`;

  mobileHtml += `
    <div style="background:var(--card); border:1px solid var(--bdr); border-radius:12px; padding:14px; margin-bottom:12px; box-shadow:var(--sh);">
      <div style="display:flex; justify-content:space-between; font-weight:800; margin-bottom:8px;">
        <span style="color:var(--warn)">🥛 Milk Bill</span>
        <span style="color:var(--err)">₹${fmtAmt(milkTotalAmt)}</span>
      </div>
      <div style="font-size:.75rem; color:var(--muted);">${milkRows.length} days</div>
    </div>`;

  mobileHtml += `
    <div style="background:var(--pl); border:1.5px solid var(--p); border-radius:12px; padding:16px; margin-top:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:.85rem; font-weight:800; color:var(--p);">GRAND TOTAL</div>
        <div style="font-size:1.3rem; font-weight:800; color:var(--p);">₹${fmtAmt(grandTotal)}</div>
      </div>
      <div style="font-size:.7rem; color:var(--muted); margin-top:4px;">${periodLabel} · Rent + Elec + Water + Milk</div>
    </div></div>`;

  $('combo-report-body-mobile').innerHTML = mobileHtml;
};

window.printCombinedReport = function(){
  const mSel = $('combo-month');
  const ySel = $('combo-year');
  if (!ySel || !ySel.value){ toast('Select a year first.', 'error'); return; }
  const y = ySel.value, m = mSel.value;
  const monthKey = m ? `${y}-${String(m).padStart(2,'0')}` : null;
  const matchesYM = ds => monthKey ? ds.startsWith(monthKey) : ds.startsWith(y);

  const rentRows = rentPayments
    .filter(r => { const rm = rentMonthOf(r); return monthKey ? rm === monthKey : rm.startsWith(y); })
    .sort((a,b) => rentMonthOf(a).localeCompare(rentMonthOf(b)));
  const elecRows = getElecComputed().filter(r => monthKey ? r.month === monthKey : r.month.startsWith(y));
  const waterRows = waterPurchases.filter(w => matchesYM(String(w.date))).sort((a,b) => String(a.date).localeCompare(String(b.date)));

  if (!rentRows.length && !elecRows.length && !waterRows.length){
    toast('No data to print for this period.', 'error');
    return;
  }

  const periodLabel = monthKey ? monthLabel(monthKey) : y;

   /* ── Shared-mode detection ──
     Only triggers when ALL three sections have exactly one payment mode
     AND one paid-on date, AND those values are identical across sections. */
  const waterModesSet = new Set();
  const allWaterPaidOns = [];
  waterRows.forEach(w => {
    if (w.paymentMode) waterModesSet.add(w.paymentMode);
    if (w.paidOnDate) allWaterPaidOns.push(w.paidOnDate);
  });
  if (monthKey && waterPayModes[monthKey]) waterModesSet.add(waterPayModes[monthKey]);
  else Object.keys(waterPayModes).forEach(mm => { if (mm.startsWith(y)) waterModesSet.add(waterPayModes[mm]); });

  const waterPaidOn = allWaterPaidOns.length
    ? [...allWaterPaidOns].sort()[allWaterPaidOns.length - 1]
    : null;

  // ── Milk (MUST be declared before shared logic) ──
  const milkRowsPrint = milkRecords.filter(m => matchesYM(String(m.date))).sort((a,b) => String(a.date).localeCompare(String(b.date)));

  let sharedUsed = false, sharedMode = null, sharedPaidOn = null;
  if (rentRows.length && elecRows.length && waterRows.length && milkRowsPrint.length){
    const rentModes   = [...new Set(rentRows.map(r => r.paymentMode).filter(Boolean))];
    const elecModes   = [...new Set(elecRows.map(r => r.paymentMode).filter(Boolean))];
    const waterModes  = [...waterModesSet].filter(Boolean);
    const rentPaidOns = [...new Set(rentRows.map(r => rentPaidOnOf(r)).filter(Boolean))];
    const elecPaidOns = [...new Set(elecRows.map(r => elecPaidOnOf(r)).filter(Boolean))];
    const waterPaidOns = [...new Set(allWaterPaidOns.filter(Boolean))];

    const modesAllSame =
      rentModes.length === 1 && elecModes.length === 1 && waterModes.length === 1 &&
      rentModes[0] === elecModes[0] && elecModes[0] === waterModes[0];

    const paidOnAllSame =
      rentPaidOns.length === 1 && elecPaidOns.length === 1 && waterPaidOns.length === 1 &&
      rentPaidOns[0] === elecPaidOns[0] && elecPaidOns[0] === waterPaidOns[0];

    if (modesAllSame && paidOnAllSame){
      sharedUsed = true;
      sharedMode = rentModes[0];
      sharedPaidOn = rentPaidOns[0];
    }
  }

  let body = printLetterhead('📄 Combined Statement — ' + periodLabel);

  // ── Rent ──
  body += `<h3 style="font-size:1rem;margin:14px 0 8px;font-weight:800">🏠 Room Rent</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:20px">
      <thead><tr style="background:#f7f7f9">
        <th style="text-align:left;padding:8px 10px">Month</th>
        ${!sharedUsed ? '<th style="text-align:left;padding:8px 10px">Paid Via</th><th style="text-align:left;padding:8px 10px">Paid On</th>' : ''}
        <th style="text-align:right;padding:8px 10px">Amount</th>
      </tr></thead><tbody>
      ${rentRows.length
        ? rentRows.map(r => `<tr>
            <td style="padding:8px 10px">${monthLabel(rentMonthOf(r))}</td>
            ${!sharedUsed ? `<td style="padding:8px 10px">${esc(r.paymentMode || '—')}</td><td style="padding:8px 10px">${rentPaidOnOf(r) ? fmtDate(rentPaidOnOf(r)) : '—'}</td>` : ''}
            <td style="text-align:right;padding:8px 10px">₹${fmtAmt(r.amount)}</td>
          </tr>`).join('')
        : `<tr><td colspan="${sharedUsed ? 2 : 4}" style="padding:12px;text-align:center;color:#888;font-style:italic">No rent payments in this period</td></tr>`}
      </tbody></table>`;

  // ── Electricity ──
  body += `<h3 style="font-size:1rem;margin:14px 0 8px;font-weight:800">⚡ Electricity Bill</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:20px">
      <thead><tr style="background:#f7f7f9">
        <th style="text-align:left;padding:8px 10px">Month</th>
        <th style="text-align:right;padding:8px 10px">Last Reading</th>
        <th style="text-align:right;padding:8px 10px">Current Reading</th>
        <th style="text-align:right;padding:8px 10px">Consumed</th>
        ${!sharedUsed ? '<th style="text-align:left;padding:8px 10px">Paid Via</th><th style="text-align:left;padding:8px 10px">Paid On</th>' : ''}
        <th style="text-align:right;padding:8px 10px">Amount</th>
      </tr></thead><tbody>
      ${elecRows.length
        ? elecRows.map(r => `<tr>
            <td style="padding:8px 10px">${monthLabel(r.month)}</td>
            <td style="text-align:right;padding:8px 10px">${r.prevReading.toLocaleString('en-IN')}</td>
            <td style="text-align:right;padding:8px 10px">${(+r.reading || 0).toLocaleString('en-IN')}</td>
            <td style="text-align:right;padding:8px 10px">${r.consumed.toLocaleString('en-IN')}</td>
            ${!sharedUsed ? `<td style="padding:8px 10px">${esc(r.paymentMode || '—')}</td><td style="padding:8px 10px">${r.paidOnDate ? fmtDate(r.paidOnDate) : (r.enteredDate ? fmtDate(r.enteredDate) : '—')}</td>` : ''}
            <td style="text-align:right;padding:8px 10px">₹${fmtAmt(r.amount)}</td>
          </tr>`).join('')
        : `<tr><td colspan="${sharedUsed ? 5 : 7}" style="padding:12px;text-align:center;color:#888;font-style:italic">No electricity readings in this period</td></tr>`}
      </tbody></table>`;

  // ── Milk ──
  const milkTotalPrint = milkRowsPrint.reduce((s,m) => s + (+m.amount || 0), 0);
  const milkQtyPrint = milkRowsPrint.reduce((s,m) => s + (+m.unit || 0), 0);

  const milkModesPrintSet = new Set();
  const milkPaidOnsPrint = [];
  if (monthKey && milkPayModes[monthKey]) milkModesPrintSet.add(milkPayModes[monthKey]);
  else Object.keys(milkPayModes).forEach(mm => { if (mm.startsWith(y)) milkModesPrintSet.add(milkPayModes[mm]); });
  if (monthKey && milkPayDates[monthKey]) milkPaidOnsPrint.push(milkPayDates[monthKey]);
  else Object.keys(milkPayDates).forEach(mm => { if (mm.startsWith(y)) milkPaidOnsPrint.push(milkPayDates[mm]); });
  
  const milkPaidOnPrint = milkPaidOnsPrint.length ? milkPaidOnsPrint.sort().pop() : null;

  body += `<h3 style="font-size:1rem;margin:14px 0 8px;font-weight:800">🥛 Milk Bill</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:20px">
      <thead><tr style="background:#f7f7f9">
        <th style="text-align:left;padding:8px 10px">Month</th>
        <th style="text-align:right;padding:8px 10px">Total Days</th>
        <th style="text-align:right;padding:8px 10px">Total Qty</th>
        ${!sharedUsed ? '<th style="text-align:left;padding:8px 10px">Paid Via</th><th style="text-align:left;padding:8px 10px">Paid On</th>' : ''}
        <th style="text-align:right;padding:8px 10px">Amount</th>
      </tr></thead><tbody>
      ${milkRowsPrint.length ? `<tr>
        <td style="padding:8px 10px">${periodLabel}</td>
        <td style="text-align:right;padding:8px 10px">${milkRowsPrint.length}</td>
        <td style="text-align:right;padding:8px 10px">${fmtAmt(milkQtyPrint)} kg</td>
        ${!sharedUsed ? `<td style="padding:8px 10px">${[...milkModesPrintSet].filter(Boolean).join(', ') || '—'}</td><td style="padding:8px 10px">${milkPaidOnPrint ? fmtDate(milkPaidOnPrint) : '—'}</td>` : ''}
        <td style="text-align:right;padding:8px 10px">₹${fmtAmt(milkTotalPrint)}</td>
      </tr>` : `<tr><td colspan="${sharedUsed ? 4 : 6}" style="padding:12px;text-align:center;color:#888;font-style:italic">No milk records in this period</td></tr>`}
      </tbody></table>`;

  // ── Totals ──
  const rentTotalPrint  = rentRows.reduce((s,r) => s + (+r.amount || 0), 0);
  const elecTotalPrint  = elecRows.reduce((s,r) => s + r.amount, 0);
  const waterTotalPrint = waterRows.length * WATER_RATE_PER_CAN;
  const grandTotalPrint = rentTotalPrint + elecTotalPrint + waterTotalPrint + milkTotalPrint;

  // ── Water ──
  body += `<h3 style="font-size:1rem;margin:14px 0 8px;font-weight:800">💧 Water Bill</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:20px">
      <thead><tr style="background:#f7f7f9">
        <th style="text-align:left;padding:8px 10px">Month</th>
        <th style="text-align:right;padding:8px 10px">Total Cans</th>
        ${!sharedUsed ? '<th style="text-align:left;padding:8px 10px">Paid Via</th><th style="text-align:left;padding:8px 10px">Paid On</th>' : ''}
        <th style="text-align:right;padding:8px 10px">Amount</th>
      </tr></thead><tbody>
      ${waterRows.length ? `<tr>
        <td style="padding:8px 10px">${periodLabel}</td>
        <td style="text-align:right;padding:8px 10px">${waterRows.length}</td>
        ${!sharedUsed ? `<td style="padding:8px 10px">${[...waterModesSet].filter(Boolean).join(', ') || '—'}</td><td style="padding:8px 10px">${waterPaidOn ? fmtDate(waterPaidOn) : '—'}</td>` : ''}
        <td style="text-align:right;padding:8px 10px">₹${fmtAmt(waterTotalPrint)}</td>
      </tr>` : `<tr><td colspan="${sharedUsed ? 3 : 5}" style="padding:12px;text-align:center;color:#888;font-style:italic">No water purchases in this period</td></tr>`}
      </tbody></table>`;

  // ── Grand Total ──
  body += `
    <div style="margin-top:20px;padding:16px 18px;border:2px solid #333;border-radius:6px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:.8rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#555">GRAND TOTAL</div>
        <div style="font-size:.78rem;color:#555;margin-top:3px">${periodLabel} · Room Rent + Electricity + Water + Milk</div>
        ${sharedUsed ? `<div style="font-size:.78rem;color:#333;margin-top:6px"><strong>Paid Via:</strong> ${esc(sharedMode || '—')} &nbsp;·&nbsp; <strong>Paid On:</strong> ${sharedPaidOn ? fmtDate(sharedPaidOn) : '—'}</div>` : ''}
      </div>
      <div style="font-size:1.5rem;font-weight:800">₹${fmtAmt(grandTotalPrint)}</div>
    </div>
    <div style="margin-top:10px;font-size:.78rem;color:#555;display:flex;gap:18px;flex-wrap:wrap;justify-content:center;padding-top:8px;border-top:1px dashed #ccc">
      <span>🏠 Rent: <strong>₹${fmtAmt(rentTotalPrint)}</strong></span>
      ${elecTotalPrint > 0 ? `<span>⚡ Electricity: <strong>₹${fmtAmt(elecTotalPrint)}</strong></span>` : ''}
      ${waterTotalPrint > 0 ? `<span>💧 Water: <strong>₹${fmtAmt(waterTotalPrint)}</strong></span>` : ''}
      ${milkTotalPrint > 0 ? `<span>🥛 Milk: <strong>₹${fmtAmt(milkTotalPrint)}</strong></span>` : ''}
    </div>`;

  openPrintWindow('Combined Report - ' + periodLabel, body);
};


/* ═══════════════════════════════════════════════════════════════
   RENT TAB
   ═══════════════════════════════════════════════════════════════ */
function renderRentTab(){
  const todayStr = localDateStr();
  const curYM = todayStr.slice(0,7);
  const curY  = todayStr.slice(0,4);

  const monthRows = rentPayments.filter(r => rentMonthOf(r) === curYM);
  const yearRows  = rentPayments.filter(r => rentMonthOf(r).startsWith(curY));
  const monthAmt = monthRows.reduce((s,r) => s + (+r.amount || 0), 0);
  const yearAmt  = yearRows.reduce((s,r) => s + (+r.amount || 0), 0);
  const totalAmt = rentPayments.reduce((s,r) => s + (+r.amount || 0), 0);

  $('rent-month-amt').textContent = '₹' + fmtAmt(monthAmt);
  $('rent-month-c').textContent = monthRows.length + ' payment(s)';
  $('rent-year-amt').textContent = '₹' + fmtAmt(yearAmt);
  $('rent-year-c').textContent = yearRows.length + ' payment(s)';
  $('rent-total-amt').textContent = '₹' + fmtAmt(totalAmt);
  $('rent-total-c').textContent = rentPayments.length + ' payment(s)';

  const months = new Set(rentPayments.map(r => rentMonthOf(r)).filter(Boolean));
  const avg = months.size ? totalAmt / months.size : 0;
  $('rent-avg-amt').textContent = '₹' + fmtAmt(avg);
  $('rent-avg-c').textContent = `across ${months.size} month(s)`;

  $('rent-badge').textContent = rentPayments.length + ' entries';

  const tbody = $('rent-tbody');
  const mobileList = $('rent-mobile-list');

  if (!rentPayments.length){
    tbody.innerHTML = `<tr><td colspan="5"><div class="es"><div class="ei">🏠</div><p>No rent payments recorded.</p></div></td></tr>`;
    mobileList.innerHTML = `<div class="es"><div class="ei">🏠</div><p>No rent payments recorded.</p></div>`;
  } else {
    // Desktop Table
    tbody.innerHTML = rentPayments.map(r => `<tr>
      <td data-label="Month" style="font-weight:700">${monthLabel(rentMonthOf(r))}</td>
      <td data-label="Amount" class="amc">₹${fmtAmt(r.amount)}</td>
      <td data-label="Mode">${pmBadge(r.paymentMode)}</td>
      <td data-label="Paid On">${rentPaidOnOf(r) ? fmtDate(rentPaidOnOf(r)) : '—'}</td>
      <td data-label="Actions"><div class="ab">
        <button class="btn bo bxs" onclick="openRentEdit('${r.id}')" type="button">✏️</button>
        <button class="btn bd bxs" onclick="deleteRentPayment('${r.id}')" type="button">🗑️</button>
      </div></td>
    </tr>`).join('');

    // Mobile Cards
    mobileList.innerHTML = rentPayments.map(r => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 8px; border-bottom:1px solid var(--bdr);">
        <div>
          <div style="font-weight:700; font-size:.85rem; color:var(--txt);">${monthLabel(rentMonthOf(r))}</div>
          <div style="font-size:.7rem; color:var(--muted); margin-top:2px;">
            ${pmBadge(r.paymentMode)} ${rentPaidOnOf(r) ? '· ' + fmtDate(rentPaidOnOf(r)) : ''}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-weight:800; color:var(--err); font-size:.85rem;">₹${fmtAmt(r.amount)}</div>
          <div class="ab" style="gap:6px;">
            <button class="btn bo bxs" onclick="openRentEdit('${r.id}')" type="button">✏️</button>
            <button class="btn bd bxs" onclick="deleteRentPayment('${r.id}')" type="button">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  populateRentReportYears();
  onRentYearChange();
}

window.saveRentPayment = async function(){
  const amount = parseFloat($('rent-amount').value);
  const month = $('rent-month').value;
  const paidOnDate = $('rent-paid-date').value;
  const paymentMode = $('rent-pay').value;

  if (isNaN(amount) || amount < 0){ toast('Enter a valid amount.', 'error'); return; }
  if (!month){ toast('Select a month.', 'error'); return; }
  if (rentPayments.some(r => rentMonthOf(r) === month)){
    toast('Rent for this month already exists.', 'error');
    return;
  }

  const res = await addRecord(COL.RENT,
    { amount, month, date: month + '-01', paidOnDate: paidOnDate || localDateStr(), paymentMode },
    { pillMsg: 'Rent payment saved', pillIcon: '💾',
      historyAction: ACT.CREATE,
      historyData: { amount, month, paidOnDate, paymentMode } });

  if (res.ok) {
    clearRentForm();
    // Increment backup counter
    let currentCount = parseInt(localStorage.getItem('backup_entry_count') || '0');
    localStorage.setItem('backup_entry_count', (currentCount + 1).toString());
  }
};

window.clearRentForm = function(){
  $('rent-amount').value = '';
  const now = new Date();
  $('rent-month').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  $('rent-paid-date').value = localDateStr();
};

window.deleteRentPayment = function(id){
  const r = rentPayments.find(x => x.id === id);
  if (!r) return;
  showConfirm('🗑️ Delete Rent Payment',
    `<div class="confirm-box"><div class="impact">${monthLabel(rentMonthOf(r))} — ₹${fmtAmt(r.amount)}</div></div>`,
    'Delete',
    () => deleteRecord(COL.RENT, id, {
      pillMsg: 'Rent payment deleted', pillIcon: '🗑️',
      historyAction: ACT.DELETE,
      historyData: { id, amount: r.amount, month: r.month }
    }),
    'bd');
};

window.openRentEdit = function(id){
  const r = rentPayments.find(x => x.id === id);
  if (!r) return;
  $('rent-e-id').value = r.id;
  $('rent-e-amount').value = r.amount;
  $('rent-e-month').value = rentMonthOf(r);
  $('rent-e-paid-date').value = rentPaidOnOf(r);
  $('rent-e-pay').value = r.paymentMode || 'UPI';
  $('rent-edit-mo').classList.add('open');
};

window.updateRentPayment = async function(){
  const id = $('rent-e-id').value;
  const amount = parseFloat($('rent-e-amount').value);
  const month = $('rent-e-month').value;
  const paidOnDate = $('rent-e-paid-date').value;
  const paymentMode = $('rent-e-pay').value;

  if (isNaN(amount) || amount < 0 || !month){ toast('Fill all fields correctly.', 'error'); return; }

  const res = await updateRecord(COL.RENT, id,
    { amount, month, date: month + '-01', paidOnDate: paidOnDate || localDateStr(), paymentMode },
    { pillMsg: 'Rent payment updated', pillIcon: '✏️',
      historyAction: ACT.UPDATE, historyData: { id } });

  if (res.ok) closeMo('rent-edit-mo');
};

function populateRentReportYears(){
  const ySel = $('rent-rep-year');
  if (!ySel) return;
  const yrs = [...new Set(rentPayments.map(r => rentMonthOf(r).slice(0,4)).filter(Boolean))].sort((a,b) => b - a);
  const cur = String(new Date().getFullYear());
  if (!yrs.includes(cur)) yrs.unshift(cur);
  const v = ySel.value;
  ySel.innerHTML = yrs.map(y => `<option value="${y}">${y}</option>`).join('');
  ySel.value = yrs.includes(v) ? v : cur;
}

window.onRentYearChange = function(){
  const y = $('rent-rep-year').value;
  const mSel = $('rent-rep-month');
  const months = [...new Set(rentPayments.filter(r => rentMonthOf(r).startsWith(y)).map(r => rentMonthOf(r)))].sort();
  const v = mSel.value;
  mSel.innerHTML = '<option value="">Whole Year</option>' + months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  mSel.value = months.includes(v) ? v : '';
  renderRentReport();
};

window.renderRentReport = function(){
  const ySel = $('rent-rep-year');
  const mSel = $('rent-rep-month');
  const desktopEl = $('rent-report-body-desktop');
  const mobileEl = $('rent-report-body-mobile');
  
  if (!ySel || !ySel.value){ desktopEl.innerHTML = ''; mobileEl.innerHTML = ''; return; }
  const y = ySel.value, m = mSel.value;

  if (m){
    const rows = rentPayments.filter(r => rentMonthOf(r) === m);
    if (!rows.length){ 
      const empty = `<div class="es"><div class="ei">🏠</div><p>No rent payments for ${monthLabel(m)}.</p></div>`;
      desktopEl.innerHTML = empty; mobileEl.innerHTML = empty; return; 
    }
    const total = rows.reduce((s,r) => s + (+r.amount || 0), 0);
    
    desktopEl.innerHTML = `<div style="font-size:.85rem;color:var(--muted);margin-bottom:10px">${rows.length} payment(s) · Total: <strong>₹${fmtAmt(total)}</strong></div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
        <thead><tr style="border-bottom:2px solid var(--bdr)">
          <th style="text-align:left;padding:6px 8px;color:var(--muted)">Month</th>
          <th style="text-align:left;padding:6px 8px;color:var(--muted)">Paid Via</th>
          <th style="text-align:left;padding:6px 8px;color:var(--muted)">Paid On</th>
          <th style="text-align:right;padding:6px 8px;color:var(--muted)">Amount</th>
        </tr></thead><tbody>
        ${rows.map(r => `<tr style="border-bottom:1px solid var(--bdr)">
          <td style="padding:6px 8px;font-weight:600">${monthLabel(rentMonthOf(r))}</td>
          <td style="padding:6px 8px">${esc(r.paymentMode || '—')}</td>
          <td style="padding:6px 8px">${rentPaidOnOf(r) ? fmtDate(rentPaidOnOf(r)) : '—'}</td>
          <td style="text-align:right;padding:6px 8px;font-weight:700;color:var(--p)">₹${fmtAmt(r.amount)}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr style="border-top:2px solid var(--p)">
          <td style="padding:7px 8px;font-weight:800" colspan="3">TOTAL</td>
          <td style="text-align:right;padding:7px 8px;font-weight:800;color:var(--p)">₹${fmtAmt(total)}</td>
        </tr></tfoot>
      </table></div>`;

    mobileEl.innerHTML = `
      <div style="background:var(--pl); padding:12px; border-radius:8px; margin-bottom:12px; border:1px solid var(--p);">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <b style="color:var(--p);">${monthLabel(m)}</b>
          <b style="color:var(--p);">₹${fmtAmt(total)}</b>
        </div>
        <div style="font-size:.75rem; color:var(--txt);">
          <b>${rows.length}</b> payment(s) recorded.
        </div>
      </div>`;
    return;
  }

  const rows = rentPayments.filter(r => rentMonthOf(r).startsWith(y));
  const byMonth = {};
  rows.forEach(r => {
    const mm = rentMonthOf(r);
    if (!byMonth[mm]) byMonth[mm] = { amt: 0, cnt: 0 };
    byMonth[mm].amt += (+r.amount || 0);
    byMonth[mm].cnt++;
  });
  const months = Object.keys(byMonth).sort();
  const totalAmt = rows.reduce((s,r) => s + (+r.amount || 0), 0);

  if (!months.length){
    const empty = `<div class="es"><div class="ei">🏠</div><p>No rent payments for ${y}.</p></div>`;
    desktopEl.innerHTML = empty; mobileEl.innerHTML = empty; return;
  }

  desktopEl.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
    <thead><tr style="border-bottom:2px solid var(--bdr)">
      <th style="text-align:left;padding:6px 8px;color:var(--muted)">Month</th>
      <th style="text-align:right;padding:6px 8px;color:var(--muted)">Payments</th>
      <th style="text-align:right;padding:6px 8px;color:var(--muted)">Amount</th>
    </tr></thead><tbody>
    ${months.map(mm => `<tr style="border-bottom:1px solid var(--bdr)">
      <td style="padding:6px 8px;font-weight:600">${monthLabel(mm)}</td>
      <td style="text-align:right;padding:6px 8px">${byMonth[mm].cnt}</td>
      <td style="text-align:right;padding:6px 8px;font-weight:700;color:var(--p)">₹${fmtAmt(byMonth[mm].amt)}</td>
    </tr>`).join('')}
    </tbody>
    <tfoot><tr style="border-top:2px solid var(--p)">
      <td style="padding:7px 8px;font-weight:800">TOTAL</td>
      <td></td>
      <td style="text-align:right;padding:7px 8px;font-weight:800;color:var(--p)">₹${fmtAmt(totalAmt)}</td>
    </tr></tfoot>
  </table></div>`;

  mobileEl.innerHTML = months.map(mm => `
    <div style="background:var(--sec); padding:12px; border-radius:8px; margin-bottom:10px; border:1px solid var(--bdr); display:flex; justify-content:space-between;">
      <b style="font-size:.9rem; color:var(--p);">${monthLabel(mm)}</b>
      <span style="font-weight:800; color:var(--p);">₹${fmtAmt(byMonth[mm].amt)}</span>
    </div>
  `).join('') + `
    <div style="background:var(--pl); padding:12px; border-radius:8px; margin-top:16px; border:1px solid var(--p);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <b style="font-size:.9rem; color:var(--p);">TOTAL (${y})</b>
        <span style="font-weight:800; color:var(--p);">₹${fmtAmt(totalAmt)}</span>
      </div>
    </div>`;
}

window.printRentReport = function(){
  const y = $('rent-rep-year').value;
  const m = $('rent-rep-month').value;
  if (!y){ toast('Select a year first.', 'error'); return; }

  if (m){
    const rows = rentPayments.filter(r => rentMonthOf(r) === m);
    if (!rows.length){ toast('No payments for that month.', 'error'); return; }
    const total = rows.reduce((s,r) => s + (+r.amount || 0), 0);
    const body = printLetterhead('🏠 Room Rent Statement — ' + monthLabel(m)) +
      `<table style="width:100%;border-collapse:collapse;font-size:.9rem">
        <thead><tr style="background:#f7f7f9">
          <th style="text-align:left;padding:8px 10px">Month</th>
          <th style="text-align:left;padding:8px 10px">Paid Via</th>
          <th style="text-align:left;padding:8px 10px">Paid On</th>
          <th style="text-align:right;padding:8px 10px">Amount</th>
        </tr></thead><tbody>
        ${rows.map(r => `<tr><td style="padding:8px 10px">${monthLabel(rentMonthOf(r))}</td><td style="padding:8px 10px">${esc(r.paymentMode || '—')}</td><td style="padding:8px 10px">${rentPaidOnOf(r) ? fmtDate(rentPaidOnOf(r)) : '—'}</td><td style="text-align:right;padding:8px 10px">₹${fmtAmt(r.amount)}</td></tr>`).join('')}
        </tbody></table>
      <div style="margin-top:16px;font-weight:800">TOTAL: ₹${fmtAmt(total)}</div>`;
    openPrintWindow('Rent Statement - ' + monthLabel(m), body);
  } else {
    const rows = rentPayments.filter(r => rentMonthOf(r).startsWith(y));
    if (!rows.length){ toast('No data to print for ' + y, 'error'); return; }
    const byMonth = {};
    rows.forEach(r => {
      const mm = rentMonthOf(r);
      if (!byMonth[mm]) byMonth[mm] = { amt: 0, cnt: 0 };
      byMonth[mm].amt += (+r.amount || 0);
      byMonth[mm].cnt++;
    });
    const months = Object.keys(byMonth).sort();
    const totalAmt = rows.reduce((s,r) => s + (+r.amount || 0), 0);
    const body = printLetterhead('🏠 Room Rent Report — ' + y) +
      `<table style="width:100%;border-collapse:collapse;font-size:.9rem">
        <thead><tr style="background:#f7f7f9">
          <th style="text-align:left;padding:8px 10px">Month</th>
          <th style="text-align:right;padding:8px 10px">Payments</th>
          <th style="text-align:right;padding:8px 10px">Amount</th>
        </tr></thead><tbody>
        ${months.map(mm => `<tr><td style="padding:8px 10px">${monthLabel(mm)}</td><td style="text-align:right;padding:8px 10px">${byMonth[mm].cnt}</td><td style="text-align:right;padding:8px 10px">₹${fmtAmt(byMonth[mm].amt)}</td></tr>`).join('')}
        </tbody></table>
      <div style="margin-top:16px;font-weight:800">TOTAL: ₹${fmtAmt(totalAmt)}</div>`;
    openPrintWindow('Rent Report - ' + y, body);
  }
};


/* ═══════════════════════════════════════════════════════════════
   ELECTRICITY TAB
   ═══════════════════════════════════════════════════════════════ */
function renderElectricityTab(){
  $('elec-meter-no').textContent = ELEC_METER_NO;
  $('elec-baseline-date').textContent = 'Recorded ' + fmtDate(ELEC_BASELINE_DATE);
  $('elec-baseline').textContent = ELEC_BASELINE_UNIT.toLocaleString('en-IN');

  const dEl = $('elec-date');
  if (dEl && !dEl.value) dEl.value = localDateStr();
  updateDateDayLabel('elec-date','elec-date-day');
  const mEl = $('elec-month');
  if (mEl && !mEl.value){
    const now = new Date();
    mEl.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }
  const paidEl = $('elec-paid-date');
  if (paidEl && !paidEl.value) paidEl.value = localDateStr();

  const computed = getElecComputed();
  const latest = computed[computed.length - 1];
  const totalUnits = latest ? (+latest.reading || 0) - ELEC_BASELINE_UNIT : 0;
  const totalAmt = computed.reduce((s,r) => s + r.amount, 0);

  $('elec-total-units').textContent = totalUnits.toLocaleString('en-IN');
  $('elec-latest-reading').textContent = latest
    ? `Latest: ${(+latest.reading || 0).toLocaleString('en-IN')} (${monthLabel(latest.month)})`
    : 'No readings yet';
  $('elec-total-amt').textContent = '₹' + fmtAmt(totalAmt);
  $('elec-badge').textContent = computed.length + ' entries';

  const tbody = $('elec-tbody');
  const mobileList = $('elec-mobile-list');

  if (!computed.length){
    tbody.innerHTML = `<tr><td colspan="8"><div class="es"><div class="ei">⚡</div><p>No readings yet.</p></div></td></tr>`;
    mobileList.innerHTML = `<div class="es"><div class="ei">⚡</div><p>No readings yet.</p></div>`;
  } else {
    const revComputed = [...computed].reverse();
    
    // Desktop Table
    tbody.innerHTML = revComputed.map(r => `<tr>
      <td data-label="Month">${monthLabel(r.month)}</td>
      <td data-label="Date Recorded">${fmtDate(r.enteredDate)}</td>
      <td data-label="Reading">${(+r.reading || 0).toLocaleString('en-IN')}</td>
      <td data-label="Consumed">${r.consumed.toLocaleString('en-IN')} units</td>
      <td data-label="Amount">₹${fmtAmt(r.amount)}</td>
      <td data-label="Payment Mode">${pmBadge(r.paymentMode)}</td>
      <td data-label="Paid On">${r.paidOnDate ? fmtDate(r.paidOnDate) : '—'}</td>
      <td data-label="Actions"><div class="ab">
        <button class="btn bo bxs" onclick="openElecEdit('${r.id}')" type="button">✏️</button>
        <button class="btn bd bxs" onclick="deleteElecReading('${r.id}')" type="button">🗑️</button>
      </div></td>
    </tr>`).join('');

    // Mobile Cards
    mobileList.innerHTML = revComputed.map(r => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 8px; border-bottom:1px solid var(--bdr);">
        <div>
          <div style="font-weight:700; font-size:.85rem; color:var(--txt);">${monthLabel(r.month)}</div>
          <div style="font-size:.7rem; color:var(--muted); margin-top:2px;">Read: ${(+r.reading || 0).toLocaleString('en-IN')} · Used: <b style="color:var(--txt)">${r.consumed}</b></div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-weight:800; color:var(--err); font-size:.85rem;">₹${fmtAmt(r.amount)}</div>
          <div class="ab" style="gap:6px;">
            <button class="btn bo bxs" onclick="openElecEdit('${r.id}')" type="button">✏️</button>
            <button class="btn bd bxs" onclick="deleteElecReading('${r.id}')" type="button">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  populateElecReportYears();
  onElecYearChange();
}

window.saveElecReading = async function(){
  const month = $('elec-month').value;
  const enteredDate = $('elec-date').value;
  const reading = parseFloat($('elec-reading').value);
  const paymentMode = $('elec-payment').value;
  const paidOnDate = $('elec-paid-date').value;

  if (!month){ toast('Select a month.', 'error'); return; }
  if (!enteredDate){ toast('Select the date recorded.', 'error'); return; }
  if (isNaN(reading) || reading < 0){ toast('Enter a valid meter reading.', 'error'); return; }
  if (elecReadings.some(r => r.month === month)){ toast('Reading for this month already exists.', 'error'); return; }

  const sorted = [...elecReadings].sort((a,b) => String(a.month).localeCompare(String(b.month)));
  const before = sorted.filter(r => r.month < month).pop();
  const after  = sorted.find(r => r.month > month);
  const prevReading = before ? (+before.reading || 0) : ELEC_BASELINE_UNIT;

  if (reading < prevReading){ toast(`Reading must be ≥ previous reading (${prevReading}).`, 'error'); return; }
  if (after && reading > (+after.reading || 0)){ toast(`Reading must be ≤ next month (${after.reading}).`, 'error'); return; }

  const res = await addRecord(COL.ELEC,
    { month, enteredDate, reading, paymentMode, paidOnDate: paidOnDate || enteredDate },
    { pillMsg: 'Electricity reading saved', pillIcon: '⚡',
      historyAction: ACT.CREATE, historyData: { month, reading, amount: (reading - prevReading) * ELEC_RATE } });

  if (res.ok) {
    clearElecForm();
    // Increment backup counter
    let currentCount = parseInt(localStorage.getItem('backup_entry_count') || '0');
    localStorage.setItem('backup_entry_count', (currentCount + 1).toString());
  }
};

window.clearElecForm = function(){
  $('elec-reading').value = '';
  $('elec-date').value = localDateStr();
  updateDateDayLabel('elec-date','elec-date-day');
  const now = new Date();
  $('elec-month').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  $('elec-paid-date').value = localDateStr();
};

window.deleteElecReading = function(id){
  if (!confirm('Delete this reading? This may affect consumption calculations for later months.')) return;
  deleteRecord(COL.ELEC, id, {
    pillMsg: 'Reading deleted', pillIcon: '🗑️',
    historyAction: ACT.DELETE, historyData: { id }
  });
};

window.openElecEdit = function(id){
  const r = elecReadings.find(x => x.id === id);
  if (!r) return;
  $('elec-e-id').value = r.id;
  $('elec-e-month').value = r.month;
  $('elec-e-date').value = r.enteredDate;
  $('elec-e-reading').value = r.reading;
  $('elec-e-payment').value = r.paymentMode || 'UPI';
  $('elec-e-paid-date').value = r.paidOnDate || '';
  $('elec-edit-mo').classList.add('open');
};

window.updateElecReading = async function(){
  const id = $('elec-e-id').value;
  const month = $('elec-e-month').value;
  const enteredDate = $('elec-e-date').value;
  const reading = parseFloat($('elec-e-reading').value);
  const paymentMode = $('elec-e-payment').value;
  const paidOnDate = $('elec-e-paid-date').value;

  if (!month || !enteredDate || isNaN(reading) || reading < 0){
    toast('Fill all fields correctly.', 'error');
    return;
  }
  if (elecReadings.some(r => r.month === month && r.id !== id)){
    toast('Another reading already exists for this month.', 'error');
    return;
  }

  const res = await updateRecord(COL.ELEC, id,
    { month, enteredDate, reading, paymentMode, paidOnDate: paidOnDate || enteredDate },
    { pillMsg: 'Reading updated', pillIcon: '✏️',
      historyAction: ACT.UPDATE, historyData: { id } });

  if (res.ok) closeMo('elec-edit-mo');
};

function populateElecReportYears(){
  const ySel = $('elec-rep-year');
  if (!ySel) return;
  const yrs = [...new Set(elecReadings.map(r => String(r.month).slice(0,4)))].sort((a,b) => b - a);
  const cur = String(new Date().getFullYear());
  if (!yrs.includes(cur)) yrs.unshift(cur);
  const v = ySel.value;
  ySel.innerHTML = yrs.map(y => `<option value="${y}">${y}</option>`).join('');
  ySel.value = yrs.includes(v) ? v : cur;
}

window.onElecYearChange = function(){
  const y = $('elec-rep-year').value;
  const mSel = $('elec-rep-month');
  const months = getElecComputed().filter(r => r.month.startsWith(y)).map(r => r.month);
  const v = mSel.value;
  mSel.innerHTML = '<option value="">Whole Year</option>' + months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  mSel.value = months.includes(v) ? v : '';
  renderElecReport();
};

window.renderElecReport = function(){
  const y = $('elec-rep-year').value;
  const m = $('elec-rep-month').value;
  const desktopEl = $('elec-report-body-desktop');
  const mobileEl = $('elec-report-body-mobile');
  
  if (!y){ desktopEl.innerHTML = ''; mobileEl.innerHTML = ''; return; }

  const computed = getElecComputed().filter(r => r.month.startsWith(y));

  if (m){
    const r = computed.find(x => x.month === m);
    if (!r){ 
      const empty = `<div class="es"><div class="ei">⚡</div><p>No reading for ${monthLabel(m)}.</p></div>`;
      desktopEl.innerHTML = empty; mobileEl.innerHTML = empty; return; 
    }

    desktopEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:.85rem">
      <tr><td style="padding:6px 4px;color:var(--muted)">Meter No.</td><td style="padding:6px 4px;font-weight:700">${ELEC_METER_NO}</td></tr>
      <tr><td style="padding:6px 4px;color:var(--muted)">Billing Month</td><td style="padding:6px 4px;font-weight:700">${monthLabel(r.month)}</td></tr>
      <tr><td style="padding:6px 4px;color:var(--muted)">Date Recorded</td><td style="padding:6px 4px">${fmtDate(r.enteredDate)}</td></tr>
      <tr><td style="padding:6px 4px;color:var(--muted)">Previous Reading</td><td style="padding:6px 4px">${r.prevReading.toLocaleString('en-IN')}</td></tr>
      <tr><td style="padding:6px 4px;color:var(--muted)">Current Reading</td><td style="padding:6px 4px">${(+r.reading || 0).toLocaleString('en-IN')}</td></tr>
      <tr><td style="padding:6px 4px;color:var(--muted)">Units Consumed</td><td style="padding:6px 4px;font-weight:700">${r.consumed.toLocaleString('en-IN')} units</td></tr>
      <tr><td style="padding:6px 4px;color:var(--muted)">Rate</td><td style="padding:6px 4px">₹${ELEC_RATE}/unit</td></tr>
      <tr><td style="padding:10px 4px;font-weight:800;border-top:2px solid var(--bdr)">Total Amount</td>
          <td style="padding:10px 4px;font-weight:800;color:var(--p);border-top:2px solid var(--bdr)">₹${fmtAmt(r.amount)}</td></tr>
      <tr><td style="padding:6px 4px;color:var(--muted)">Paid Via</td><td style="padding:6px 4px">${esc(r.paymentMode || '—')}</td></tr>
      <tr><td style="padding:6px 4px;color:var(--muted)">Paid On</td><td style="padding:6px 4px">${r.paidOnDate ? fmtDate(r.paidOnDate) : '—'}</td></tr>
    </table>`;

    mobileEl.innerHTML = `
      <div style="background:var(--pl); padding:12px; border-radius:8px; margin-bottom:12px; border:1px solid var(--p);">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <b style="color:var(--p);">${monthLabel(r.month)}</b>
          <b style="color:var(--p);">₹${fmtAmt(r.amount)}</b>
        </div>
        <div style="font-size:.75rem; color:var(--txt); display:flex; justify-content:space-between;">
          <span>Used: <b>${r.consumed} units</b></span>
          <span>Read: <b>${(+r.reading || 0).toLocaleString('en-IN')}</b></span>
        </div>
        <div style="font-size:.7rem; color:var(--muted); margin-top:4px;">
          Paid: ${esc(r.paymentMode || '—')} ${r.paidOnDate ? `on ${fmtDate(r.paidOnDate)}` : ''}
        </div>
      </div>`;
    return;
  }

  const totalUnits = computed.reduce((s,r) => s + r.consumed, 0);
  const totalAmt = computed.reduce((s,r) => s + r.amount, 0);

  if (!computed.length){
    const empty = `<div class="es"><div class="ei">⚡</div><p>No readings for ${y}.</p></div>`;
    desktopEl.innerHTML = empty; mobileEl.innerHTML = empty; return;
  }

  desktopEl.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem">
    <thead><tr style="border-bottom:2px solid var(--bdr)">
      <th style="text-align:left;padding:6px 8px;color:var(--muted)">Month</th>
      <th style="text-align:right;padding:6px 8px;color:var(--muted)">Last Reading</th>
      <th style="text-align:right;padding:6px 8px;color:var(--muted)">Current Reading</th>
      <th style="text-align:right;padding:6px 8px;color:var(--muted)">Consumed</th>
      <th style="text-align:right;padding:6px 8px;color:var(--muted)">Amount</th>
      <th style="text-align:left;padding:6px 8px;color:var(--muted)">Paid Via</th>
    </tr></thead><tbody>
    ${computed.map(r => `<tr style="border-bottom:1px solid var(--bdr)">
      <td style="padding:6px 8px;font-weight:600">${monthLabel(r.month)}</td>
      <td style="text-align:right;padding:6px 8px">${r.prevReading.toLocaleString('en-IN')}</td>
      <td style="text-align:right;padding:6px 8px">${(+r.reading || 0).toLocaleString('en-IN')}</td>
      <td style="text-align:right;padding:6px 8px;font-weight:700">${r.consumed.toLocaleString('en-IN')}</td>
      <td style="text-align:right;padding:6px 8px;font-weight:700;color:var(--p)">₹${fmtAmt(r.amount)}</td>
      <td style="padding:6px 8px">${esc(r.paymentMode || '—')}</td>
    </tr>`).join('')}
    </tbody>
    <tfoot><tr style="border-top:2px solid var(--p)">
      <td style="padding:7px 8px;font-weight:800">TOTAL</td>
      <td colspan="2"></td>
      <td style="text-align:right;padding:7px 8px;font-weight:800">${totalUnits.toLocaleString('en-IN')}</td>
      <td style="text-align:right;padding:7px 8px;font-weight:800;color:var(--p)">₹${fmtAmt(totalAmt)}</td>
      <td></td>
    </tr></tfoot>
  </table></div>`;

  mobileEl.innerHTML = computed.map(r => `
    <div style="background:var(--sec); padding:12px; border-radius:8px; margin-bottom:10px; border:1px solid var(--bdr);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <b style="font-size:.9rem; color:var(--p);">${monthLabel(r.month)}</b>
        <span style="font-weight:800; color:var(--p);">₹${fmtAmt(r.amount)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:.75rem; color:var(--muted);">
        <span>Used: <b style="color:var(--txt)">${r.consumed}</b></span>
        <span>Reading: <b style="color:var(--txt)">${(+r.reading || 0).toLocaleString('en-IN')}</b></span>
      </div>
    </div>
  `).join('') + `
    <div style="background:var(--pl); padding:12px; border-radius:8px; margin-top:16px; border:1px solid var(--p);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <b style="font-size:.9rem; color:var(--p);">TOTAL (${y})</b>
        <span style="font-weight:800; color:var(--p);">₹${fmtAmt(totalAmt)}</span>
      </div>
      <div style="font-size:.75rem; color:var(--txt); margin-top:4px;">
        Total units: <b>${totalUnits.toLocaleString('en-IN')}</b>
      </div>
    </div>`;
}

window.printElecReport = function(){
  const y = $('elec-rep-year').value;
  const m = $('elec-rep-month').value;
  if (!y){ toast('Select a year first.', 'error'); return; }
  const computed = getElecComputed().filter(r => r.month.startsWith(y));
  if (!computed.length){ toast('No data to print.', 'error'); return; }

  if (m){
    const r = computed.find(x => x.month === m);
    if (!r){ toast('No reading for that month.', 'error'); return; }
    const body = printLetterhead('⚡ Electricity Bill — ' + monthLabel(r.month)) +
      `<table style="width:100%;border-collapse:collapse;font-size:.95rem">
        <tr><td style="padding:7px 4px">Meter No.</td><td style="padding:7px 4px;font-weight:700">${ELEC_METER_NO}</td></tr>
        <tr><td style="padding:7px 4px">Billing Month</td><td style="padding:7px 4px;font-weight:700">${monthLabel(r.month)}</td></tr>
        <tr><td style="padding:7px 4px">Previous Reading</td><td style="padding:7px 4px">${r.prevReading.toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:7px 4px">Current Reading</td><td style="padding:7px 4px">${(+r.reading || 0).toLocaleString('en-IN')}</td></tr>
        <tr><td style="padding:7px 4px">Units Consumed</td><td style="padding:7px 4px;font-weight:700">${r.consumed.toLocaleString('en-IN')} units</td></tr>
        <tr><td style="padding:12px 4px;font-weight:800;font-size:1.1rem;border-top:2px solid #333">Total Amount</td>
            <td style="padding:12px 4px;font-weight:800;font-size:1.1rem;border-top:2px solid #333">₹${fmtAmt(r.amount)}</td></tr>
      </table>`;
    openPrintWindow('Electricity Bill - ' + monthLabel(r.month), body);
  } else {
    const totalUnits = computed.reduce((s,r) => s + r.consumed, 0);
    const totalAmt = computed.reduce((s,r) => s + r.amount, 0);
    const body = printLetterhead('⚡ Electricity Consumption Report — ' + y) +
      `<div style="font-size:.85rem;color:#444;margin-bottom:12px">Meter No: <strong>${ELEC_METER_NO}</strong> · Baseline: <strong>${ELEC_BASELINE_UNIT}</strong> on ${fmtDate(ELEC_BASELINE_DATE)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:.86rem">
        <thead><tr style="background:#f7f7f9">
          <th style="text-align:left;padding:8px">Month</th>
          <th style="text-align:right;padding:8px">Reading</th>
          <th style="text-align:right;padding:8px">Consumed</th>
          <th style="text-align:right;padding:8px">Amount</th>
        </tr></thead><tbody>
        ${computed.map(r => `<tr><td style="padding:7px 8px">${monthLabel(r.month)}</td><td style="text-align:right;padding:7px 8px">${(+r.reading || 0).toLocaleString('en-IN')}</td><td style="text-align:right;padding:7px 8px">${r.consumed.toLocaleString('en-IN')}</td><td style="text-align:right;padding:7px 8px">₹${fmtAmt(r.amount)}</td></tr>`).join('')}
        </tbody></table>
      <div style="margin-top:16px;font-weight:800">TOTAL: ${totalUnits.toLocaleString('en-IN')} units · ₹${fmtAmt(totalAmt)}</div>`;
    openPrintWindow('Electricity Report - ' + y, body);
  }
};


window.filterWaterTable = function() {
  const mFilter = $('water-filt-month');
  const yFilter = $('water-filt-year');
  const selM = mFilter ? mFilter.value : '';
  const selY = yFilter ? yFilter.value : '';
  
  let displayedWater = waterPurchases;
  if (selM) displayedWater = displayedWater.filter(w => String(w.date).startsWith(selM));
  else if (selY) displayedWater = displayedWater.filter(w => String(w.date).startsWith(selY));

  const badge = $('water-badge');
  if (badge) badge.textContent = displayedWater.length + ' entries';

  const tbody = $('water-tbody');
  if (!tbody) return;

  if (!displayedWater.length){
    $('water-tbody').innerHTML = `<tr><td colspan="4"><div class="es"><div class="ei">💧</div><p>No water purchases recorded for this filter.</p></div></td></tr>`;
    $('water-mobile-list').innerHTML = `<div class="es"><div class="ei">💧</div><p>No water purchases recorded for this filter.</p></div>`;
    return;
  }

  // 1. Desktop Table Render
  $('water-tbody').innerHTML = displayedWater.map(w => `<tr>
    <td data-label="Date" class="dc">${fmtDate(w.date)}</td>
    <td data-label="Notes" class="nc">${esc(w.note || '—')}</td>
    <td data-label="Amount" class="amc">₹${fmtAmt(w.amount)}</td>
    <td data-label="Actions"><div class="ab">
      <button class="btn bo bxs" onclick="openWaterEdit('${w.id}')" type="button">✏️</button>
      <button class="btn bd bxs" onclick="deleteWaterExp('${w.id}')" type="button">🗑️</button>
    </div></td>
  </tr>`).join('');

  // 2. Mobile Card Render
  $('water-mobile-list').innerHTML = displayedWater.map(w => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 8px; border-bottom:1px solid var(--bdr);">
      <div>
        <div style="font-weight:700; font-size:.85rem; color:var(--txt);">${fmtDate(w.date)}</div>
        <div style="font-size:.7rem; color:var(--muted); margin-top:2px;">
          ${w.note ? esc(w.note) : '💧 Water Jar'}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="font-weight:800; color:var(--err); font-size:.85rem;">₹${fmtAmt(w.amount)}</div>
        <div class="ab" style="gap:6px;">
          <button class="btn bo bxs" onclick="openWaterEdit('${w.id}')" type="button">✏️</button>
          <button class="btn bd bxs" onclick="deleteWaterExp('${w.id}')" type="button">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderWaterTab(){
  const dEl = $('water-date');
  if (dEl && !dEl.value) dEl.value = localDateStr();
  updateDateDayLabel('water-date','water-date-day');

  // Populate Filter Dropdowns
  const mFilter = $('water-filt-month');
  const yFilter = $('water-filt-year');
  if (mFilter && yFilter) {
    const prevM = mFilter.value;
    const prevY = yFilter.value;
    const months = new Set();
    const years = new Set();
    waterPurchases.forEach(w => {
      if (w.date) {
        months.add(w.date.slice(0, 7));
        years.add(w.date.slice(0, 4));
      }
    });
    
    mFilter.innerHTML = '<option value="">All Months</option>' + [...months].sort().reverse().map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
    yFilter.innerHTML = '<option value="">All Years</option>' + [...years].sort().reverse().map(y => `<option value="${y}">${y}</option>`).join('');
    
    if (months.has(prevM)) mFilter.value = prevM;
    if (years.has(prevY)) yFilter.value = prevY;
  }

  const todayStr = localDateStr();
  const curYM = todayStr.slice(0,7);
  const curY  = todayStr.slice(0,4);

  const monthRows = waterPurchases.filter(w => String(w.date).startsWith(curYM));
  const yearRows  = waterPurchases.filter(w => String(w.date).startsWith(curY));
  const monthAmt = monthRows.reduce((s,w) => s + (+w.amount || 0), 0);
  const yearAmt  = yearRows.reduce((s,w) => s + (+w.amount || 0), 0);
  const totalAmt = waterPurchases.reduce((s,w) => s + (+w.amount || 0), 0);

  $('water-month-amt').textContent = '₹' + fmtAmt(monthAmt);
  $('water-month-c').textContent = monthRows.length + ' cans';
  $('water-year-amt').textContent = '₹' + fmtAmt(yearAmt);
  $('water-year-c').textContent = yearRows.length + ' cans';
  $('water-total-amt').textContent = '₹' + fmtAmt(totalAmt);
  $('water-total-c').textContent = waterPurchases.length + ' cans';

  filterWaterTable();
  renderWaterPayList();
  populateWaterReportYears();
  onWaterYearChange();
}

window.saveWaterExp = async function(){
  const date = $('water-date').value;
  const amount = parseFloat($('water-amount').value);
  const note = ($('water-note').value || '').trim();
  if (!date){ toast('Select a date.', 'error'); return; }
  if (isNaN(amount) || amount < 0){ toast('Enter a valid amount.', 'error'); return; }

  const res = await addRecord(COL.WATER,
    { date, amount, note },
    { pillMsg: 'Water purchase saved', pillIcon: '💧',
      historyAction: ACT.CREATE, historyData: { date, amount, note } });

  if (res.ok) {
    clearWaterForm();
    // Increment backup counter
    let currentCount = parseInt(localStorage.getItem('backup_entry_count') || '0');
    localStorage.setItem('backup_entry_count', (currentCount + 1).toString());
  }
};

window.clearWaterForm = function(){
  $('water-amount').value = '';
  $('water-date').value = localDateStr();
  updateDateDayLabel('water-date','water-date-day');
};

window.deleteWaterExp = function(id){
  if (!confirm('Delete this water purchase entry?')) return;
  deleteRecord(COL.WATER, id, {
    pillMsg: 'Purchase deleted', pillIcon: '🗑️',
    historyAction: ACT.DELETE, historyData: { id }
  });
};

window.openWaterEdit = function(id){
  const w = waterPurchases.find(x => x.id === id);
  if (!w) return;
  $('water-e-id').value = w.id;
  $('water-e-date').value = w.date;
  $('water-e-amount').value = w.amount;
  $('water-e-note').value = w.note || '';
  $('water-edit-mo').classList.add('open');
};

window.updateWaterExp = async function(){
  const id = $('water-e-id').value;
  const date = $('water-e-date').value;
  const amount = parseFloat($('water-e-amount').value);
  const note = ($('water-e-note').value || '').trim();
  if (!date || isNaN(amount) || amount < 0){ toast('Fill all fields correctly.', 'error'); return; }

  const res = await updateRecord(COL.WATER, id,
    { date, amount, note },
    { pillMsg: 'Purchase updated', pillIcon: '✏️',
      historyAction: ACT.UPDATE, historyData: { id } });

  if (res.ok) closeMo('water-edit-mo');
};

function renderWaterPayList(){
  const el = $('water-pay-list');
  if (!el) return;
  const byMonth = {};
  waterPurchases.forEach(w => {
    const mm = String(w.date).slice(0,7);
    if (!byMonth[mm]) byMonth[mm] = { cnt: 0 };
    byMonth[mm].cnt++;
  });
  const months = Object.keys(byMonth).sort((a,b) => b.localeCompare(a));
  if (!months.length){
    el.innerHTML = `<div class="es" style="padding:20px"><div class="ei">💧</div><p>No water purchases yet.</p></div>`;
    return;
  }
  el.innerHTML = months.map(m => {
  const mode = waterPayModes[m] || '';
  const paidOn = waterPayDates[m] || '';
  const cans = byMonth[m].cnt;
  return `<div class="wpm-row">
    <span class="wpm-month">${monthLabel(m)}</span>
    <span class="wpm-cans">${cans} can${cans===1?'':'s'}</span>
    <div class="wpm-mode-wrap">
      <select class="fc2" id="wpm-${m}" style="width:auto;padding:6px 10px;font-size:.78rem">
        <option value="">— Select —</option>
        <option value="UPI" ${mode==='UPI'?'selected':''}>UPI</option>
        <option value="Cash" ${mode==='Cash'?'selected':''}>Cash</option>
        <option value="Bank Transfer" ${mode==='Bank Transfer'?'selected':''}>Bank Transfer</option>
      </select>
      <input type="date" class="fc2" id="wpd-${m}" value="${paidOn}"
             style="width:auto;padding:6px 10px;font-size:.78rem"/>
      <button class="btn bp bxs" onclick="saveWaterPayMode('${m}')" type="button">💾 Save</button>
      ${mode ? pmBadge(mode) : '<span class="wpm-hint">not set</span>'}
      ${paidOn ? `<span class="wpm-hint">· paid ${fmtDate(paidOn)}</span>` : ''}
    </div>
  </div>`;
}).join('');
}

window.saveWaterPayMode = async function(month){
  const sel = $('wpm-' + month);
  const dateEl = $('wpd-' + month);
  const mode = sel ? sel.value : '';
  const paidOn = dateEl ? dateEl.value : '';
  if (!mode){ toast('Select UPI, Cash or Bank Transfer first.', 'error'); return; }
  await setRecord(COL.WATER_PAY, month,
    { mode, paidOn: paidOn || '', updatedAt: new Date().toISOString() },
    { pillMsg: 'Payment info saved for ' + monthLabel(month), pillIcon: '💳' });
};

function populateWaterReportYears(){
  const ySel = $('water-rep-year');
  if (!ySel) return;
  const yrs = [...new Set(waterPurchases.map(w => String(w.date).slice(0,4)))].sort((a,b) => b - a);
  const cur = String(new Date().getFullYear());
  if (!yrs.includes(cur)) yrs.unshift(cur);
  const v = ySel.value;
  ySel.innerHTML = yrs.map(y => `<option value="${y}">${y}</option>`).join('');
  ySel.value = yrs.includes(v) ? v : cur;
}

window.onWaterYearChange = function(){
  const y = $('water-rep-year').value;
  const mSel = $('water-rep-month');
  const months = [...new Set(waterPurchases.filter(w => String(w.date).startsWith(y)).map(w => String(w.date).slice(0,7)))].sort();
  const v = mSel.value;
  mSel.innerHTML = '<option value="">Whole Year</option>' + months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  mSel.value = months.includes(v) ? v : '';
  renderWaterReport();
};

window.renderWaterReport = function(){
  const y = $('water-rep-year').value;
  const m = $('water-rep-month').value;
  const desktopEl = $('water-report-body-desktop');
  const mobileEl = $('water-report-body-mobile');
  
  if (!y){ desktopEl.innerHTML = ''; mobileEl.innerHTML = ''; return; }

  if (m){
    const rows = waterPurchases.filter(w => String(w.date).startsWith(m));
    if (!rows.length){ 
      const empty = `<div class="es"><div class="ei">💧</div><p>No purchases for ${monthLabel(m)}.</p></div>`;
      desktopEl.innerHTML = empty; mobileEl.innerHTML = empty; return; 
    }
    const mode = waterPayModes[m] || '—';
    const date = waterPayDates[m] ? fmtDate(waterPayDates[m]) : '—';
    const amount = rows.length * WATER_RATE_PER_CAN;

    desktopEl.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead><tr style="border-bottom:2px solid var(--bdr)">
        <th style="text-align:left;padding:8px;color:var(--muted)">Month</th>
        <th style="text-align:right;padding:8px;color:var(--muted)">Total Cans</th>
        <th style="text-align:left;padding:8px;color:var(--muted)">Paid Via</th>
        <th style="text-align:left;padding:8px;color:var(--muted)">Paid On</th>
        <th style="text-align:right;padding:8px;color:var(--muted)">Amount</th>
      </tr></thead><tbody>
      <tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:8px;font-weight:600">${monthLabel(m)}</td>
        <td style="text-align:right;padding:8px;font-weight:700">${rows.length}</td>
        <td style="padding:8px">${esc(mode)}</td>
        <td style="padding:8px">${date}</td>
        <td style="text-align:right;padding:8px;font-weight:700;color:var(--p)">₹${fmtAmt(amount)}</td>
      </tr></tbody>
    </table></div>`;

    mobileEl.innerHTML = `
      <div style="background:var(--pl); padding:12px; border-radius:8px; margin-bottom:12px; border:1px solid var(--p);">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <b style="color:var(--p);">${monthLabel(m)}</b>
          <b style="color:var(--p);">₹${fmtAmt(amount)}</b>
        </div>
        <div style="font-size:.75rem; color:var(--txt); display:flex; justify-content:space-between;">
          <span><b>${rows.length}</b> cans</span>
          <span>Paid via: <b>${esc(mode)}</b></span>
        </div>
        ${date !== '—' ? `<div style="font-size:.7rem; color:var(--muted); margin-top:4px;">Paid on: ${date}</div>` : ''}
      </div>`;
    return;
  }

  const rows = waterPurchases.filter(w => String(w.date).startsWith(y));
  const byMonth = {};
  rows.forEach(w => {
    const mm = String(w.date).slice(0,7);
    if (!byMonth[mm]) byMonth[mm] = { cnt: 0 };
    byMonth[mm].cnt++;
  });
  const months = Object.keys(byMonth).sort();
  const totalAmt = rows.length * WATER_RATE_PER_CAN;

  if (!months.length){
    const empty = `<div class="es"><div class="ei">💧</div><p>No water purchases for ${y}.</p></div>`;
    desktopEl.innerHTML = empty; mobileEl.innerHTML = empty; return;
  }

  desktopEl.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
    <thead><tr style="border-bottom:2px solid var(--bdr)">
      <th style="text-align:left;padding:8px;color:var(--muted)">Month</th>
      <th style="text-align:right;padding:8px;color:var(--muted)">Cans</th>
      <th style="text-align:left;padding:8px;color:var(--muted)">Paid Via</th>
      <th style="text-align:left;padding:8px;color:var(--muted)">Paid On</th>
      <th style="text-align:right;padding:8px;color:var(--muted)">Amount</th>
    </tr></thead><tbody>
    ${months.map(mm => `<tr style="border-bottom:1px solid var(--bdr)">
      <td style="padding:8px;font-weight:600">${monthLabel(mm)}</td>
      <td style="text-align:right;padding:8px;font-weight:700">${byMonth[mm].cnt}</td>
      <td style="padding:8px">${esc(waterPayModes[mm] || '—')}</td>
      <td style="padding:8px">${waterPayDates[mm] ? fmtDate(waterPayDates[mm]) : '—'}</td>
      <td style="text-align:right;padding:8px;font-weight:700;color:var(--p)">₹${fmtAmt(byMonth[mm].cnt * WATER_RATE_PER_CAN)}</td>
    </tr>`).join('')}
    </tbody>
    <tfoot><tr style="border-top:2px solid var(--p)">
      <td style="padding:8px;font-weight:800">TOTAL</td>
      <td style="text-align:right;padding:8px;font-weight:800">${rows.length}</td>
      <td></td>
      <td></td>
      <td style="text-align:right;padding:8px;font-weight:800;color:var(--p)">₹${fmtAmt(totalAmt)}</td>
    </tr></tfoot>
  </table></div>`;

  mobileEl.innerHTML = months.map(mm => `
    <div style="background:var(--sec); padding:12px; border-radius:8px; margin-bottom:10px; border:1px solid var(--bdr);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <b style="font-size:.9rem; color:var(--p);">${monthLabel(mm)}</b>
        <span style="font-weight:800; color:var(--p);">₹${fmtAmt(byMonth[mm].cnt * WATER_RATE_PER_CAN)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:.75rem; color:var(--muted);">
        <span>Cans: <b style="color:var(--txt)">${byMonth[mm].cnt}</b></span>
        <span>Via: <b style="color:var(--txt)">${esc(waterPayModes[mm] || '—')}</b></span>
      </div>
    </div>
  `).join('') + `
    <div style="background:var(--pl); padding:12px; border-radius:8px; margin-top:16px; border:1px solid var(--p);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <b style="font-size:.9rem; color:var(--p);">TOTAL (${y})</b>
        <span style="font-weight:800; color:var(--p);">₹${fmtAmt(totalAmt)}</span>
      </div>
      <div style="font-size:.75rem; color:var(--txt); margin-top:4px;">
        Total cans: <b>${rows.length}</b>
      </div>
    </div>`;
}

window.printWaterReport = function(){
  const y = $('water-rep-year').value;
  const m = $('water-rep-month').value;
  if (!y){ toast('Select a year first.', 'error'); return; }

  if (m){
    const rows = waterPurchases.filter(w => String(w.date).startsWith(m));
    if (!rows.length){ toast('No purchases for that month.', 'error'); return; }
    const amount = rows.length * WATER_RATE_PER_CAN;
    const mode = waterPayModes[m] || '—';
    const body = printLetterhead('💧 Water Purchase Statement — ' + monthLabel(m)) +
      `<table style="width:100%;border-collapse:collapse;font-size:.9rem">
        <thead><tr style="background:#f7f7f9">
  <th style="text-align:left;padding:8px 10px">Month</th>
  <th style="text-align:right;padding:8px 10px">Total Cans</th>
  <th style="text-align:right;padding:8px 10px">Amount</th>
  <th style="text-align:left;padding:8px 10px">Paid Via</th>
  <th style="text-align:left;padding:8px 10px">Paid On</th>
</tr></thead><tbody>
        <tr><td style="padding:9px 10px">${monthLabel(m)}</td><td style="text-align:right;padding:9px 10px">${rows.length}</td><td style="text-align:right;padding:9px 10px">₹${fmtAmt(amount)}</td><td style="padding:9px 10px">${esc(mode)}</td><td style="padding:9px 10px">${waterPayDates[m] ? fmtDate(waterPayDates[m]) : '—'}</td></tr>
        </tbody></table>`;
    openPrintWindow('Water Statement - ' + monthLabel(m), body);
  } else {
    const rows = waterPurchases.filter(w => String(w.date).startsWith(y));
    if (!rows.length){ toast('No data to print for ' + y, 'error'); return; }
    const byMonth = {};
    rows.forEach(w => {
      const mm = String(w.date).slice(0,7);
      if (!byMonth[mm]) byMonth[mm] = { cnt: 0 };
      byMonth[mm].cnt++;
    });
    const months = Object.keys(byMonth).sort();
    const totalAmt = rows.length * WATER_RATE_PER_CAN;
    const body = printLetterhead('💧 Water Purchase Report — ' + y) +
      `<table style="width:100%;border-collapse:collapse;font-size:.9rem">
        <thead><tr style="background:#f7f7f9">
  <th style="text-align:left;padding:8px 10px">Month</th>
  <th style="text-align:right;padding:8px 10px">Cans</th>
  <th style="text-align:right;padding:8px 10px">Amount</th>
  <th style="text-align:left;padding:8px 10px">Paid Via</th>
  <th style="text-align:left;padding:8px 10px">Paid On</th>
</tr></thead><tbody>
        ${months.map(mm => `<tr><td style="padding:8px 10px">${monthLabel(mm)}</td><td style="text-align:right;padding:8px 10px">${byMonth[mm].cnt}</td><td style="text-align:right;padding:8px 10px">₹${fmtAmt(byMonth[mm].cnt * WATER_RATE_PER_CAN)}</td><td style="padding:8px 10px">${esc(waterPayModes[mm] || '—')}</td><td style="padding:8px 10px">${waterPayDates[mm] ? fmtDate(waterPayDates[mm]) : '—'}</td></tr>`).join('')}
        </tbody></table>
      <div style="margin-top:16px;font-weight:800">TOTAL: ${rows.length} cans · ₹${fmtAmt(totalAmt)}</div>`;
    openPrintWindow('Water Report - ' + y, body);
  }
};


/* ═══════════════════════════════════════════════════════════════
   EXPORT / BACKUP / RESTORE / EMAIL
   ═══════════════════════════════════════════════════════════════ */
window.exportJSON = function(){
  if (!expenses.length && !rentPayments.length && !elecReadings.length && !waterPurchases.length){
    toast('No data.', 'error');
    return;
  }
  backupJSON({
    expenses,
    categories: categories.map(c => c.name),
    rentPayments,
    electricityReadings: elecReadings,
    waterPurchases,
    waterPayModes
  }, `household-tracker-${localDateStr()}.json`);

  logHistory(ACT.EXPORT, {
    expenses: expenses.length,
    categories: categories.length,
    rent: rentPayments.length,
    elec: elecReadings.length,
    water: waterPurchases.length
  });
};

window.importJSON = async function(input){
  const file = input.files[0];
  if (!file) return;
  try {
    const backup = await readJSONFile(file);
    const arr = Array.isArray(backup) ? backup : (backup.expenses || []);
    if (!arr.length) throw new Error('empty');

    const existing = new Set(expenses.map(x => x.id));
    const fresh = arr.filter(x => !existing.has(x.id));

    showConfirm('📥 Import Backup',
      `<div class="confirm-box"><div class="impact">Importing ${fresh.length} new record(s)</div></div>`,
      'Import',
      async () => {
        await restoreJSON({ expenses: fresh }, { expenses: COL.EXPENSE });
        if (backup.categories){
          const existingCatNames = new Set(categories.map(c => c.name));
          const newCats = backup.categories.filter(n => !existingCatNames.has(n));
          if (newCats.length){
            await restoreJSON({ categories: newCats.map(name => ({ name })) },
                             { categories: COL.CATEGORY });
          }
        }
      },
      'bp');
  } catch (e){
    toast('Invalid file.', 'error');
  }
  input.value = '';
};


/* ═══════════════════════════════════════════════════════════════
   MONTHLY SUMMARY MODAL
   ═══════════════════════════════════════════════════════════════ */
window.openMonthlySummary = function(){
  const now = new Date();
  const mSel = $('sum-month');
  const ySel = $('sum-year');
  if (mSel) mSel.value = now.getMonth() + 1;
  if (ySel && !ySel.options.length){
    for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--){
      const o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      if (y === now.getFullYear()) o.selected = true;
      ySel.appendChild(o);
    }
  }
  $('summary-mo').classList.add('open');
  renderSummary();
};

function renderSummary(){
  const m = parseInt($('sum-month').value);
  const y = parseInt($('sum-year').value);
  const mm = String(m).padStart(2,'0');
  const prefix = `${y}-${mm}`;
  const rows = expenses.filter(e => e.date && e.date.startsWith(prefix) && e.category !== 'No Expense');
  const total = rows.reduce((s,e) => s + (+e.amount || 0), 0);

  const byCat = {};
  rows.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0); });

  const byGrp = {};
  Object.entries(byCat).forEach(([cat, amt]) => {
    const g = getCatGroup(cat);
    if (!byGrp[g.label]) byGrp[g.label] = { color: g.color, total: 0, cats: {} };
    byGrp[g.label].total += amt;
    byGrp[g.label].cats[cat] = amt;
  });

  const byDay = {};
  rows.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + (+e.amount || 0); });
  const days = Object.keys(byDay).sort();
  const mName = CAL_MONTHS[m-1];

  let html = `<div id="printable-summary">
    <div style="text-align:center;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid var(--bdr)">
      <h2 style="font-size:1.15rem;font-weight:800">💰 Expense Summary — ${mName} ${y}</h2>
      <div style="font-size:.8rem;color:var(--muted);margin-top:4px">${rows.length} transactions · Total: <strong style="color:var(--p)">₹${fmtAmt(total)}</strong></div>
    </div>`;

  html += `<div style="margin-bottom:18px"><div style="font-weight:700;font-size:.85rem;margin-bottom:10px">📂 By Category Group</div>`;
  Object.entries(byGrp).sort((a,b) => b[1].total - a[1].total).forEach(([grpLabel, g]) => {
    const pct = total > 0 ? (g.total/total*100).toFixed(1) : 0;
    html += `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;margin-bottom:3px">
        <span style="color:${g.color}">${grpLabel}</span>
        <span>₹${fmtAmt(g.total)} <span style="color:var(--muted);font-weight:400">${pct}%</span></span>
      </div>
      <div style="height:6px;border-radius:3px;background:var(--bdr)"><div style="height:100%;border-radius:3px;background:${g.color};width:${pct}%"></div></div>
    </div>`;
  });
  html += `</div>`;

  html += `<div><div style="font-weight:700;font-size:.85rem;margin-bottom:8px">📅 Day-by-Day</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.76rem">
      <thead><tr style="border-bottom:2px solid var(--bdr)">
        <th style="text-align:left;padding:5px 8px;color:var(--muted)">Date</th>
        <th style="text-align:right;padding:5px 8px;color:var(--muted)">Amount</th>
        <th style="text-align:right;padding:5px 8px;color:var(--muted)">% of Month</th>
      </tr></thead><tbody>
      ${days.map(d => `<tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:5px 8px">${fmtDate(d)}</td>
        <td style="text-align:right;padding:5px 8px;font-weight:700;color:var(--p)">₹${fmtAmt(byDay[d])}</td>
        <td style="text-align:right;padding:5px 8px;color:var(--muted)">${total > 0 ? (byDay[d]/total*100).toFixed(1) : 0}%</td>
      </tr>`).join('')}
      </tbody>
      <tfoot><tr style="border-top:2px solid var(--p)">
        <td style="padding:6px 8px;font-weight:800">TOTAL</td>
        <td style="text-align:right;padding:6px 8px;font-weight:800;color:var(--p)">₹${fmtAmt(total)}</td>
        <td style="text-align:right;padding:6px 8px">100%</td>
      </tr></tfoot>
    </table></div></div>
  </div>`;

  $('summary-body').innerHTML = html;
}

window.printSummary = function(){
  const el = $('printable-summary');
  if (!el) return;
  openPrintWindow('Monthly Summary', el.innerHTML);
};


/* ═══════════════════════════════════════════════════════════════
   SETTINGS TAB
   ═══════════════════════════════════════════════════════════════ */
async function loadSessionStats() {
  const datePick = $('stat-date-pick');
  
  // Get the local date (IST) instead of UTC
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  
  // If the date picker is empty, set it to today
  if (datePick && !datePick.value) {
    datePick.value = todayStr;
  }
  
  const targetDate = datePick ? datePick.value : todayStr;

  try {
    const snap = await getDoc(doc(db, 'usage_stats', targetDate));
    
    if (snap.exists()) {
      const data = snap.data();
      $('stat-logins').textContent = data.logins || 0;
      $('stat-refreshes').textContent = data.refreshes || 0;
      $('stat-devices').textContent = data.devices ? data.devices.length : 0;
      
      if (data.lastActive) {
        const t = new Date(data.lastActive);
        $('stat-last').textContent = t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      } else {
        $('stat-last').textContent = '—';
      }
    } else {
      $('stat-logins').textContent = '0';
      $('stat-refreshes').textContent = '0';
      $('stat-devices').textContent = '0';
      $('stat-last').textContent = '—';
    }
  } catch (e) {
    console.warn('Failed to load stats', e);
  }

  // Calculate the 24-hour cache timer
  const cacheTime = parseInt(localStorage.getItem('cache_expenses_time') || '0');
  const timerEl = $('stat-sync-timer');
  
  if (timerEl && cacheTime > 0) {
    const msLeft = (24 * 60 * 60 * 1000) - (Date.now() - cacheTime);
    
    if (msLeft > 0) {
      const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
      const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
      timerEl.textContent = `${hoursLeft}h ${minsLeft}m`;
    } else {
      timerEl.textContent = 'Expired (Ready to Sync)';
    }
  } else if (timerEl) {
    timerEl.textContent = 'Not Synced Yet';
  }
}

function renderSettingsUI(){
  const theme = localStorage.getItem('hh_theme_mode') || 'light';
  const lt = $('theme-light'), dk = $('theme-dark');
  if (lt && dk){
    lt.classList.toggle('active', theme === 'light');
    dk.classList.toggle('active', theme === 'dark');
  }

  renderThemeGallery('palette-gallery', renderSettingsUI);

  const sm = $('set-session-min');
  if (sm) sm.value = HOUSEHOLD_SETTINGS.sessionMin || 15;

  const acOn = HOUSEHOLD_SETTINGS.autoclearHistory === true;
  const acOnEl = $('autoclear-on'), acOffEl = $('autoclear-off');
  if (acOnEl && acOffEl){
    acOnEl.classList.toggle('active', acOn);
    acOffEl.classList.toggle('active', !acOn);
  }
  const acStatus = $('autoclear-status');
  if (acStatus){
    acStatus.textContent = acOn
      ? 'Currently on — History entries older than 1 month are cleared automatically.'
      : 'Currently off — History entries are kept indefinitely.';
  }
  renderFbStatus();
}
function renderFbStatus(){
  const el = $('fb-status');
  if (!el) return;
  el.innerHTML = `
    <div class="ibx okb">
      ✅ Connected to Firestore<br>
      Project: <b>${esc(firebaseConfig.projectId)}</b>
    </div>
    <div class="tw"><table>
      <thead><tr>
        <th>Collection</th>
        <th>Purpose</th>
        <th style="text-align:right">Docs</th>
      </tr></thead>
      <tbody>
        <tr>
          <td><b>${COL.EXPENSE}</b></td>
          <td class="dc">Daily expense entries</td>
          <td style="text-align:right">${expenses.length}</td>
        </tr>
        <tr>
          <td><b>${COL.CATEGORY}</b></td>
          <td class="dc">Categories</td>
          <td style="text-align:right">${categories.length}</td>
        </tr>
        <tr>
          <td><b>${COL.HISTORY}</b></td>
          <td class="dc">Audit log</td>
          <td style="text-align:right">${history.length}</td>
        </tr>
        <tr>
          <td><b>${COL.RENT}</b></td>
          <td class="dc">Room rent payments</td>
          <td style="text-align:right">${rentPayments.length}</td>
        </tr>
        <tr>
          <td><b>${COL.ELEC}</b></td>
          <td class="dc">Electricity readings</td>
          <td style="text-align:right">${elecReadings.length}</td>
        </tr>
        <tr>
          <td><b>${COL.WATER}</b></td>
          <td class="dc">Water purchases</td>
          <td style="text-align:right">${waterPurchases.length}</td>
        </tr>
        <tr>
          <td><b>${COL.WATER_PAY}</b></td>
          <td class="dc">Monthly water payment modes</td>
          <td style="text-align:right">${Object.keys(waterPayModes).length}</td>
        </tr>
      </tbody>
    </table></div>
    <p class="hint" style="margin-top:10px">
      Offline persistence is on — entries made without internet are queued locally and pushed on reconnect.
    </p>`;
}
window.saveSessionTimeout = async function(){
  const v = parseInt($('set-session-min').value);
  const res = await setSessionTimeout(v);
  if (res.ok){ toast('✅ ' + res.message, 'success'); renderSettingsUI(); }
  else toast('❌ ' + res.message, 'error');
};

window.setAutoClearHistory = async function(on){
  await saveHouseholdSettings({ autoclearHistory: on });
  renderSettingsUI();
  toast(on ? '✅ Auto-clear enabled' : 'Auto-clear disabled', 'success');
  if (on) checkAutoClearHistory();
};


/* ═══════════════════════════════════════════════════════════════
   EVENT WIRING — top-level listeners
   ═══════════════════════════════════════════════════════════════ */

// Sort column headers
document.querySelectorAll('thead th').forEach(th => {
  if (th.getAttribute('onclick')?.includes("doSort")) return;
});

// Combined report auto-refresh
// Categories tab — live search filter
['cat-search-mgr'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', () => renderCatMgr());
});

// Combined report auto-refresh
['combo-month','combo-year'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('change', () => renderCombinedReport());
});

// Overview filters
['a-year','a-month'].forEach(id => {
  const el = $(id);
  if (el){
    el.addEventListener('change', () => renderOverview());
    el.addEventListener('input',  () => renderOverview());
  }
});

// Modal click-outside to close
document.querySelectorAll('.mo').forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m) m.classList.remove('open');
  });
});

// Esc closes modals
document.addEventListener('keydown', e => {
  if (e.key === 'Escape'){
    document.querySelectorAll('.mo.open').forEach(m => m.classList.remove('open'));
  }
});


/* ═══════════════════════════════════════════════════════════════
   DAILY EXPENSE — EXPORT / IMPORT CSV
   Exclusive to the expenses collection.
   ═══════════════════════════════════════════════════════════════ */

/* Shared state for the parsed preview */
let _csvParsed = null;

window.toggleDailyImport = function(){
  const panel = $('daily-import-panel');
  const btn   = $('btn-toggle-import');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  if (btn) btn.textContent = open ? '📥 Import from Excel CSV ▾' : '📥 Import from Excel CSV ▴';
};

/* ── EXPORT ── */
window.exportDailyCSV = function(){
  const rows = expenses.filter(e => e.category !== 'No Expense');
  if (!rows.length){ toast('No daily expenses to export.', 'error'); return; }

  const headers = ['Date', 'Category', 'Amount', 'Payment Mode', 'Note', 'Record ID', 'Created At'];
  const escape = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const lines = [headers.join(',')];
  rows.forEach(e => {
    const d = e.date ? e.date.split('-').reverse().join('-') : '';   // YYYY-MM-DD → DD-MM-YYYY
    lines.push([
      d,
      e.category || '',
      Number(e.amount || 0).toFixed(2),
      e.paymentMode || '',
      e.note || '',
      e.id || '',
      e.createdAt || ''
    ].map(escape).join(','));
  });

  const csv = '\ufeff' + lines.join('\r\n');   // BOM so Excel opens it cleanly
  const name = 'daily-expense-' + localDateStr() + '.csv';
  download(name, csv, 'text/csv;charset=utf-8');

    logHistory(ACT.EXPORT, {
    kind: 'daily_csv',
    count: rows.length,
    expenses: rows.length
  });
  pill('Exported ' + rows.length + ' row(s)', '⬇️');
};

/* ── CSV PARSER (handles quoted fields, embedded commas) ── */
function parseCSV(text){
  const rows = [];
  let cur = [], field = '', inQuotes = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (inQuotes){
      if (ch === '"' && text[i+1] === '"'){ field += '"'; i++; }
      else if (ch === '"'){ inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"'){ inQuotes = true; }
      else if (ch === ','){ cur.push(field); field = ''; }
      else if (ch === '\n'){ cur.push(field); rows.push(cur); cur = []; field = ''; }
      else { field += ch; }
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/* Convert "DD-MM-YYYY" or "YYYY-MM-DD" to canonical ISO YYYY-MM-DD */
function toISO(dateStr){
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  let m;
  if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/))){
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    if (mo > 12 && d <= 12){ const t = d; d = mo; mo = t; }
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return s;
  return '';
}

function parseMonthlyExpenseCSV(rawText){
  const rows = parseCSV(rawText);
  if (rows.length < 2) throw new Error('Not enough rows');

  /* Find header row — first row containing "date" and "amount" (case-insensitive) */
  let hdrIdx = -1, colDate = -1, colCat = -1, colAmt = -1, colNote = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++){
    const lower = rows[i].map(c => String(c || '').toLowerCase().trim());
    const dIdx = lower.findIndex(c => c === 'date');
    const aIdx = lower.findIndex(c => c === 'amount');
    if (dIdx >= 0 && aIdx >= 0){
      hdrIdx = i;
      colDate = dIdx;
      colAmt  = aIdx;
      colCat  = lower.findIndex(c => c === 'purpose' || c === 'category');
      colNote = lower.findIndex(c => c === 'remarks' || c === 'note' || c === 'notes');
      break;
    }
  }
  if (hdrIdx < 0) throw new Error('Could not find a header row with "Date" and "Amount" columns.');

  const parsed = [];
  const warnings = [];
  let lastDate = '';

    /* Categories that mean "no expense this day" — case-insensitive */
  const NO_EXPENSE_NAMES = new Set([
    'no expense', 'no expenses', 'nil', 'none', 'no exp', 'na', 'n/a'
  ]);
  const isNoExpenseRow = cat => NO_EXPENSE_NAMES.has(String(cat || '').trim().toLowerCase());

  for (let i = hdrIdx + 1; i < rows.length; i++){
    const r = rows[i];
    let rawDate = (r[colDate] || '').trim();
    if (rawDate) lastDate = rawDate; else rawDate = lastDate;   // carry forward

    const iso = toISO(rawDate);
    const cat = (colCat >= 0 ? (r[colCat] || '').trim() : '');
    const amtRaw = (r[colAmt] || '').replace(/[₹,\s]/g, '');
    const amt = parseFloat(amtRaw);
    const note = (colNote >= 0 ? (r[colNote] || '').trim() : '');

    if (!iso){ warnings.push({ row: i + 1, reason: 'Bad date', raw: rawDate, cat }); continue; }

    /* "No Expense" rows: treat as marker regardless of amount/note.
       Missing category + valid date also falls through here as a No Expense marker. */
    if (isNoExpenseRow(cat)){
      parsed.push({ date: iso, category: 'No Expense', amount: 0, note, paymentMode: 'UPI' });
      continue;
    }
    if (!cat){
      parsed.push({ date: iso, category: 'No Expense', amount: 0, note: '', paymentMode: 'UPI' });
      continue;
    }

    if (isNaN(amt) || amt < 0){ warnings.push({ row: i + 1, reason: 'Bad amount', date: iso, cat }); continue; }

    parsed.push({ date: iso, category: cat, amount: amt, note, paymentMode: 'UPI' });
  }

  return { parsed, warnings };
}

/* Build summary + preview table for a parsed result */
function renderCSVPreview(parsed, warnings){
  const out = $('csv-output');
  if (!out) return;

  if (!parsed.length){
    out.innerHTML = '<div class="ibx errb">No valid rows found. See warnings below.</div>' +
      renderWarnings(warnings);
    return;
  }

  const dates = parsed.map(p => p.date).sort();
  const dateMin = dates[0], dateMax = dates[dates.length - 1];
  const cats = [...new Set(parsed.map(p => p.category))].sort();
  const catSet = new Set(categories.map(c => c.name));
  const unknown = cats.filter(c => !catSet.has(c));
  const total = parsed.reduce((s, p) => s + p.amount, 0);

  /* Duplicate detection — same date + category + amount */
  const keys = new Set(expenses.map(e => `${e.date}|${e.category}|${(+e.amount||0).toFixed(2)}`));
  const dupes = parsed.filter(p => keys.has(`${p.date}|${p.category}|${p.amount.toFixed(2)}`));
  const toImport = parsed.filter(p => !keys.has(`${p.date}|${p.category}|${p.amount.toFixed(2)}`));

  const rowLine = p => `<tr>
    <td style="padding:4px 8px">${fmtDate(p.date)}</td>
    <td style="padding:4px 8px">${esc(p.category)}</td>
    <td style="padding:4px 8px;text-align:right">₹${fmtAmt(p.amount)}</td>
    <td style="padding:4px 8px;color:var(--muted)">${esc(p.note || '—')}</td>
  </tr>`;

  out.innerHTML = `
    <div class="ibx okb">
      ✅ Parsed <b>${parsed.length}</b> valid row(s).<br>
      Date range: <b>${fmtDate(dateMin)}</b> → <b>${fmtDate(dateMax)}</b><br>
      Distinct categories: <b>${cats.length}</b><br>
      Total ₹: <b>₹${fmtAmt(total)}</b><br>
      Duplicates already in Firestore: <b>${dupes.length}</b> (will be skipped)<br>
      New rows to insert: <b>${toImport.length}</b>
      ${unknown.length ? `<br><br>⚠️ <b>Unknown categories</b> (will be created):<br>${unknown.map(c => '• ' + esc(c)).join('<br>')}` : ''}
    </div>

    <details style="margin-bottom:10px">
      <summary style="cursor:pointer;font-weight:700;padding:6px 0">First 5 parsed rows</summary>
      <div style="overflow-x:auto;margin-top:6px"><table style="width:100%;font-size:.76rem">
        <thead><tr style="background:var(--sec)"><th style="text-align:left;padding:6px 8px">Date</th><th style="text-align:left;padding:6px 8px">Category</th><th style="text-align:right;padding:6px 8px">Amount</th><th style="text-align:left;padding:6px 8px">Note</th></tr></thead>
        <tbody>${parsed.slice(0, 5).map(rowLine).join('')}</tbody>
      </table></div>
    </details>

    <details style="margin-bottom:10px">
      <summary style="cursor:pointer;font-weight:700;padding:6px 0">Last 5 parsed rows</summary>
      <div style="overflow-x:auto;margin-top:6px"><table style="width:100%;font-size:.76rem">
        <thead><tr style="background:var(--sec)"><th style="text-align:left;padding:6px 8px">Date</th><th style="text-align:left;padding:6px 8px">Category</th><th style="text-align:right;padding:6px 8px">Amount</th><th style="text-align:left;padding:6px 8px">Note</th></tr></thead>
        <tbody>${parsed.slice(-5).map(rowLine).join('')}</tbody>
      </table></div>
    </details>

    ${warnings.length ? renderWarnings(warnings) : ''}
  `;

  /* Enable import button only if there's something to import */
  const btn = $('btn-do-import');
  if (btn) btn.disabled = toImport.length === 0;
}

function renderWarnings(warnings){
  if (!warnings.length) return '';
  return `<details style="margin-top:8px">
    <summary style="cursor:pointer;font-weight:700;padding:6px 0;color:var(--warn)">
      ⚠️ ${warnings.length} row(s) skipped — click to see
    </summary>
    <div style="max-height:200px;overflow-y:auto;margin-top:6px;font-size:.74rem">
      ${warnings.slice(0, 100).map(w =>
        `<div style="padding:3px 0;color:var(--muted)">Line ${w.row}: ${esc(w.reason)} ${w.raw ? '· "' + esc(w.raw) + '"' : ''} ${w.cat ? '· ' + esc(w.cat) : ''}</div>`
      ).join('')}
      ${warnings.length > 100 ? `<div style="margin-top:6px;color:var(--muted)">…and ${warnings.length - 100} more</div>` : ''}
    </div>
  </details>`;
}

/* ── PREVIEW (dry run) ── */
window.previewDailyCSV = async function(){
  const out = $('csv-output');
  if (out) out.innerHTML = '<div class="ibx">Reading…</div>';
  _csvParsed = null;

  let text = ($('csv-paste')?.value || '').trim();

  const fileInput = $('csv-file');
  if (!text && fileInput && fileInput.files && fileInput.files[0]){
    text = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = e => resolve(e.target.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsText(fileInput.files[0], 'UTF-8');
    });
  }

  if (!text){
    if (out) out.innerHTML = '<div class="ibx warnb">Paste CSV text, or choose a file first.</div>';
    return;
  }

  try {
    const result = parseMonthlyExpenseCSV(text);
    _csvParsed = result;
    renderCSVPreview(result.parsed, result.warnings);
  } catch (e){
    if (out) out.innerHTML = '<div class="ibx errb">❌ ' + esc(e.message) + '</div>';
  }
};

/* ── IMPORT ── */
window.importDailyCSV = async function(){
  if (!_csvParsed || !_csvParsed.parsed || !_csvParsed.parsed.length){
    toast('Run the preview first.', 'error');
    return;
  }

  const keys = new Set(expenses.map(e => `${e.date}|${e.category}|${(+e.amount||0).toFixed(2)}`));
  const toImport = _csvParsed.parsed.filter(p => !keys.has(`${p.date}|${p.category}|${p.amount.toFixed(2)}`));

  if (!toImport.length){
    toast('Nothing new to import (all duplicates).', 'warning');
    return;
  }

  /* Confirm with the user */
  const unknown = [...new Set(toImport.map(p => p.category))]
    .filter(c => !categories.find(x => x.name === c));

  showConfirm(
    '📥 Confirm Import',
    `<div class="ibx warnb">
       About to insert <b>${toImport.length}</b> row(s) into <b>expenses</b> collection.<br>
       ${unknown.length ? `<br>Auto-create these <b>${unknown.length}</b> category/ies:<br>${unknown.map(c => '• ' + esc(c)).join('<br>')}` : ''}
     </div>
     <p class="hint">Only Daily Expense data is affected. Rent, electricity, water, grocery, and birthday data are not touched.</p>`,
    'Import ' + toImport.length + ' rows',
    async () => {
      const out = $('csv-output');
      setSyncStatus('saving');

      /* 1) Create any missing categories first */
      const existingCatNames = new Set(categories.map(c => c.name));
      const newCats = [...new Set(toImport.map(p => p.category))].filter(c => !existingCatNames.has(c));
      for (const name of newCats){
        try {
          await addRecord(COL.CATEGORY, { name },
            { pillMsg: 'Category "' + name + '" created', pillIcon: '🏷️' });
        } catch (e){ /* best-effort */ }
      }

      /* 2) Batch insert expenses (400 per batch) */
      let done = 0;
      const batchSize = 400;
      for (let i = 0; i < toImport.length; i += batchSize){
        const slice = toImport.slice(i, i + batchSize);
        const batch = writeBatch(db);
        slice.forEach(p => {
          const ref = doc(collection(db, COL.EXPENSE));
          batch.set(ref, {
            date:        p.date,
            amount:      p.amount,
            category:    p.category,
            note:        p.note || '',
            paymentMode: p.paymentMode || 'UPI',
            createdAt:   new Date().toISOString(),
            source:      'excel-import'
          });
        });
        await batch.commit();
        done += slice.length;
        if (out) out.innerHTML = `<div class="ibx">⏳ Imported <b>${done}</b> / ${toImport.length}…</div>`;
      }

      /* 3) Log and finish */
            await logHistory(ACT.IMPORT, {
        kind: 'daily_csv',
        count: toImport.length,
        expenses: toImport.length,
        skipped: _csvParsed.parsed.length - toImport.length,
        newCategories: newCats
      });
      setSyncStatus('live');
      pill('Imported ' + toImport.length + ' row(s)', '📥');

      if (out) out.innerHTML = `<div class="ibx okb">✅ Done — imported <b>${toImport.length}</b> row(s).
        ${newCats.length ? `<br>Created ${newCats.length} new categories.` : ''}</div>`;

      /* Reset preview state so a re-click doesn't re-import */
      _csvParsed = null;
      const btn = $('btn-do-import');
      if (btn) btn.disabled = true;
      
      // Clear cache and refresh the data
      sessionStorage.removeItem('cache_expenses');
      window.__isDataRefresh = true;
      loadExpenses();
    },
    'bp'
  );
};

/* ═══════════════════════════════════════════════════════════════
   MILK TRACKER LOGIC
   ═══════════════════════════════════════════════════════════════ */
const MILK_RATE = 100; // ₹100 per KG

// Live listener for Milk collection
subscribeCollection('milk_records', rows => {
  milkRecords = rows.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  setCounter('milk', rows.length); // Update top header badge
  if ($('tab-milk').classList.contains('active')) renderMilkTab();
  renderLastActivity(); // Update the "Last Activity" label
});

window.recalcMilk = function() {
  // Auto-calculation is disabled. Amount is now manual.
};

window.recalcMilkEdit = function() {
  // Auto-calculation is disabled. Amount is now manual.
};

window.openMilkEdit = function(id) {
  const m = milkRecords.find(x => x.id === id);
  if (!m) return;
  
  $('milk-e-id').value = m.id;
  $('milk-e-date').value = m.date;
  $('milk-e-unit').value = m.unit;
  $('milk-e-note').value = m.note || '';
  
  // Just set the amount normally, no locks or math needed
  $('milk-e-amount').value = m.amount;

  $('milk-edit-mo').classList.add('open');
};

window.updateMilk = async function() {
  const id = $('milk-e-id').value;
  const date = $('milk-e-date').value;
  const unitRaw = $('milk-e-unit').value;
  const unit = unitRaw === 'extra' ? 'extra' : parseFloat(unitRaw);
  const amount = parseFloat($('milk-e-amount').value);
  const note = $('milk-e-note').value.trim();

  if (!date) { toast('Select a date.', 'error'); return; }
  if (isNaN(amount) || amount < 0) { toast('Please enter a valid amount.', 'error'); return; }

  const res = await updateRecord('milk_records', id, 
    { date, unit, amount, note },
    { pillMsg: 'Milk record updated', pillIcon: '✏️',
      historyAction: ACT.UPDATE, historyData: { id, date, unit, amount, note } }
  );

  if (res.ok) closeMo('milk-edit-mo');
};

window.saveMilk = async function() {
  const date = $('milk-date').value;
  const unitRaw = $('milk-unit').value;
  const unit = unitRaw === 'extra' ? 'extra' : parseFloat(unitRaw);
  const amount = parseFloat($('milk-amount').value);
  const note = $('milk-note').value.trim();
  
  if (!date) { toast('Select a date.', 'error'); return; }
  if (isNaN(amount) || amount < 0) { toast('Please enter a valid amount.', 'error'); return; }

  const res = await addRecord('milk_records', 
    { date, unit, amount, note },
    { pillMsg: unit === 0 ? 'Marked as Absent' : 'Milk record saved', pillIcon: '🥛',
      historyAction: ACT.CREATE, historyData: { date, unit, amount, note } }
  );

  if (res.ok) {
    clearMilkForm();
    // Increment backup counter
    let currentCount = parseInt(localStorage.getItem('backup_entry_count') || '0');
    localStorage.setItem('backup_entry_count', (currentCount + 1).toString());
  }
};

window.clearMilkForm = function() {
  $('milk-date').value = localDateStr();
  $('milk-unit').value = '0.5'; // Resets to 500 gm
  $('milk-note').value = '';
  $('milk-amount').value = '';
  $('milk-amount').readOnly = false; // FORCE it to be editable
};

window.deleteMilk = function(id) {
  const r = milkRecords.find(x => x.id === id);
  if (!r) return;
  showConfirm('🗑️ Delete Milk Record',
    `<div class="ibx warnb">${fmtDate(r.date)} — ${r.unit} KG — ₹${fmtAmt(r.amount)}</div>`,
    'Delete',
    async () => {
      await deleteRecord('milk_records', id, {
        pillMsg: 'Record deleted', pillIcon: '🗑️',
        historyAction: ACT.DELETE, historyData: { id }
      });
    }, 'bd');
};

window.filterMilkTable = function() {
  const mFilter = $('milk-filt-month');
  const yFilter = $('milk-filt-year');
  const selM = mFilter ? mFilter.value : '';
  const selY = yFilter ? yFilter.value : '';
  
  let displayedMilk = milkRecords;
  if (selM) displayedMilk = displayedMilk.filter(m => String(m.date).startsWith(selM));
  else if (selY) displayedMilk = displayedMilk.filter(m => String(m.date).startsWith(selY));

  const badge = $('milk-badge');
  if (badge) badge.textContent = displayedMilk.length + ' entries';

  const tbody = $('milk-tbody');
  if (!tbody) return;

  if (!displayedMilk.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="es"><div class="ei">🥛</div><p>No milk records for this filter.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = displayedMilk.map(m => {
      const qtyLabel = m.unit === 'extra' ? '<span class="cb" style="background:var(--warn); color:#fff">Other</span>'
                     : +m.unit === 0 ? '<span class="cb red">Absent</span>' 
                     : +m.unit === 1 ? '1 KG' 
                     : (+m.unit * 1000) + ' gm';
                     
      return `<tr>
        <td data-label="Date" class="dc">${fmtDate(m.date)}</td>
        <td data-label="Qty">${qtyLabel}</td>
        <td data-label="Amount" class="amc">₹${fmtAmt(m.amount)}</td>
        <td data-label="Notes" class="nc">${esc(m.note || '—')}</td>
        <td data-label="Actions"><div class="ab">
          <button class="btn bo bxs" onclick="openMilkEdit('${m.id}')" type="button">✏️</button>
          <button class="btn bd bxs" onclick="deleteMilk('${m.id}')" type="button">🗑️</button>
        </div></td>
      </tr>`;
    }).join('');
  }
};

function renderMilkTab() {
  if (!$('milk-date').value) $('milk-date').value = localDateStr();
  // recalcMilk(); // Disabled

  // 1. Update Stat Cards
  const todayStr = localDateStr();
  const curYM = todayStr.slice(0, 7);
  const curY = todayStr.slice(0, 4);

  const monthRows = milkRecords.filter(m => String(m.date).startsWith(curYM));
  const monthAmt = monthRows.reduce((s, m) => s + (+m.amount || 0), 0);
  const monthQty = monthRows.reduce((s, m) => s + (+m.unit || 0), 0);
  const monthAbsent = monthRows.filter(m => +m.unit === 0).length;
  const totalAmt = milkRecords.reduce((s, m) => s + (+m.amount || 0), 0);
  const totalQty = milkRecords.reduce((s, m) => s + (+m.unit || 0), 0);

  $('milk-month-amt').textContent = '₹' + fmtAmt(monthAmt);
  $('milk-month-qty').textContent = fmtAmt(monthQty) + ' kg';
  $('milk-month-days').textContent = monthRows.length;
  $('milk-month-absent').textContent = monthAbsent + ' absent days';
  $('milk-total-amt').textContent = '₹' + fmtAmt(totalAmt);
  $('milk-total-qty').textContent = fmtAmt(totalQty) + ' kg';
  $('milk-rec-count').textContent = milkRecords.length + ' records';

  // 2. Populate Filters
  const mFilter = $('milk-filt-month');
  const yFilter = $('milk-filt-year');
  if (mFilter && yFilter) {
    const prevM = mFilter.value;
    const prevY = yFilter.value;
    const months = new Set();
    const years = new Set();
    milkRecords.forEach(m => {
      if (m.date) {
        months.add(m.date.slice(0, 7));
        years.add(m.date.slice(0, 4));
      }
    });
    
    mFilter.innerHTML = '<option value="">All Months</option>' + [...months].sort().reverse().map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
    yFilter.innerHTML = '<option value="">All Years</option>' + [...years].sort().reverse().map(y => `<option value="${y}">${y}</option>`).join('');
    
    if (months.has(prevM)) mFilter.value = prevM;
    if (years.has(prevY)) yFilter.value = prevY;
  }

  // 3. Render Table, Calendar, & Reports
  filterMilkTable();
  renderMilkCalendar();
  populateMilkReportYears();
  onMilkYearChange();
  renderMilkPayList();
}

function populateMilkReportYears() {
  const ySel = $('milk-rep-year');
  if (!ySel) return;
  const yrs = [...new Set(milkRecords.map(m => String(m.date).slice(0,4)))].sort((a,b) => b - a);
  const cur = String(new Date().getFullYear());
  if (!yrs.includes(cur)) yrs.unshift(cur);
  const v = ySel.value;
  ySel.innerHTML = yrs.map(y => `<option value="${y}">${y}</option>`).join('');
  ySel.value = yrs.includes(v) ? v : cur;
}

window.onMilkYearChange = function() {
  const y = $('milk-rep-year').value;
  const mSel = $('milk-rep-month');
  const months = [...new Set(milkRecords.filter(m => String(m.date).startsWith(y)).map(m => String(m.date).slice(0,7)))].sort();
  const v = mSel.value;
  mSel.innerHTML = '<option value="">Whole Year</option>' + months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  mSel.value = months.includes(v) ? v : '';
  renderMilkReport();
};

window.renderMilkReport = function() {
  const y = $('milk-rep-year').value;
  const m = $('milk-rep-month').value;
  if (!y) { 
    $('milk-report-body-desktop').innerHTML = ''; 
    $('milk-report-body-mobile').innerHTML = ''; 
    return; 
  }

  // If a specific month is selected
  if (m) {
    const rows = milkRecords.filter(x => String(x.date).startsWith(m));
    
    if (!rows.length) {
      const empty = `<div class="es"><div class="ei">🥛</div><p>No milk records for ${monthLabel(m)}.</p></div>`;
      $('milk-report-body-desktop').innerHTML = empty;
      $('milk-report-body-mobile').innerHTML = empty;
      return;
    }

    const amt = rows.reduce((s,x) => s + (+x.amount || 0), 0);
    const qty = rows.reduce((s,x) => s + (+x.unit || 0), 0);
    const absent = rows.filter(x => +x.unit === 0).length;

    // 1. Desktop Table View
    const desktopHtml = `<div style="font-size:.85rem;color:var(--muted);margin-bottom:10px">
      ${rows.length} days recorded · Total: <strong>₹${fmtAmt(amt)}</strong> (${fmtAmt(qty)} kg · ${absent} absent days)
    </div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead><tr style="border-bottom:2px solid var(--bdr)">
        <th style="text-align:left;padding:6px 8px;color:var(--muted)">Date</th>
        <th style="text-align:right;padding:6px 8px;color:var(--muted)">Quantity</th>
        <th style="text-align:right;padding:6px 8px;color:var(--muted)">Amount</th>
      </tr></thead><tbody>
      ${rows.map(x => `<tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:6px 8px">${fmtDate(x.date)}</td>
        <td style="text-align:right;padding:6px 8px">${x.unit === 'extra' ? 'Other' : +x.unit === 0 ? 'Absent' : x.unit + ' KG'}</td>
        <td style="text-align:right;padding:6px 8px;font-weight:700;color:var(--p)">₹${fmtAmt(x.amount)}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="border-top:2px solid var(--p)">
        <td style="padding:7px 8px;font-weight:800">TOTAL</td>
        <td style="text-align:right;padding:7px 8px;font-weight:800">${fmtAmt(qty)} kg</td>
        <td style="text-align:right;padding:7px 8px;font-weight:800;color:var(--p)">₹${fmtAmt(amt)}</td>
      </tr></tfoot>
    </table></div>`;

    // 2. Mobile Card View
    const mobileHtml = `
      <div style="background:var(--pl); padding:12px; border-radius:8px; margin-bottom:12px; border:1px solid var(--p);">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <b style="color:var(--p)">Total Bill:</b>
          <b style="color:var(--p)">₹${fmtAmt(amt)}</b>
        </div>
        <div style="font-size:.75rem; color:var(--muted); display:flex; justify-content:space-between;">
          <span>${fmtAmt(qty)} kg · ${rows.length} days</span>
          <span>${absent} absent</span>
        </div>
      </div>
      ${rows.map(x => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--bdr);">
          <div>
            <div style="font-weight:700; color:var(--txt); font-size:.85rem;">${fmtDate(x.date)}</div>
            <div style="font-size:.75rem; color:var(--muted);">${x.unit === 'extra' ? 'Other' : +x.unit === 0 ? 'Absent' : x.unit + ' KG'}</div>
          </div>
          <div style="font-weight:800; color:var(--p);">₹${fmtAmt(x.amount)}</div>
        </div>
      `).join('')}
    `;

    $('milk-report-body-desktop').innerHTML = desktopHtml;
    $('milk-report-body-mobile').innerHTML = mobileHtml;
    return;
  }

  // If "Whole Year" is selected
  const rows = milkRecords.filter(x => String(x.date).startsWith(y));
  const byMonth = {};
  
  rows.forEach(x => {
    const mm = String(x.date).slice(0,7);
    if (!byMonth[mm]) byMonth[mm] = { amt: 0, qty: 0, absent: 0, cnt: 0 };
    byMonth[mm].amt += (+x.amount || 0);
    byMonth[mm].qty += (+x.unit || 0);
    if (+x.unit === 0) byMonth[mm].absent++;
    byMonth[mm].cnt++;
  });
  const months = Object.keys(byMonth).sort();
  const totalAmt = rows.reduce((s,x) => s + (+x.amount || 0), 0);
  const totalQty = rows.reduce((s,x) => s + (+x.unit || 0), 0);

  if (!months.length) { body.innerHTML = `<div class="es"><div class="ei">🥛</div><p>No milk records for ${y}.</p></div>`; return; }

  // --- DESKTOP TABLE ---
  const desktopEl = $('milk-report-body-desktop');
  if (desktopEl) {
    desktopEl.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
      <thead><tr style="border-bottom:2px solid var(--bdr)">
        <th style="text-align:left;padding:6px 8px;color:var(--muted)">Month</th>
        <th style="text-align:right;padding:6px 8px;color:var(--muted)">Days</th>
        <th style="text-align:right;padding:6px 8px;color:var(--muted)">Absent</th>
        <th style="text-align:right;padding:6px 8px;color:var(--muted)">Qty</th>
        <th style="text-align:right;padding:6px 8px;color:var(--muted)">Amount</th>
      </tr></thead><tbody>
      ${months.map(mm => `<tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:6px 8px;font-weight:600">${monthLabel(mm)}</td>
        <td style="text-align:right;padding:6px 8px">${byMonth[mm].cnt}</td>
        <td style="text-align:right;padding:6px 8px">${byMonth[mm].absent}</td>
        <td style="text-align:right;padding:6px 8px">${fmtAmt(byMonth[mm].qty)} kg</td>
        <td style="text-align:right;padding:6px 8px;font-weight:700;color:var(--p)">₹${fmtAmt(byMonth[mm].amt)}</td>
      </tr>`).join('')}
      </tbody>
      <tfoot><tr style="border-top:2px solid var(--p)">
        <td style="padding:7px 8px;font-weight:800">TOTAL</td>
        <td style="text-align:right;padding:7px 8px;font-weight:800">${rows.length}</td>
        <td style="text-align:right;padding:7px 8px;font-weight:800">${rows.filter(x => +x.unit === 0).length}</td>
        <td style="text-align:right;padding:7px 8px;font-weight:800">${fmtAmt(totalQty)} kg</td>
        <td style="text-align:right;padding:7px 8px;font-weight:800;color:var(--p)">₹${fmtAmt(totalAmt)}</td>
      </tr></tfoot>
    </table></div>`;
  }

  // --- MOBILE CARDS ---
  const mobileEl = $('milk-report-body-mobile');
  if (mobileEl) {
    mobileEl.innerHTML = months.map(mm => `
      <div style="background:var(--sec); padding:12px; border-radius:8px; margin-bottom:10px; border:1px solid var(--bdr);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <b style="font-size:.9rem; color:var(--p);">${monthLabel(mm)}</b>
          <span style="font-weight:800; color:var(--p);">₹${fmtAmt(byMonth[mm].amt)}</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:.75rem; color:var(--muted);">
          <div>Days: <b style="color:var(--txt)">${byMonth[mm].cnt}</b></div>
          <div>Absent: <b style="color:var(--err)">${byMonth[mm].absent}</b></div>
          <div>Qty: <b style="color:var(--txt)">${fmtAmt(byMonth[mm].qty)} kg</b></div>
        </div>
      </div>
    `).join('') + `
      <div style="background:var(--pl); padding:12px; border-radius:8px; margin-top:16px; border:1px solid var(--p);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <b style="font-size:.9rem; color:var(--p);">TOTAL (${y})</b>
          <span style="font-weight:800; color:var(--p);">₹${fmtAmt(totalAmt)}</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:.75rem; color:var(--muted);">
          <div>Total Days: <b style="color:var(--txt)">${rows.length}</b></div>
          <div>Total Absent: <b style="color:var(--err)">${rows.filter(x => +x.unit === 0).length}</b></div>
          <div>Total Qty: <b style="color:var(--txt)">${fmtAmt(totalQty)} kg</b></div>
        </div>
      </div>
    `;
  }
};

window.printMilkReport = function() {
  const y = $('milk-rep-year').value;
  const m = $('milk-rep-month').value;
  if (!y) { toast('Select a year first.', 'error'); return; }

  const rows = milkRecords.filter(x => m ? String(x.date).startsWith(m) : String(x.date).startsWith(y));
  if (!rows.length) { toast('No data to print.', 'error'); return; }

  const amt = rows.reduce((s,x) => s + (+x.amount || 0), 0);
  const qty = rows.reduce((s,x) => s + (+x.unit || 0), 0);
  const period = m ? monthLabel(m) : y;

  let payInfo = '';
  if (m && milkPayModes[m]) {
    payInfo = `<div style="margin-top:10px; font-size:.9rem; color:#333;">
      <strong>Paid Via:</strong> ${esc(milkPayModes[m])} 
      ${milkPayDates[m] ? `&nbsp;·&nbsp; <strong>Paid On:</strong> ${fmtDate(milkPayDates[m])}` : ''}
    </div>`;
  } else if (!m) {
    // If printing whole year, grab the latest payment mode/date
    const modes = Object.keys(milkPayModes).filter(k => k.startsWith(y)).map(k => milkPayModes[k]);
    const dates = Object.keys(milkPayDates).filter(k => k.startsWith(y)).map(k => milkPayDates[k]).sort();
    if (modes.length) {
      payInfo = `<div style="margin-top:10px; font-size:.9rem; color:#333;">
        <strong>Paid Via:</strong> ${esc(modes[modes.length - 1])} 
        ${dates.length ? `&nbsp;·&nbsp; <strong>Paid On:</strong> ${fmtDate(dates[dates.length - 1])}` : ''}
      </div>`;
    }
  }

  const body = printLetterhead('🥛 Milk Bill — ' + period) +
    `<table style="width:100%;border-collapse:collapse;font-size:.9rem">
      <thead><tr style="background:#f7f7f9">
        <th style="text-align:left;padding:8px 10px">Date</th>
        <th style="text-align:right;padding:8px 10px">Quantity</th>
        <th style="text-align:right;padding:8px 10px">Amount</th>
      </tr></thead><tbody>
      ${rows.map(x => `<tr>
        <td style="padding:8px 10px">${fmtDate(x.date)}</td>
        <td style="text-align:right;padding:8px 10px">${+x.unit === 0 ? 'Absent' : x.unit + ' KG'}</td>
        <td style="text-align:right;padding:8px 10px">₹${fmtAmt(x.amount)}</td>
      </tr>`).join('')}
      </tbody></table>
    <div style="margin-top:16px;font-weight:800;font-size:1.1rem">
      TOTAL DUE: ₹${fmtAmt(amt)} <span style="font-weight:400;font-size:.85rem;color:#555">(${fmtAmt(qty)} kg total)</span>
    ${payInfo}`;
openPrintWindow('Milk Bill - ' + period, body);
};

/* ═══════════════════════════════════════════════════════════════
   MILK PAYMENT MODES
   ═══════════════════════════════════════════════════════════════ */
let milkPayModes = {};
let milkPayDates = {};

// Listen to the payment modes collection
subscribeCollection('milk_payment_modes', rows => {
  milkPayModes = {};
  milkPayDates = {};
  rows.forEach(r => {
    milkPayModes[r.id] = r.mode;
    if (r.paidOn) milkPayDates[r.id] = r.paidOn;
  });
  if ($('tab-milk')?.classList.contains('active')) renderMilkPayList();
});

function renderMilkPayList() {
  const el = $('milk-pay-list');
  if (!el) return;
  
  // Find all unique months that have milk records
  const byMonth = {};
  milkRecords.forEach(m => {
    const mm = String(m.date).slice(0,7);
    if (!byMonth[mm]) byMonth[mm] = { cnt: 0 };
    byMonth[mm].cnt++;
  });
  
  const months = Object.keys(byMonth).sort((a,b) => b.localeCompare(a));
  
  if (!months.length) {
    el.innerHTML = `<div class="es" style="padding:20px"><div class="ei">🥛</div><p>No milk records yet.</p></div>`;
    return;
  }

  el.innerHTML = months.map(m => {
    const mode = milkPayModes[m] || '';
    const paidOn = milkPayDates[m] || '';
    const days = byMonth[m].cnt;
    return `<div class="wpm-row">
      <span class="wpm-month">${monthLabel(m)}</span>
      <span class="wpm-cans">${days} days</span>
      <div class="wpm-mode-wrap">
        <select class="fc2" id="mpm-${m}" style="width:auto;padding:6px 10px;font-size:.78rem">
          <option value="">— Select —</option>
          <option value="UPI" ${mode==='UPI'?'selected':''}>UPI</option>
          <option value="Cash" ${mode==='Cash'?'selected':''}>Cash</option>
          <option value="Bank Transfer" ${mode==='Bank Transfer'?'selected':''}>Bank Transfer</option>
        </select>
        <input type="date" class="fc2" id="mpd-${m}" value="${paidOn}" style="width:auto;padding:6px 10px;font-size:.78rem"/>
        <button class="btn bp bxs" onclick="saveMilkPayMode('${m}')" type="button">💾 Save</button>
        ${mode ? pmBadge(mode) : '<span class="wpm-hint">not set</span>'}
        ${paidOn ? `<span class="wpm-hint">· paid ${fmtDate(paidOn)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

window.saveMilkPayMode = async function(month) {
  const sel = $('mpm-' + month);
  const dateEl = $('mpd-' + month);
  const mode = sel ? sel.value : '';
  const paidOn = dateEl ? dateEl.value : '';
  
  if (!mode) { toast('Select UPI, Cash or Bank Transfer first.', 'error'); return; }
  
  await setRecord('milk_payment_modes', month, 
    { mode, paidOn: paidOn || '', updatedAt: new Date().toISOString() },
    { pillMsg: 'Payment info saved for ' + monthLabel(month), pillIcon: '💳' }
  );
};

/* ═══════════════════════════════════════════════════════════════
   AUTO-CLEAR HISTORY CHECK (every page load)
   ═══════════════════════════════════════════════════════════════ */
setTimeout(() => {
  if (!isLoggedIn()) return;
  checkAutoClearHistory();
}, 3000); // 3-second delay to let the page settle before checking


/* ═══════════════════════════════════════════════════════════════
   END OF PAGE SCRIPT
   ═══════════════════════════════════════════════════════════════ */
window.openUnusedModal = function() {
  const used = new Set(expenses.map(e => e.category));
  const unusedList = categories.filter(c => !used.has(c.name)).sort((a,b) => a.name.localeCompare(b.name));
  
  const listEl = $('unused-cat-list');
  
  if (!unusedList.length) {
    listEl.innerHTML = '<div class="es" style="padding:10px">🎉 No unused categories found!</div>';
  } else {
    listEl.innerHTML = unusedList.map(cat => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--sec); border:1px solid var(--bdr); border-radius:var(--rxs);">
        <span style="font-weight:600; font-size:0.85rem;">${esc(cat.name)}</span>
        <button class="btn bd bxs" onclick="promptDeleteCat('${escQ(cat.id)}', '${escQ(cat.name)}')" type="button">Delete</button>
      </div>
    `).join('');
  }
  
  $('unused-cat-mo').classList.add('open');
};
window.renderGroupAnalytics = function() {
  const yr = $('grp-year')?.value || '';
  const mon = $('grp-month')?.value || '';

  // 1. Filter expenses by the selected period
  const data = expenses.filter(e => {
    if (e.category === 'No Expense') return false;
    const d = new Date(e.date + 'T00:00:00');
    if (yr && d.getFullYear() !== parseInt(yr)) return false;
    if (mon && d.getMonth() + 1 !== parseInt(mon)) return false;
    return true;
  });

  // 2. Group the totals using the global CAT_GROUPS logic
  const groupTotals = {};
  let grandTotal = 0;

  data.forEach(e => {
    const amt = +e.amount || 0;
    const grp = getCatGroup(e.category); // This looks at the prefix (Home, Saif, etc)
    
        if (!groupTotals[grp.key]) {
      // We store the prefix (e.g. "Home") so we can match it later
      groupTotals[grp.key] = { 
        label: grp.label, 
        color: grp.color, 
        amount: 0, 
        count: 0,
        prefix: grp.prefixes[0] // Grabs the first prefix, e.g. "Home"
      };
    }
    groupTotals[grp.key].amount += amt;
    groupTotals[grp.key].count++;
    grandTotal += amt;
  });

  // 3. Sort groups by highest spend
  const sortedGroups = Object.values(groupTotals).sort((a,b) => b.amount - a.amount);

  // 4. Render the Bento Cards
  const cardsEl = $('grp-cards');
  if (cardsEl) {
    if (!sortedGroups.length) {
      cardsEl.innerHTML = '<div class="es">No expenses found for this period.</div>';
    } else {
            const totalRecords = sortedGroups.reduce((s, g) => s + g.count, 0);
      
      // The new "Grand Total" card at the front
      const totalCardHTML = `
        <div class="sc" style="border-top-color: var(--txt); background: linear-gradient(135deg, var(--card), var(--sec));">
          <div class="lbl">💰 TOTAL EXPENSE</div>
          <div class="amt" style="color: var(--p); -webkit-text-fill-color: var(--p);">₹${fmtAmt(grandTotal)}</div>
          <div class="sub">${totalRecords} records · 100% of total</div>
        </div>
      `;

                             const groupCardsHTML = sortedGroups.map(g => `
        <div class="sc clickable-cstat" 
             data-prefix="${g.prefix}" 
             data-glabel="${escQ(g.label)}" 
             style="border-top-color: ${g.color}" 
             title="Click to see top expenses">
          <div class="lbl">${g.label}</div>
          <div class="amt">₹${fmtAmt(g.amount)}</div>
          <div class="sub">${g.count} records · ${((g.amount / grandTotal) * 100).toFixed(1)}% of total</div>
        </div>
      `).join('');

      cardsEl.innerHTML = totalCardHTML + groupCardsHTML;
    }
  }

  // 5. Render the Progress Bars
  const barsEl = $('grp-bars');
  if (barsEl) {
    barsEl.innerHTML = bars(
      sortedGroups.map(g => ({
        label: g.label,
        value: g.amount,
        sub: `₹${fmtAmt(g.amount)}`
      })),
      v => '₹' + fmt0(v)
    );
  }
};
document.addEventListener('click', (e) => {
  const card = e.target.closest('.clickable-cstat[data-prefix]');
  if (card) {
    const prefix = card.dataset.prefix;
    const label = card.dataset.glabel;
    openTopExpensesModal(prefix, label);
  }
});
window.openTopExpensesModal = function(prefix, groupLabel) {
  const yr = $('grp-year')?.value || '';
  const mon = $('grp-month')?.value || '';
  
  console.log("Looking for categories starting with:", prefix);

  const data = expenses.filter(e => {
    if (e.category === 'No Expense') return false;
    
    // Check if the category starts with the prefix (e.g., "Home" matches "Home Rent")
    if (!e.category.startsWith(prefix)) return false;
    
    const d = new Date(e.date + 'T00:00:00');
    if (yr && d.getFullYear() !== parseInt(yr)) return false;
    if (mon && d.getMonth() + 1 !== parseInt(mon)) return false;
    
    return true;
  });
  
  console.log("Records found:", data.length);

    // 3. Sort descending by amount
  const allRecords = data.sort((a,b) => (+b.amount || 0) - (+a.amount || 0));

  // 4. Update the Modal UI
  const periodStr = (mon ? MS[parseInt(mon)] + ' ' : '') + (yr || 'All Time');
  $('top-exp-title').textContent = `Expenses — ${groupLabel}`;
  $('top-exp-subtitle').textContent = `All records for ${groupLabel} in ${periodStr}, sorted highest to lowest.`;
  
    const tbody = $('top-exp-tbody');
  if (!allRecords.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="es">No records found for this group in this period.</td></tr>`;
  } else {
    tbody.innerHTML = allRecords.map((e, i) => `
      <tr>
        <td data-label="Date" class="dc">${fmtDate(e.date)}</td>
        <td data-label="Category"><span class="cb">${esc(e.category)}</span></td>
        <td data-label="Amount" class="amc">₹${fmtAmt(e.amount)}</td>
        <td data-label="Note" class="nc">${esc(e.note || '—')}</td>
      </tr>
    `).join('');
  }

  // 5. Show it
  $('top-exp-mo').classList.add('open');
};

/* ═══════════════════════════════════════════════════════════════
   WATER & MILK CALENDAR LOGIC (FINAL FIX)
   ═══════════════════════════════════════════════════════════════ */

let waterCalYear = new Date().getFullYear();
let waterCalMonth = new Date().getMonth();

let milkCalYear = new Date().getFullYear();
let milkCalMonth = new Date().getMonth();

function buildCalendarSelectors(mSelId, ySelId, currentMonth, currentYear, recordsArray) {
  const mSel = $(mSelId), ySel = $(ySelId);
  if (!mSel || !ySel) return;
  
  // 1. Find unique Year-Month pairs (e.g., "2026-09", "2026-11") from the SPECIFIC array passed in
  const uniqueMonths = new Set();
  if (recordsArray) {
    recordsArray.forEach(r => {
      const dateStr = r.date || r.month;
      if (dateStr && dateStr.length >= 7) {
        uniqueMonths.add(dateStr.slice(0, 7)); 
      }
    });
  }

  // 2. Fallback if database is empty
  if (uniqueMonths.size === 0) {
    const now = new Date();
    uniqueMonths.add(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  }

  const sortedPairs = Array.from(uniqueMonths).sort().reverse();
  
  const years = new Set();
  const months = new Set();
  sortedPairs.forEach(pair => {
    years.add(pair.slice(0, 4));
    months.add(parseInt(pair.slice(5, 7)) - 1);
  });

  // 3. Always rebuild the dropdowns based on data
  ySel.innerHTML = Array.from(years).map(y => `<option value="${y}">${y}</option>`).join('');
  mSel.innerHTML = Array.from(months).sort((a,b) => a-b).map(m => `<option value="${m}">${CAL_MONTHS[m]}</option>`).join('');
  
  // 4. Set the selected value
  if (Array.from(mSel.options).some(o => parseInt(o.value) === currentMonth)) {
    mSel.value = currentMonth;
  } else if (mSel.options.length > 0) {
    mSel.value = mSel.options[0].value;
  }

  if (Array.from(ySel.options).some(o => parseInt(o.value) === currentYear)) {
    ySel.value = currentYear;
  } else if (ySel.options.length > 0) {
    ySel.value = ySel.options[0].value;
  }
}

function renderWaterCalendar(){
  const grid = $('water-cal-grid');
  if(!grid) return;

 buildCalendarSelectors('water-cal-sel-month', 'water-cal-sel-year', waterCalMonth, waterCalYear, waterPurchases);

  const firstDow = new Date(waterCalYear, waterCalMonth, 1).getDay();
  const daysInMonth = new Date(waterCalYear, waterCalMonth + 1, 0).getDate();
  const todayStr = localDateStr();

  let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-day empty"></div>`;

  let monthTotalCans = 0;
  let monthTotalAmt = 0;

  for (let day = 1; day <= daysInMonth; day++){
    const dateStr = `${waterCalYear}-${String(waterCalMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayPurchases = waterPurchases.filter(w => w.date === dateStr);
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    
    const cans = dayPurchases.length;
    const amt = dayPurchases.reduce((s,w) => s + (+w.amount || 0), 0);
    monthTotalCans += cans;
    monthTotalAmt += amt;

    html += `<div class="cal-day${isToday?' cd-today':''}${isFuture?' cd-future':''}" onclick="waterCalDayClick('${dateStr}')">
      <div class="cd-num">${day}</div>
      ${!isFuture && cans > 0 ? `<div class="cd-count">💧 ${cans} can${cans>1?'s':''}</div><div class="cd-amt">₹${fmtAmt(amt)}</div>` : ''}
    </div>`;
  }
  grid.innerHTML = html;

  const totalEl = $('water-cal-total');
  if(totalEl) totalEl.textContent = monthTotalCans ? `${monthTotalCans} cans · ₹${fmtAmt(monthTotalAmt)}` : 'No records';
}

function renderMilkCalendar(){
  const grid = $('milk-cal-grid');
  if(!grid) return;

buildCalendarSelectors('milk-cal-sel-month', 'milk-cal-sel-year', milkCalMonth, milkCalYear, milkRecords);

  const firstDow = new Date(milkCalYear, milkCalMonth, 1).getDay();
  const daysInMonth = new Date(milkCalYear, milkCalMonth + 1, 0).getDate();
  const todayStr = localDateStr();

  let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-day empty"></div>`;

  let monthTotalAmt = 0;
  let monthAbsent = 0;

  for (let day = 1; day <= daysInMonth; day++){
    const dateStr = `${milkCalYear}-${String(milkCalMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayRecord = milkRecords.find(m => m.date === dateStr);
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    
    let display = '';
    if (dayRecord) {
      if (+dayRecord.unit === 0) {
        display = `<div class="cd-count" style="color:var(--err)">Absent</div>`;
        monthAbsent++;
      } else {
        display = `<div class="cd-count" style="color:var(--p)">🥛 ${dayRecord.unit} kg</div><div class="cd-amt">₹${fmtAmt(dayRecord.amount)}</div>`;
        monthTotalAmt += (+dayRecord.amount || 0);
      }
    }

    html += `<div class="cal-day${isToday?' cd-today':''}${isFuture?' cd-future':''}" onclick="milkCalDayClick('${dateStr}')">
      <div class="cd-num">${day}</div>
      ${!isFuture ? display : ''}
    </div>`;
  }
  grid.innerHTML = html;

  const totalEl = $('milk-cal-total');
  if(totalEl) totalEl.textContent = (monthTotalAmt || monthAbsent) ? `₹${fmtAmt(monthTotalAmt)} · ${monthAbsent} absent` : 'No records';
}

window.waterCalSelChange = function() {
  waterCalMonth = parseInt($('water-cal-sel-month').value);
  waterCalYear = parseInt($('water-cal-sel-year').value);
  renderWaterCalendar();
};
window.changeWaterCalMonth = function(delta) {
  waterCalMonth += delta;
  if (waterCalMonth < 0) { waterCalMonth = 11; waterCalYear--; }
  if (waterCalMonth > 11) { waterCalMonth = 0; waterCalYear++; }
  renderWaterCalendar();
};
window.jumpWaterCalToday = function() {
  const now = new Date();
  waterCalYear = now.getFullYear();
  waterCalMonth = now.getMonth();
  renderWaterCalendar();
};
window.waterCalDayClick = function(dateStr) {
  if (dateStr > localDateStr()) return;
  
  // ONLY show a toast. Do NOT overwrite the Add form date.
  toast(`📅 Record for ${dateStr}`, 'info');
};

window.milkCalSelChange = function() {
  milkCalMonth = parseInt($('milk-cal-sel-month').value);
  milkCalYear = parseInt($('milk-cal-sel-year').value);
  renderMilkCalendar();
};
window.changeMilkCalMonth = function(delta) {
  milkCalMonth += delta;
  if (milkCalMonth < 0) { milkCalMonth = 11; milkCalYear--; }
  if (milkCalMonth > 11) { milkCalMonth = 0; milkCalYear++; }
  renderMilkCalendar();
};
window.jumpMilkCalToday = function() {
  const now = new Date();
  milkCalYear = now.getFullYear();
  milkCalMonth = now.getMonth();
  renderMilkCalendar();
};
window.milkCalDayClick = function(dateStr) {
  if (dateStr > localDateStr()) return;
  
  // ONLY show a toast. Do NOT overwrite the Add form date.
  toast(`📅 Record for ${dateStr}`, 'info');
};

// Ensure they render when the tabs are opened or data changes
const originalRenderWaterTab = window.renderWaterTab || function(){};
window.renderWaterTab = function() {
  originalRenderWaterTab();
  renderWaterCalendar();
};

const originalRenderMilkTab = window.renderMilkTab || function(){};
window.renderMilkTab = function() {
  originalRenderMilkTab();
  renderMilkCalendar();
};

// Direct hook into the Tab Switcher to guarantee first-load rendering
const originalOnTabChange = window.__onTabChange || function(){};
window.__onTabChange = function(tabId) {
  originalOnTabChange(tabId);
  if (tabId === 'water') renderWaterCalendar();
  if (tabId === 'milk') renderMilkCalendar();
};
/* ═══════════════════════════════════════════════════════════════
   MASTER EXPAND / COLLAPSE SWITCHES (Water & Milk)
   ═══════════════════════════════════════════════════════════════ */
window.toggleAllWaterDetails = function() {
  const details = document.querySelectorAll('#tab-water details.fc');
  const btn = document.getElementById('btn-toggle-water');
  
  // Check if ANY are currently closed
  const anyClosed = Array.from(details).some(d => !d.open);
  
  details.forEach(d => {
    if (anyClosed) d.setAttribute('open', ''); // Expand all
    else d.removeAttribute('open');            // Collapse all
  });
  
  btn.innerHTML = anyClosed ? '⬆️ Collapse All' : '⬇️ Expand All';
};

window.toggleAllMilkDetails = function() {
  const details = document.querySelectorAll('#tab-milk details.fc');
  const btn = document.getElementById('btn-toggle-milk');
  
  // Check if ANY are currently closed
  const anyClosed = Array.from(details).some(d => !d.open);
  
  details.forEach(d => {
    if (anyClosed) d.setAttribute('open', ''); // Expand all
    else d.removeAttribute('open');            // Collapse all
  });
  
  btn.innerHTML = anyClosed ? '⬆️ Collapse All' : '⬇️ Expand All';
};
window.toggleAllElecDetails = function() {
  const details = document.querySelectorAll('#tab-electricity details.fc');
  const btn = document.getElementById('btn-toggle-elec');
  const anyClosed = Array.from(details).some(d => !d.open);
  
  details.forEach(d => {
    if (anyClosed) d.setAttribute('open', '');
    else d.removeAttribute('open');
  });
  
  btn.innerHTML = anyClosed ? '⬆️ Collapse All' : '⬇️ Expand All';
};
window.toggleAllRentDetails = function() {
  const details = document.querySelectorAll('#tab-rent details.fc');
  const btn = document.getElementById('btn-toggle-rent');
  const anyClosed = Array.from(details).some(d => !d.open);
  
  details.forEach(d => {
    if (anyClosed) d.setAttribute('open', '');
    else d.removeAttribute('open');
  });
  
  btn.innerHTML = anyClosed ? '⬆️ Collapse All' : '⬇️ Expand All';
};
window.toggleAllRecordsDetails = function() {
  const details = document.querySelectorAll('#tab-records details.fc');
  const btn = document.getElementById('btn-toggle-records');
  const anyClosed = Array.from(details).some(d => !d.open);
  
  details.forEach(d => {
    if (anyClosed) d.setAttribute('open', '');
    else d.removeAttribute('open');
  });
  
  btn.innerHTML = anyClosed ? '⬆️ Collapse All' : '⬇️ Expand All';
};

window.toggleMobileMenu = function() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  
  if (sidebar && backdrop) {
    sidebar.classList.toggle('mobile-open');
    backdrop.classList.toggle('show');
  }
};
// Automatically close the menu when any link or button inside it is clicked
document.addEventListener('DOMContentLoaded', () => {
  const menuLinks = document.querySelectorAll('.side-nav .tb, .side-nav a');
  
  menuLinks.forEach(link => {
    link.addEventListener('click', () => {
      // Only trigger the close action if we are on a mobile screen (<= 900px)
      if (window.innerWidth <= 900) {
        const sidebar = document.querySelector('.sidebar');
        const backdrop = document.getElementById('mobile-backdrop');
        
        if (sidebar && sidebar.classList.contains('mobile-open')) {
          sidebar.classList.remove('mobile-open');
          backdrop.classList.remove('show');
        }
      }
    });
  });
});
// Live timer tick every 1 minute
setInterval(() => {
  const timerEl = $('stat-sync-timer');
  if (timerEl && timerEl.textContent !== 'Expired (Ready to Sync)' && timerEl.textContent !== 'Not Synced Yet' && timerEl.textContent !== 'Calculating...') {
    const cacheTime = parseInt(localStorage.getItem('cache_expenses_time') || '0');
    if (cacheTime > 0) {
      const msLeft = (24 * 60 * 60 * 1000) - (Date.now() - cacheTime);
      if (msLeft > 0) {
        const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
        const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
        timerEl.textContent = `${hoursLeft}h ${minsLeft}m`;
      } else {
        timerEl.textContent = 'Expired (Ready to Sync)';
      }
    }
  }
}, 60000);

/* ═══════════════════════════════════════════════════════════════
   EXPOSE FUNCTIONS TO THE GLOBAL WINDOW (For HTML onclicks)
   ═══════════════════════════════════════════════════════════════ */
window.switchTab = switchTab;
window.saveExp = saveExp;
window.clearForm = clearForm;
window.openEditMo = openEditMo;
window.updateExp = updateExp;
window.deleteExp = deleteExp;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.doSort = doSort;
window.renderOverview = renderOverview;
window.renderMonthWise = renderMonthWise;
window.renderDateRange = renderDateRange;
window.renderCompare3 = renderCompare3;
window.renderCatMon = renderCatMon;
window.renderGroupAnalytics = renderGroupAnalytics;
window.openUnusedModal = openUnusedModal;
window.toggleMobileMenu = toggleMobileMenu;
window.toggleAllRecordsDetails = toggleAllRecordsDetails;

// Expose theme functions so the inline onclick in index.html works
window.setThemeMode = setThemeMode;
window.setPalette = setPalette;

/* ═══════════════════════════════════════════════════════════════
   FULL SYSTEM EXPORT (JSON & CSV)
   ═══════════════════════════════════════════════════════════════ */

window.exportFullSystemJSON = function() {
  // 1. Package everything into one giant JSON object
  const fullBackup = {
    exportDate: new Date().toISOString(),
    version: "2.0",
    household: {
      expenses: expenses,
      categories: categories.map(c => c.name),
      rentPayments: rentPayments,
      electricityReadings: elecReadings,
      waterPurchases: waterPurchases,
      waterPayModes: waterPayModes,
      waterPayDates: waterPayDates,
      milkRecords: milkRecords,
      milkPayModes: milkPayModes,
      milkPayDates: milkPayDates
    }
    // If you want to pull Birthday/Grocery from memory (if user visited them this session), 
    // you can add window.PEOPLE and window.DB here later.
  };

  // 2. Trigger the download using the shared helper
  backupJSON(fullBackup, `FULL-SYSTEM-BACKUP-${localDateStr()}.json`);
  
  // 3. Log it
  logHistory(ACT.EXPORT, { kind: 'full_system', expenses: expenses.length });
  pill('Full system backup downloaded', '🗄️');
};

window.exportFullSystemCSV = function() {
  // 1. Export ALL expenses (including "No Expense" markers)
  const allExpenses = [...expenses].sort((a,b) => String(b.date).localeCompare(String(a.date)));
  
  if (!allExpenses.length) { toast('No data to export.', 'error'); return; }

  const headers = [
    { label:'Date', key:'date' },
    { label:'Category', key:'category' },
    { label:'Amount', key:'amount' },
    { label:'Payment Mode', key:'paymentMode' },
    { label:'Note', key:'note' },
    { label:'Record ID', key:'id' },
    { label:'Created At', key:'createdAt' }
  ];

  // 2. Trigger the CSV download
  exportCSV(`FULL-EXPENSES-${localDateStr()}.csv`, headers, allExpenses);
  
  // 3. Log it
  logHistory(ACT.EXPORT, { kind: 'full_csv', count: allExpenses.length });
  pill('Full expenses CSV downloaded', '📊');
};

/* ═══════════════════════════════════════════════════════════════
   MASTER BACKUP (HOUSEHOLD + BIRTHDAY + GROCERY)
   ═══════════════════════════════════════════════════════════════ */

window.exportMasterBackup = async function() {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.classList.add('active');
    loader.style.width = '30%';
  }

  try {
    // 1. Fetch Birthday Data from Firebase
    const bdaySnap = await getDocs(collection(db, COL.BIRTHDAY));
    const birthdays = bdaySnap.docs.map(d => Object.assign({ id: d.id }, d.data()));

    // 2. Fetch Grocery Data from Firebase
    const grocSnap = await getDocs(collection(db, COL.GROCERY));
    const groceryPurchases = grocSnap.docs.map(d => Object.assign({ id: d.id }, d.data()));

    const grocItemsSnap = await getDocs(collection(db, COL.GROCERY_ITEMS));
    const groceryItems = grocItemsSnap.docs.map(d => Object.assign({ id: d.id }, d.data()));

    const grocListSnap = await getDocs(collection(db, COL.GROCERY_LIST));
    const groceryList = grocListSnap.docs.map(d => Object.assign({ id: d.id }, d.data()));

    if (loader) loader.style.width = '70%';

    // 3. Package everything
    const masterBackup = {
      exportDate: new Date().toISOString(),
      version: "3.0",
      app: "Household Multi-App",
      
      household: {
        expenses: expenses,
        categories: categories.map(c => c.name),
        rentPayments: rentPayments,
        electricityReadings: elecReadings,
        waterPurchases: waterPurchases,
        waterPayModes: waterPayModes,
        waterPayDates: waterPayDates,
        milkRecords: milkRecords,
        milkPayModes: milkPayModes,
        milkPayDates: milkPayDates
      },
      
      birthday: birthdays,
      
      grocery: {
        purchases: groceryPurchases,
        customItems: groceryItems,
        shoppingList: groceryList
      }
    };

    // 4. Download
    const jsonStr = JSON.stringify(masterBackup, null, 2);
    const blob = new Blob([jsonStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MASTER-BACKUP-${localDateStr()}.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    
    logHistory(ACT.EXPORT, { 
      kind: 'master_json', 
      expenses: expenses.length,
      birthdays: birthdays.length,
      groceries: groceryPurchases.length,
      message: `Master JSON Backup: ${expenses.length} expenses, ${birthdays.length} birthdays, ${groceryPurchases.length} groceries.`
    });
    pill('Master JSON downloaded!', '🌍');

  } catch (err) {
    console.error("Master Backup failed:", err);
    toast('❌ Backup failed: ' + err.message, 'error');
  } finally {
    if (loader) {
      loader.style.width = '100%';
      setTimeout(() => {
        loader.classList.remove('active');
        setTimeout(() => { loader.style.width = '0%'; }, 300);
      }, 400);
    }
  }
};

/* ═══════════════════════════════════════════════════════════════
   MASTER CSV EXPORT (ALL 3 MODULES)
   ═══════════════════════════════════════════════════════════════ */

window.exportMasterCSV = async function() {
  const loader = document.getElementById('global-loader');
  if (loader) { loader.classList.add('active'); loader.style.width = '30%'; }

  try {
    // 1. Fetch Birthday Data
    const bdaySnap = await getDocs(collection(db, COL.BIRTHDAY));
    const birthdays = bdaySnap.docs.map(d => Object.assign({ id: d.id }, d.data()));

    // 2. Fetch Grocery Data
    const grocSnap = await getDocs(collection(db, COL.GROCERY));
    const groceryPurchases = grocSnap.docs.map(d => Object.assign({ id: d.id }, d.data()));

    if (loader) loader.style.width = '70%';

    // Helper to escape CSV fields
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    let csvContent = '\ufeff'; // BOM for Excel

    // ── SECTION 1: HOUSEHOLD EXPENSES ──
    csvContent += '=== HOUSEHOLD EXPENSES ===\r\n';
    csvContent += 'Date,Category,Amount,Payment Mode,Note\r\n';
    const sortedExpenses = [...expenses].sort((a,b) => String(b.date).localeCompare(String(a.date)));
    sortedExpenses.forEach(e => {
      csvContent += [esc(e.date), esc(e.category), esc(e.amount), esc(e.paymentMode), esc(e.note)].join(',') + '\r\n';
    });
    csvContent += '\r\n\r\n'; // Spacer

    // ── SECTION 2: HOUSEHOLD UTILITIES ──
    csvContent += '=== HOUSEHOLD UTILITIES ===\r\n';
    
    csvContent += '--- Room Rent ---\r\n';
    csvContent += 'Month,Amount,Paid Via,Paid On\r\n';
    rentPayments.forEach(r => {
      csvContent += [esc(r.month), esc(r.amount), esc(r.paymentMode), esc(r.paidOnDate)].join(',') + '\r\n';
    });
    csvContent += '\r\n';

    csvContent += '--- Electricity ---\r\n';
    csvContent += 'Month,Reading,Payment Mode,Paid On\r\n';
    elecReadings.forEach(r => {
      csvContent += [esc(r.month), esc(r.reading), esc(r.paymentMode), esc(r.paidOnDate)].join(',') + '\r\n';
    });
    csvContent += '\r\n';

    csvContent += '--- Water ---\r\n';
    csvContent += 'Date,Amount,Note\r\n';
    waterPurchases.forEach(w => {
      csvContent += [esc(w.date), esc(w.amount), esc(w.note)].join(',') + '\r\n';
    });
    csvContent += '\r\n';

    csvContent += '--- Milk ---\r\n';
    csvContent += 'Date,Quantity,Amount,Note\r\n';
    milkRecords.forEach(m => {
      csvContent += [esc(m.date), esc(m.unit), esc(m.amount), esc(m.note)].join(',') + '\r\n';
    });
    csvContent += '\r\n\r\n'; // Spacer

    // ── SECTION 3: BIRTHDAYS ──
    csvContent += '=== BIRTHDAYS ===\r\n';
    csvContent += 'Name,Relation,Type,Day,Month,Year,Phone,VIP\r\n';
    birthdays.forEach(b => {
      csvContent += [esc(b.name), esc(b.relation), esc(b.type), esc(b.day), esc(b.month), esc(b.year), esc(b.phone), esc(b.vip ? 'Yes' : 'No')].join(',') + '\r\n';
    });
    csvContent += '\r\n\r\n'; // Spacer

    // ── SECTION 4: GROCERY ──
    csvContent += '=== GROCERY PURCHASES ===\r\n';
    csvContent += 'Date,Item,Category,Qty,Unit,Amount,Source\r\n';
    groceryPurchases.forEach(g => {
      csvContent += [esc(g.date), esc(g.name), esc(g.cat), esc(g.qty), esc(g.unit), esc(g.amount), esc(g.source)].join(',') + '\r\n';
    });
    csvContent += '\r\n';

    // 3. Trigger Download
    const filename = `MASTER-CSV-${localDateStr()}.csv`;
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    
    logHistory(ACT.EXPORT, { 
      kind: 'master_csv',
      expenses: expenses.length,
      message: `Master CSV Backup: ${expenses.length} expenses, ${birthdays.length} birthdays, ${groceryPurchases.length} groceries.`
    });
    pill('Master CSV downloaded!', '📊');

  } catch (err) {
    console.error("Master CSV failed:", err);
    toast('❌ CSV Export failed: ' + err.message, 'error');
  } finally {
    if (loader) {
      loader.style.width = '100%';
      setTimeout(() => {
        loader.classList.remove('active');
        setTimeout(() => { loader.style.width = '0%'; }, 300);
      }, 400);
    }
  }
};

/* ═══════════════════════════════════════════════════════════════
   FORCED BACKUP SYSTEM (FINAL)
   ═══════════════════════════════════════════════════════════════ */

setTimeout(() => {
  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    const count = parseInt(localStorage.getItem('backup_entry_count') || '0');
    
    if (count >= 5) {
      const modal = document.getElementById('force-backup-mo');
      if (modal) {
        const countEl = document.getElementById('force-backup-count');
        if (countEl) countEl.textContent = count;
        modal.classList.add('open');
        modal.onclick = (e) => { e.stopPropagation(); };
      }
    }
    
    if (typeof updateBackupStatusUI === 'function') updateBackupStatusUI();
  }
}, 2000);

window.downloadForcedBackup = async function() {
  await window.exportMasterBackup(); 
  markBackupComplete();
};

window.downloadForcedCSV = async function() {
  await window.exportMasterCSV(); 
  markBackupComplete();
};

function markBackupComplete() {
  localStorage.setItem('backup_entry_count', '0');
  localStorage.setItem('last_backup_time', Date.now().toString());

  const skipBtn = document.getElementById('btn-skip-backup');
  if (skipBtn) {
    skipBtn.disabled = false;
    skipBtn.textContent = '✓ Backup Downloaded. Close.';
    skipBtn.classList.remove('bg2');
    skipBtn.classList.add('bo');
  }

  updateBackupStatusUI();
  toast('Backup saved successfully!', 'success');
}

window.updateBackupStatusUI = function() {
  const dateEl = document.getElementById('last-backup-date');
  const countEl = document.getElementById('backup-counter');
  const barEl = document.getElementById('backup-progress-bar');

  if (!dateEl || !countEl || !barEl) return;

  const lastTime = parseInt(localStorage.getItem('last_backup_time') || '0');
  if (lastTime > 0) {
    dateEl.textContent = new Date(lastTime).toLocaleString('en-IN', { 
      day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' 
    });
  } else {
    dateEl.textContent = 'Never';
  }

  const count = parseInt(localStorage.getItem('backup_entry_count') || '0');
  countEl.textContent = `${count} / 5`;
  
  const pct = Math.min((count / 5) * 100, 100);
  barEl.style.width = pct + '%';
  
  if (count >= 5) {
    countEl.style.color = 'var(--err)';
    barEl.style.background = 'var(--err)';
  } else {
    countEl.style.color = 'var(--warn)';
    barEl.style.background = 'var(--warn)';
  }

  // Update the Settings tab tiles
  const settingsCountEl = document.getElementById('stat-backup-count');
  if (settingsCountEl) {
    settingsCountEl.textContent = `${count} / 5`;
    settingsCountEl.style.color = (count >= 5) ? 'var(--err)' : 'var(--warn)';
  }

  const settingsBackupDateEl = document.getElementById('stat-last-backup');
  const settingsBackupTimeEl = document.getElementById('stat-last-backup-time');
  
  if (settingsBackupDateEl && settingsBackupTimeEl) {
    if (lastTime > 0) {
      const d = new Date(lastTime);
      settingsBackupDateEl.textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      settingsBackupTimeEl.textContent = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } else {
      settingsBackupDateEl.textContent = 'Never';
      settingsBackupTimeEl.textContent = 'No backup yet';
    }
  }
};

window.downloadForcedBoth = async function() {
  // 1. Start the loader
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.classList.add('active');
    loader.style.width = '20%';
  }

  // 2. Trigger the JSON download
  await window.exportMasterBackup();
  
  if (loader) loader.style.width = '60%';

  // 3. Wait 1.5 seconds, then trigger the CSV download
  // (The delay prevents the browser from blocking the second download)
  setTimeout(async () => {
    await window.exportMasterCSV();
    
    if (loader) {
      loader.style.width = '100%';
      setTimeout(() => {
        loader.classList.remove('active');
        setTimeout(() => { loader.style.width = '0%'; }, 300);
      }, 400);
    }

    // 4. Mark the backup as complete and unlock the Skip button
    if (typeof markBackupComplete === 'function') {
      markBackupComplete();
    }
  }, 1500);
};