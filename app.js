/* ═══════════════════════════════════════════════════════════════
   HOUSEHOLD TRACKER — Shared JavaScript
   Used by: index.html · Birthday.html · Grocery.html
   Part 1 of 3 — Firebase, helpers, theme engine
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   FIREBASE SETUP
   ═══════════════════════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore, getFirestore,
  persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, getDoc, getDocs, query, orderBy, writeBatch, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const firebaseConfig = {
  apiKey:            "AIzaSyByVVcCmoZlACdbY_N8nJ3_fQM83ZzOM6E",
  authDomain:        "expense-tracker-ff4c8.firebaseapp.com",
  projectId:         "expense-tracker-ff4c8",
  storageBucket:     "expense-tracker-ff4c8.firebasestorage.app",
  messagingSenderId: "771403785299",
  appId:             "1:771403785299:web:bb0c7493133a734b5fd2a6"
};

export const app = initializeApp(firebaseConfig);

let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  _db = getFirestore(app);
}
export const db = _db;

/* Firestore instances are now importable from every HTML page */

/* ═══════════════════════════════════════════════════════════════
   COLLECTION NAMES — single source of truth
   ═══════════════════════════════════════════════════════════════ */
export const COL = {
  // Tracker
  EXPENSE:        'expenses',
  CATEGORY:       'categories',
  HISTORY:        'history',
  ELEC:           'electricity_readings',
  WATER:          'water_purchases',
  WATER_PAY:      'water_payment_modes',
  RENT:           'rent_payments',
  // Birthday
  BIRTHDAY:       'birthdays',
  BIRTHDAY_PREFS: 'birthday_settings',
  // Grocery
  GROCERY:        'grocery_purchases',
  GROCERY_ITEMS:  'grocery_items_custom',
  GROCERY_LIST:   'grocery_list',
  // Household — shared
  SESSIONS:       'household_sessions',
  SETTINGS:       'household_settings',
  CONTACTS:       'household_contacts'
};

/* ═══════════════════════════════════════════════════════════════
   BUSINESS CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
export const ELEC_METER_NO      = "603636";
export const ELEC_BASELINE_UNIT = 15083;
export const ELEC_BASELINE_DATE = "2026-09-01";
export const ELEC_RATE          = 10;
export const WATER_RATE_PER_CAN = 20;
export const BACKUP_EMAIL       = 'sadique.saif786@gmail.com';

export const LANDLORD = {
  name:   "Saif Sadique & Seema Sultana",
  addr:   "1st Floor, Konchpukur, Dewan Para, P.O Hatgacha, Pin - 700156, Dist - South 24 Parganas",
  mobile: "7033115681"
};

/* ═══════════════════════════════════════════════════════════════
   CALENDAR & DATE CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
export const CAL_MONTHS = ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];

export const MF  = ['','January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
export const MS  = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const MN  = MS;   // alias used by some renderers
export const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* ═══════════════════════════════════════════════════════════════
   COLORS (for charts)
   ═══════════════════════════════════════════════════════════════ */
export const COLORS = ['#6c63ff','#ff6584','#22c55e','#f59e0b','#3b82f6','#a855f7',
                       '#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#ef4444'];

/* ═══════════════════════════════════════════════════════════════
   CATEGORY GROUPS (Tracker)
   ═══════════════════════════════════════════════════════════════ */
export const CAT_GROUPS = [
  { key:'home',   label:'🏠 Home',          color:'#6c63ff', prefixes:['Home'] },
  { key:'saad',   label:'👦 Saad',           color:'#f59e0b', prefixes:['Saad'] },
  { key:'saif',   label:'👨 Saif',           color:'#3b82f6', prefixes:['Saif'] },
  { key:'seema',  label:'👩 Seema',          color:'#ec4899', prefixes:['Seema'] },
  { key:'shama',  label:'👧 Shama',          color:'#14b8a6', prefixes:['Shama'] },
  { key:'sub',    label:'📡 Subscriptions',  color:'#a855f7', prefixes:['Subscription'] },
  { key:'gen',    label:'💼 General',        color:'#22c55e', prefixes:['Cash','Miscellaneous','No Expense'] }
];

export function getCatGroup(name){
  return CAT_GROUPS.find(g => g.prefixes.some(p => name.startsWith(p)))
      || { key:'other', label:'🏷️ Other', color:'#94a3b8' };
}

/* ═══════════════════════════════════════════════════════════════
   BIRTHDAY CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
export const BIRTHDAY_TYPES = ['Birthday','Anniversary','Remembrance'];
export const TYPE_ICON = { Birthday:'🎂', Anniversary:'💍', Remembrance:'🕯️' };
export const RELATIONS = ['Mother','Father','Wife','Husband','Son','Daughter','Brother','Sister',
  'Grandparent','Mother-in-law','Father-in-law','Uncle','Aunt','Cousin','Nephew','Niece',
  'Friend','Best Friend','Colleague','Neighbour','Teacher','Relative','Other'];
export const STONE = ['Garnet','Amethyst','Aquamarine','Diamond','Emerald','Pearl',
                     'Ruby','Peridot','Sapphire','Opal','Topaz','Turquoise'];
export const ZOD = [
  [1,20,'Capricorn ♑'],[2,19,'Aquarius ♒'],[3,21,'Pisces ♓'],[4,20,'Aries ♈'],
  [5,21,'Taurus ♉'],[6,21,'Gemini ♊'],[7,23,'Cancer ♋'],[8,23,'Leo ♌'],
  [9,23,'Virgo ♍'],[10,23,'Libra ♎'],[11,22,'Scorpio ♏'],[12,22,'Sagittarius ♐'],[12,32,'Capricorn ♑']
];
export const MILESTONES = [1,5,10,13,16,18,21,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100];

export const WISH_TEMPLATES = [
  { k:'Warm',        t:"Happy Birthday, {name}! 🎂 Wishing you a year full of good health, peace and plenty of reasons to smile. Have a wonderful day!" },
  { k:'Short',       t:"Happy Birthday {name}! 🎉 Have an amazing day!" },
  { k:'Family',      t:"Happy Birthday, {name}! 🎂 Thank you for everything you do for us. May this new year bring you health, happiness and lots of love. ❤️" },
  { k:'Milestone',   t:"Happy {age}th Birthday, {name}! 🎉 What a milestone — here's to many more wonderful years ahead. 🥳" },
  { k:'Funny',       t:"Happy Birthday {name}! 🎂 Another year wiser, and somehow still younger than me in spirit. Enjoy your day — cake is mandatory! 🍰" },
  { k:'Formal',      t:"Dear {name}, wishing you a very happy birthday. May the year ahead bring you good health, success and happiness. Warm regards." },
  { k:'Anniversary', t:"Happy Anniversary, {name}! 💍 Wishing you both continued love, laughter and togetherness. 🥂" }
];

/* ═══════════════════════════════════════════════════════════════
   GROCERY — UNITS & SOURCES
   ═══════════════════════════════════════════════════════════════ */
export const GROCERY_UNITS = ['kg','g','L','ml','pcs','pack','dozen','bundle','6-pack','10-pack','12-pack','15-pack','30-pack','10g','25g','50g','100g','250g','500g','750g'];
export const GROCERY_SOURCES = {
  Online: ['Blinkit','Swiggy Instamart','Zepto','BigBasket','JioMart','Flipkart Minutes',
           'Flipkart','Amazon','DMart Ready','Other online'],
  Offline:['Local Kirana Store','Sabzi Mandi / Bazar','DMart','Reliance Smart','Spencer\'s',
           'More Supermarket','Fish / Meat Market','Fruit Market','Medical Store','Other offline']
};

/* ═══════════════════════════════════════════════════════════════
   DOM HELPERS
   ═══════════════════════════════════════════════════════════════ */
export const $  = id => document.getElementById(id);
export const $$ = id => document.getElementById(id);
export const el = (sel, root) => (root || document).querySelector(sel);
export const els = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/* ═══════════════════════════════════════════════════════════════
   STRING HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
export function escQ(s){ return String(s == null ? '' : s).replace(/'/g, "\\'"); }

export function hue(s){
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 360;
  return h;
}
export function initials(name){
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length-1][0] : '')).toUpperCase();
}
export function avatarHTML(name, extraClass){
  const h = hue(name);
  return `<div class="av ${extraClass||''}" style="background:hsl(${h} 62% 50% / .18);color:hsl(${h} 65% 42%)">${esc(initials(name))}</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   NUMBER & CURRENCY HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function fmtAmt(v){
  return Number(v || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
export function fmt0(v){
  return Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
export function fmt(v){ return '₹' + fmtAmt(v); }

/* ═══════════════════════════════════════════════════════════════
   DATE HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function localDateStr(d){
  const dt = d || new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
export const todayISO = () => localDateStr();
export const today    = () => localDateStr();

export function fmtDate(d){
  if (!d) return '—';
  const p = d.split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}
export function fmtDateShort(d){
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return `${String(dt.getDate()).padStart(2,'0')} ${MF[dt.getMonth()+1].slice(0,3)} '${String(dt.getFullYear()).slice(2)}`;
}
export function dayShort(dateStr){
  if (!dateStr) return '';
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr + 'T00:00:00').getDay()];
}
export function fmtFull(dt){
  return DOW[dt.getDay()].slice(0,3) + ', ' + dt.getDate() + ' ' + MN[dt.getMonth()+1] + ' ' + dt.getFullYear();
}
export function monthLabel(m){
  if (!m) return '—';
  const [y, mm] = m.split('-');
  return `${MF[parseInt(mm)]} ${y}`;
}
export function mkey(d){ return String(d).slice(0,7); }
export function mlabel(k){
  const [y, m] = k.split('-');
  return MN[+m] + " '" + y.slice(2);
}
export function daysBetween(a, b){
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
export function lastKeys(n){
  const out = [], d = new Date();
  for (let i = n-1; i >= 0; i--){
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0'));
  }
  return out;
}
export function updateDateDayLabel(inputId, labelId){
  const i = $(inputId), l = $(labelId);
  if (i && l) l.textContent = dayShort(i.value);
}

/* ═══════════════════════════════════════════════════════════════
   LAST-ACTIVITY HELPERS
   ═══════════════════════════════════════════════════════════════ */

/* Given an array of rows, return the latest timestamp.
   Checks both createdAt and updatedAt by default. */
export function latestActivity(rows, fields){
  const f = fields || ['createdAt', 'updatedAt'];
  let best = 0;
  (rows || []).forEach(r => {
    f.forEach(k => {
      const v = r && r[k];
      if (!v) return;
      const t = Date.parse(v);
      if (!isNaN(t) && t > best) best = t;
    });
  });
  return best ? new Date(best).toISOString() : null;
}

/* Friendly relative time.
   - < 1 min  → "just now"
   - < 60 min → "X min ago"
   - < 24 hr  → "X hr ago" / "X hrs ago"
   - ≥ 1 day  → "X day ago" / "X days ago"  */
export function fmtAgo(iso){
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (isNaN(t)) return '—';
  const diff = Date.now() - t;

  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';

  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hr ago' : ' hrs ago');

  const days = Math.floor(diff / 86400000);
  return days + (days === 1 ? ' day ago' : ' days ago');
}

/* Set the header's "last activity" pill.
   Called by each page's render pipeline. */
export function setHeaderLastActivity(iso){
  const el = $('last-activity');
  if (!el) return;
  el.textContent = iso ? fmtAgo(iso) : '—';
  el.title = iso ? new Date(iso).toLocaleString('en-IN') : 'No activity yet';
}

/* ═══════════════════════════════════════════════════════════════
   PAYMENT MODE BADGES
   ═══════════════════════════════════════════════════════════════ */
export function pmBadge(mode){
  if (!mode) return '<span class="pm-badge pm-none">—</span>';
  const m = mode.toLowerCase();
  const cls  = m.includes('upi')  ? 'pm-upi'
             : m.includes('cash') ? 'pm-cash'
             : m.includes('bank') ? 'pm-bank'
             : 'pm-none';
  const icon = m.includes('upi')  ? '📱'
             : m.includes('cash') ? '💵'
             : m.includes('bank') ? '🏦'
             : '💳';
  return `<span class="pm-badge ${cls}">${icon} ${esc(mode)}</span>`;
}

/* ═══════════════════════════════════════════════════════════════
   BARS / PERCENTAGE HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function bars(rows, fmtv){
  if (!rows.length) return '<div class="es">No data yet</div>';
  const max = Math.max(...rows.map(r => +r.value || 0), 1);
  return rows.map(r => `<div class="pct-row">
    <div class="pct-label">${esc(r.label)}</div>
    <div class="pct-track">
      <div class="pct-fill" style="width:${(100 * (+r.value || 0) / max).toFixed(1)}%;background:linear-gradient(90deg,var(--p),var(--acc))">
        <span>${r.value ? esc(fmtv ? fmtv(r.value) : r.value) : ''}</span>
      </div>
    </div>
    <div class="pct-amt">${esc(r.sub || '')}</div>
  </div>`).join('');
}

/* ═══════════════════════════════════════════════════════════════
   DOWNLOAD / PRINT HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function download(filename, content, mime){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function printLetterhead(title){
  return `<div style="text-align:center;margin-bottom:22px;padding-bottom:14px;border-bottom:2px solid #333">
    <h2 style="font-size:1.2rem;margin-bottom:10px;font-weight:800;color:#111">${title}</h2>
    <div style="font-size:.85rem;line-height:1.7;color:#222">
      <strong>${LANDLORD.name}</strong><br/>
      ${LANDLORD.addr}<br/>
      Mobile: ${LANDLORD.mobile}
    </div>
  </div>`;
}

export function openPrintWindow(title, bodyHtml){
  const w = window.open('', '_blank', 'width=800,height=900');
  w.document.write(`<html><head><title>${esc(title)}</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 28px; color: #111; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f7f7f9; }
    </style>
  </head><body>${bodyHtml}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

/* ═══════════════════════════════════════════════════════════════
   TOAST — bottom-right notifications
   ═══════════════════════════════════════════════════════════════ */
let _toastHost = null;
function ensureToastHost(){
  if (_toastHost && document.body.contains(_toastHost)) return _toastHost;
  _toastHost = $('toast-c');
  if (!_toastHost) {
    _toastHost = document.createElement('div');
    _toastHost.id = 'toast-c';
    _toastHost.className = 'tc2';
    document.body.appendChild(_toastHost);
  }
  return _toastHost;
}

export function toast(msg, type = 'info'){
  const c = ensureToastHost();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'tout .3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

/* ═══════════════════════════════════════════════════════════════
   PILL TOAST — top-center notification for "data saved" events
   ═══════════════════════════════════════════════════════════════ */
let _pillHost = null;
function ensurePillHost(){
  if (_pillHost && document.body.contains(_pillHost)) return _pillHost;
  _pillHost = document.createElement('div');
  _pillHost.className = 'hh-pill-toast';
  document.body.appendChild(_pillHost);
  return _pillHost;
}

export function pill(msg, icon = '✓'){
  const host = ensurePillHost();
  const el = document.createElement('div');
  el.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
  }, 1800);
  setTimeout(() => el.remove(), 2200);
}

/* ═══════════════════════════════════════════════════════════════
   THEME ENGINE — 12 palettes, light + dark
   ═══════════════════════════════════════════════════════════════ */
export const PALETTES = {
  signature: {
    name: 'Signature Purple', recommended: true,
    light: { p:'#443C68', pd:'#302A4C', pl:'#EAE6F6', sec:'#F4F2FA', acc:'#C2447B',
             bg:'#F6F5FA', card:'#FFFFFF', txt:'#211D33', muted:'#726C89', bdr:'#E6E2F1' },
    dark:  { p:'#5B4F8A', pd:'#443C68', pl:'#2B2649', sec:'#211E36', acc:'#D6579A',
             bg:'#14121F', card:'#1D1A2E', txt:'#EEEAFB', muted:'#9D96BC', bdr:'#2E2A47' }
  },
  ocean: {
    name: 'Midnight Ocean', recommended: true,
    light: { p:'#1B5F8C', pd:'#134764', pl:'#DCEEF6', sec:'#F1F7FA', acc:'#17A398',
             bg:'#F3F7FA', card:'#FFFFFF', txt:'#132436', muted:'#5D7385', bdr:'#DEE8ED' },
    dark:  { p:'#3987B8', pd:'#1B5F8C', pl:'#153347', sec:'#111D28', acc:'#26D6C6',
             bg:'#0B1622', card:'#132436', txt:'#E7F1F7', muted:'#87A0B0', bdr:'#1E323F' }
  },
  sunset: {
    name: 'Sunset Amber', recommended: true,
    light: { p:'#C2571B', pd:'#994312', pl:'#FBE7D6', sec:'#FBF6F0', acc:'#D6336C',
             bg:'#FBF6F0', card:'#FFFFFF', txt:'#2B1B12', muted:'#8A7263', bdr:'#F0E2D3' },
    dark:  { p:'#E07B3E', pd:'#C2571B', pl:'#3A2818', sec:'#211710', acc:'#E85C90',
             bg:'#1C140D', card:'#26190F', txt:'#F7EAE0', muted:'#B29A88', bdr:'#3A2A1C' }
  },
  forest: {
    name: 'Forest Green', recommended: true,
    light: { p:'#1F8A5F', pd:'#166B49', pl:'#DAF2E6', sec:'#F3FAF6', acc:'#DB9A2C',
             bg:'#F3FAF6', card:'#FFFFFF', txt:'#122A20', muted:'#63897A', bdr:'#DDEEE5' },
    dark:  { p:'#37B37F', pd:'#1F8A5F', pl:'#163C2C', sec:'#0F1F18', acc:'#EBB24D',
             bg:'#0D1712', card:'#132A20', txt:'#E4F5EC', muted:'#84AC99', bdr:'#1D3A2C' }
  },
  aurora: {
    name: 'Aurora Gradient', recommended: true,
    light: { p:'#7B2FF7', pd:'#5B21B6', pl:'#F0E5FF', sec:'#F8F5FF', acc:'#F107A3',
             bg:'#F8F5FF', card:'#FFFFFF', txt:'#1E0B3A', muted:'#725C99', bdr:'#E8DFF8' },
    dark:  { p:'#A855F7', pd:'#7B2FF7', pl:'#2D1B4E', sec:'#1A0F2E', acc:'#F472B6',
             bg:'#12071F', card:'#1E1230', txt:'#F0E5FF', muted:'#A78BC8', bdr:'#2E1F4A' }
  },
  rose_gold: {
    name: 'Rose Gold Shine', recommended: true,
    light: { p:'#B76E79', pd:'#8E4E57', pl:'#FBEBED', sec:'#FDF5F6', acc:'#C9A227',
             bg:'#FDF5F6', card:'#FFFFFF', txt:'#2E1218', muted:'#8A6A70', bdr:'#F2DDE0' },
    dark:  { p:'#E8A0A8', pd:'#B76E79', pl:'#3D2228', sec:'#22141A', acc:'#F0C968',
             bg:'#1A0F12', card:'#26181E', txt:'#FBEBED', muted:'#C494A0', bdr:'#3D262E' }
  },
  slate: {
    name: 'Slate Mono', recommended: false,
    light: { p:'#3A3F4B', pd:'#282C35', pl:'#E7E8EC', sec:'#F5F6F8', acc:'#5D5FEF',
             bg:'#F5F6F8', card:'#FFFFFF', txt:'#1C1F26', muted:'#6C7280', bdr:'#E3E4E9' },
    dark:  { p:'#7A8090', pd:'#4B505C', pl:'#2A2D36', sec:'#181A20', acc:'#8587F5',
             bg:'#121317', card:'#191B21', txt:'#EAEBEF', muted:'#9599A6', bdr:'#282A32' }
  },
  candy: {
    name: 'Candy Bright', recommended: false,
    light: { p:'#E91E63', pd:'#C2185B', pl:'#FCE4EC', sec:'#FFF5F8', acc:'#7C4DFF',
             bg:'#FFF8FB', card:'#FFFFFF', txt:'#2A0A1A', muted:'#8A5A70', bdr:'#F8DCE8' },
    dark:  { p:'#F06292', pd:'#E91E63', pl:'#3D1526', sec:'#22101A', acc:'#B388FF',
             bg:'#1A0812', card:'#26141D', txt:'#FDE7F1', muted:'#C493A8', bdr:'#3D1F2E' }
  },
  neon: {
    name: 'Neon Pulse', recommended: false,
    light: { p:'#00BFA5', pd:'#00897B', pl:'#D6F5F1', sec:'#F0FBF9', acc:'#FF4081',
             bg:'#F5FCFB', card:'#FFFFFF', txt:'#042A26', muted:'#4E8079', bdr:'#D2EEEA' },
    dark:  { p:'#1DE9B6', pd:'#00BFA5', pl:'#0D3833', sec:'#0A1F1C', acc:'#FF80AB',
             bg:'#061412', card:'#0F2320', txt:'#DBFAF4', muted:'#7EC8BE', bdr:'#173A36' }
  },
  gold_shiny: {
    name: 'Gold Shine', recommended: false,
    light: { p:'#B8860B', pd:'#8B6508', pl:'#FBF0D0', sec:'#FDF8E8', acc:'#1A1A1A',
             bg:'#FDF8E8', card:'#FFFFFF', txt:'#2A1F00', muted:'#8A7A4A', bdr:'#F0E4B8' },
    dark:  { p:'#FFD700', pd:'#DAA520', pl:'#3D3208', sec:'#221D08', acc:'#E0E0E0',
             bg:'#1A1608', card:'#261F0D', txt:'#FBF0D0', muted:'#C4B175', bdr:'#3D3418' }
  },
  tropical: {
    name: 'Tropical Gradient', recommended: false,
    light: { p:'#06B6D4', pd:'#0891B2', pl:'#CFFAFE', sec:'#F0FDFF', acc:'#F59E0B',
             bg:'#F0FDFF', card:'#FFFFFF', txt:'#0A3A42', muted:'#5A8890', bdr:'#C8EEF2' },
    dark:  { p:'#22D3EE', pd:'#06B6D4', pl:'#0A3A42', sec:'#061F24', acc:'#FBBF24',
             bg:'#031418', card:'#0A2A30', txt:'#CFFAFE', muted:'#7EC0C8', bdr:'#10454D' }
  },
  royal_indigo: {
    name: 'Royal Indigo', recommended: false,
    light: { p:'#4A4FA6', pd:'#383C80', pl:'#E3E3F5', sec:'#F5F5FC', acc:'#DB9A2C',
             bg:'#F5F5FC', card:'#FFFFFF', txt:'#1E1E33', muted:'#6E70A0', bdr:'#E4E4F2' },
    dark:  { p:'#6C71C4', pd:'#4A4FA6', pl:'#292A4E', sec:'#181830', acc:'#EBB24D',
             bg:'#121225', card:'#1A1A33', txt:'#E9E9FA', muted:'#9C9EC6', bdr:'#2A2A4A' }
  }
};

const PALETTE_VARS = ['p','pd','pl','sec','acc','bg','card','txt','muted','bdr'];
const KEY_MODE = 'hh_theme_mode';
const KEY_PAL  = 'hh_theme_palette';

export function applyTheme(){
  const mode = localStorage.getItem(KEY_MODE) || 'light';
  const key  = localStorage.getItem(KEY_PAL)  || 'signature';
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-palette', key);
  const pal = (PALETTES[key] || PALETTES.signature)[mode];
  PALETTE_VARS.forEach(v => document.documentElement.style.setProperty('--' + v, pal[v]));
}

export function setThemeMode(mode){
  localStorage.setItem(KEY_MODE, mode);
  applyTheme();
  broadcastTheme('mode', mode);
}
export function setPalette(key){
  localStorage.setItem(KEY_PAL, key);
  applyTheme();
  broadcastTheme('palette', key);
}

export function renderThemeGallery(containerId, onPick){
  const container = $(containerId);
  if (!container) return;
  const mode = localStorage.getItem(KEY_MODE) || 'light';
  const cur  = localStorage.getItem(KEY_PAL)  || 'signature';

  container.innerHTML = Object.keys(PALETTES).map(k => {
    const p = PALETTES[k][mode];
    return `<div class="palette-card ${cur === k ? 'active' : ''}" data-pal="${k}">
      ${PALETTES[k].recommended ? '<span class="pc-badge">★</span>' : ''}
      <div class="pc-swatch">
        <span style="background:${p.bg}"></span>
        <span style="background:${p.card}"></span>
        <span style="background:${p.p}"></span>
        <span style="background:${p.acc}"></span>
      </div>
      <div class="pc-name">${esc(PALETTES[k].name)}</div>
    </div>`;
  }).join('');

  container.querySelectorAll('[data-pal]').forEach(c => {
    c.onclick = () => {
      setPalette(c.dataset.pal);
      if (onPick) onPick();
    };
  });
}

/* Cross-tab theme sync via BroadcastChannel */
let _themeBC = null;
try {
  _themeBC = new BroadcastChannel('hh_theme_sync');
  _themeBC.onmessage = e => {
    const { kind, val } = e.data || {};
    if (kind === 'mode')    { localStorage.setItem(KEY_MODE, val); applyTheme(); }
    if (kind === 'palette') { localStorage.setItem(KEY_PAL,  val); applyTheme(); }
  };
} catch (e) { /* Safari private mode */ }

function broadcastTheme(kind, val){
  try { if (_themeBC) _themeBC.postMessage({ kind, val }); } catch (e) {}
}

/* ═══════════════════════════════════════════════════════════════
   SESSION CONSTANTS — used by Part 2
   ═══════════════════════════════════════════════════════════════ */
export const SESSION_KEY    = 'hh_session_until';
export const SESSION_USER   = 'hh_user';
export const SESSION_PASS   = 'hh_session_pass';
export const DEFAULT_PASSWORD = '1432';
export const DEFAULT_USER     = 'Saif Sadique';
export const DEFAULT_ROLE     = 'owner';

/* ═══════════════════════════════════════════════════════════════
   HOUSEHOLD SETTINGS — cached from Firestore
   ═══════════════════════════════════════════════════════════════ */
export const SETTINGS_DOC = 'prefs';

export let HOUSEHOLD_SETTINGS = {
  sessionMin:        15,
  autoclearHistory:  false,
  confettiEnabled:   true,
  currentThemeMode:  'light',
  currentThemePal:   'signature'
};

export function applyHouseholdSettings(s){
  if (!s) return;
  HOUSEHOLD_SETTINGS = Object.assign({}, HOUSEHOLD_SETTINGS, s);
}

/* ═══════════════════════════════════════════════════════════════
   HOUSEHOLD TRACKER — Shared JavaScript
   Part 2 of 3 — session, header, notifications, history
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   SESSION SYSTEM
   - localStorage keeps session alive across refresh on THIS device
   - Firestore household_sessions/current is used for visibility
     (see who's logged in and when they were last active, from anywhere)
   ═══════════════════════════════════════════════════════════════ */

let _sessionTimer = null;
let _sessionHeartbeat = null;
let _onLoginCallback  = null;
let _onLogoutCallback = null;

const ACTIVITY_EVENTS = ['click','keydown','mousemove','touchstart','scroll'];

/* Current device type — used for Firestore session doc */
function detectDevice(){
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

/* Read session minutes from HOUSEHOLD_SETTINGS (or default) */
function getSessionMin(){
  const v = parseInt(HOUSEHOLD_SETTINGS.sessionMin);
  return (v && v > 0) ? v : 15;
}

/* Public getter — used by Settings tab */
export function getSessionMinValue(){
  return getSessionMin();
}

/* Session state checks */
export function isLoggedIn(){
  const v = parseInt(localStorage.getItem(SESSION_KEY) || '0');
  return v > Date.now();
}
export function currentUser(){
  return localStorage.getItem(SESSION_USER) || '';
}
export function currentUserPass(){
  return localStorage.getItem(SESSION_PASS) || '';
}
export function currentUserRole(){
  return localStorage.getItem(SESSION_PASS) === DEFAULT_PASSWORD ? DEFAULT_ROLE : 'user';
}

/* Touch session — extend expiry */
export function touchSession(){
  const until = Date.now() + getSessionMin() * 60000;
  localStorage.setItem(SESSION_KEY, String(until));
  return until;
}

/* Firestore session doc — fire-and-forget (never blocks UI) */
async function upsertSessionDoc(user, pass, action){
  try {
    const ref = doc(db, COL.SESSIONS, 'current');
    if (action === 'clear'){
      await setDoc(ref, {
        user: '',
        device: '',
        lastActive: null,
        sessionUntil: null,
        loggedOutAt: new Date().toISOString()
      }, { merge: true });
      return;
    }
    await setDoc(ref, {
      user: user || DEFAULT_USER,
      role: pass === DEFAULT_PASSWORD ? DEFAULT_ROLE : 'user',
      device: detectDevice(),
      lastActive: new Date().toISOString(),
      sessionUntil: new Date(Date.now() + getSessionMin() * 60000).toISOString()
    }, { merge: true });
  } catch (e) {
    /* Session doc is best-effort — never block login on it */
    console.warn('Session Firestore write failed:', e && e.message);
  }
}

/* Heartbeat — refresh lastActive in Firestore every 60s while logged in */
function startHeartbeat(){
  stopHeartbeat();
  _sessionHeartbeat = setInterval(() => {
    if (!isLoggedIn()) { stopHeartbeat(); return; }
    upsertSessionDoc(currentUser(), currentUserPass(), 'update');
  }, 60000);
}
function stopHeartbeat(){
  if (_sessionHeartbeat) { clearInterval(_sessionHeartbeat); _sessionHeartbeat = null; }
}

/* Timer — auto-logout after inactivity */
function resetSessionTimer(){
  if (_sessionTimer) clearTimeout(_sessionTimer);
  _sessionTimer = setTimeout(() => {
    if (window.__householdLogout) window.__householdLogout('timeout');
  }, getSessionMin() * 60000);
}

/* Attempt login — with single password (1432) */
export async function attemptLogin(input){
  const pass = String(input || '').trim();
  if (pass === DEFAULT_PASSWORD){
    localStorage.setItem(SESSION_USER, DEFAULT_USER);
    localStorage.setItem(SESSION_PASS, pass);
    touchSession();
    resetSessionTimer();
    startHeartbeat();
    await upsertSessionDoc(DEFAULT_USER, pass, 'login');
    if (_onLoginCallback) _onLoginCallback({ name: DEFAULT_USER, role: DEFAULT_ROLE });
    return { ok: true, name: DEFAULT_USER, role: DEFAULT_ROLE };
  }
  return { ok: false, message: 'Incorrect password. Try again.' };
}

/* Logout — clears session on this device and marks Firestore doc */
export async function logout(reason){
  if (_sessionTimer) clearTimeout(_sessionTimer);
  stopHeartbeat();
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_USER);
  localStorage.removeItem(SESSION_PASS);
  await upsertSessionDoc('', '', 'clear');
  if (_onLogoutCallback) _onLogoutCallback(reason || 'manual');
}

/* Install session — call once from each page */
export function installSession(onLogin, onLogout){
  _onLoginCallback  = onLogin;
  _onLogoutCallback = onLogout;

  // Global logout hook (used by header + sidebar buttons)
  window.__householdLogout = function(reason){
    logout(reason || 'manual');
  };
  window.__householdLogin = async function(pass){
    return attemptLogin(pass);
  };

  // Refresh session on any user activity
  ACTIVITY_EVENTS.forEach(evt => {
    document.addEventListener(evt, () => {
      if (isLoggedIn()) {
        touchSession();
        resetSessionTimer();
      }
    }, { passive: true });
  });

  // Wire the login overlay DOM
  const overlay = $('login-overlay');
  const input   = $('login-pass');
  const err     = $('login-err');

  if (!overlay || !input || !err) {
    console.warn('installSession: login overlay elements missing');
    return;
  }

  const trySubmit = async () => {
    const btn = overlay.querySelector('button.bp');
    if (btn) btn.disabled = true;
    const res = await attemptLogin(input.value);
    if (btn) btn.disabled = false;

    if (res.ok){
      overlay.style.display = 'none';
      input.value = '';
      err.textContent = '';
    } else {
      err.textContent = '❌ ' + res.message;
      input.value = '';
      input.focus();
    }
  };

  // Login button (find any primary button inside login-box)
  const loginBtn = overlay.querySelector('.login-box button.bp');
  if (loginBtn) loginBtn.onclick = trySubmit;

  // Enter key
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') trySubmit();
  });

  // Auto-submit when the correct password is typed
  input.addEventListener('input', e => {
    if (e.target.value === DEFAULT_PASSWORD) trySubmit();
  });

  // Boot: if already logged in, skip login
  if (isLoggedIn()){
    overlay.style.display = 'none';
    resetSessionTimer();
    startHeartbeat();
    if (onLogin) onLogin({ name: currentUser() || DEFAULT_USER, role: currentUserRole() });
  } else {
    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 100);
  }
}

/* ═══════════════════════════════════════════════════════════════
   UNIVERSAL HEADER
   Every page calls installHeader({ counters: [...] }).
   Replaces the .sync-banner content with a shared layout:
   [status] [counters] [user chip] [date] [cross-links] [logout]
   ═══════════════════════════════════════════════════════════════ */

/* Header state — remember counters so setCounter() works after re-render */
const _headerCounters = new Map();

export function installHeader(opts){
  opts = opts || {};
  const counters = opts.counters || [];
  const appName  = opts.appName  || 'Household Tracker';

  const banner = document.querySelector('.sync-banner');
  if (!banner) {
    console.warn('installHeader: .sync-banner not found');
    return;
  }

  // Remember counters
  _headerCounters.clear();
  counters.forEach(c => _headerCounters.set(c.id, { ...c }));

  // Build user chip
  const userName = currentUser() || DEFAULT_USER;
  const userRole = currentUserRole();

  const render = () => {
        // Header pills removed — moved to main dashboard in index.html
    const pills = '';

    const todayStr = new Date().toLocaleDateString('en-IN', {
      weekday:'short', day:'2-digit', month:'short', year:'numeric'
    });

        banner.innerHTML = `
      <div class="sg">
        <div class="si">
          <span class="dot dot-yellow" id="sync-dot"></span>
          <span id="sync-status">Connecting…</span>
        </div>
        ${pills}
        <div class="si" title="Last activity on this page">
          🕐 <span style="opacity:.75">Last:</span>
          <strong id="last-activity">—</strong>
        </div>
                <!-- User chip removed for sole-user mode -->
        <div class="si">📅 <strong id="hdr-date">${todayStr}</strong></div>
      </div>
            <div class="sg sg-right"></div>
    `;

    const logoutBtn = $('hh-logout-btn');
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        if (window.__householdLogout) window.__householdLogout('manual');
      };
    }
  };

  render();

  // Header brand name — update any document title elements if present
  document.querySelectorAll('[data-app-name]').forEach(el => {
    el.textContent = appName;
  });
}

/* Update a counter pill value */
export function setCounter(id, value){
  const stored = _headerCounters.get(id);
  if (stored) stored.value = value;
  const el = document.querySelector(`[data-counter="${id}"]`);
  if (el) el.textContent = value;
}

/* Update the sync status dot + text */
export function setSyncStatus(state){
  const dot = $('sync-dot');
  const txt = $('sync-status');
  if (!dot || !txt) return;
  if (state === 'live'){
    dot.className = 'dot dot-green';
    txt.textContent = 'Live Sync ✓';
  } else if (state === 'saving'){
    dot.className = 'dot dot-yellow';
    txt.textContent = 'Saving…';
  } else if (state === 'error'){
    dot.className = 'dot dot-red';
    txt.textContent = 'Sync Error';
  } else {
    dot.className = 'dot dot-yellow';
    txt.textContent = 'Connecting…';
  }

  /* Hide the "Last activity" pill entirely when live.
     Show it (with the current text) when saving / error / connecting
     so the user has a "last successful sync" reference. */
  const lastPill = $('last-activity');
  if (lastPill){
    const wrap = lastPill.closest('.si');
    if (wrap) wrap.style.display = (state === 'live') ? 'none' : '';
  }
}

/* Update user chip when login completes (in case header was rendered before login) */
export function refreshHeaderUser(){
  const chip = document.querySelector('.sync-banner .user-chip strong');
  if (chip) chip.textContent = currentUser() || DEFAULT_USER;
}

/* ═══════════════════════════════════════════════════════════════
   NETWORK LISTENERS
   ═══════════════════════════════════════════════════════════════ */
export function installNetworkListeners(){
  const offlineBar = $('offline-bar');

  const onOnline = () => {
    if (offlineBar) offlineBar.classList.remove('show');
    setSyncStatus('live');
    toast('🌐 Back online — syncing…', 'success');
  };
  const onOffline = () => {
    if (offlineBar) offlineBar.classList.add('show');
    setSyncStatus('saving');
    toast('⚠️ You are offline — changes will sync when reconnected', 'warning');
  };

  window.addEventListener('online',  onOnline);
  window.addEventListener('offline', onOffline);

  if (!navigator.onLine) onOffline();
}

/* ═══════════════════════════════════════════════════════════════
   DATA CHANGED NOTIFICATION
   Called after any Firestore write. Shows a top-center pill.
   ═══════════════════════════════════════════════════════════════ */
export function dataSaved(msg, icon){
  pill(msg || 'Data saved', icon || '✓');
}
export function dataUpdated(msg, icon){
  pill(msg || 'Record updated', icon || '✏️');
}
export function dataDeleted(msg, icon){
  pill(msg || 'Record deleted', icon || '🗑️');
}
export function dataLoaded(msg, icon){
  pill(msg || 'Data loaded', icon || '📥');
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR HELPERS — cross-links + logout
   Optional: some pages may want to render cross-links in their sidebar.
   ═══════════════════════════════════════════════════════════════ */
export function getCrossLinksHTML(current){
  const items = [
    { href: 'index.html',    icon: '🏠', label: 'Household Tracker', key: 'index' },
    { href: 'Birthday.html', icon: '🎂', label: 'Birthday Tracker',  key: 'birthday', block: 'Block B' },
    { href: 'Grocery.html',  icon: '🛒', label: 'Grocery Tracker',   key: 'grocery',  block: 'Block G' }
  ];
  return items.map(it => {
    const isCurrent = it.key === current;
    return `<a class="tb ${isCurrent ? 'active' : ''}" href="${it.href}">
      <span>${it.icon}</span>
      <span class="tb-lbl">${esc(it.label)}</span>
      ${it.block ? `<span class="block-tag">${esc(it.block)}</span>` : ''}
    </a>`;
  }).join('');
}

export function getLogoutButtonHTML(){
  return `<button class="tb" onclick="window.__householdLogout && window.__householdLogout('manual')">
    <span>🚪</span><span class="tb-lbl">Logout</span>
  </button>`;
}

/* ═══════════════════════════════════════════════════════════════
   HISTORY LOGGING
   Every CRUD action writes to `history` collection.
   Shape: { action, icon, label, badge, data, timestamp }
   ═══════════════════════════════════════════════════════════════ */
export const ACT = {
  CREATE:      { key:'create',      icon:'➕', label:'Created',         badge:'hb-c'   },
  UPDATE:      { key:'update',      icon:'✏️', label:'Updated',         badge:'hb-u'   },
  DELETE:      { key:'delete',      icon:'🗑️', label:'Deleted',         badge:'hb-d'   },
  CAT_ADD:     { key:'cat_add',     icon:'🏷️', label:'Category Added',  badge:'hb-cat' },
  CAT_EDIT:    { key:'cat_edit',    icon:'✏️', label:'Category Renamed',badge:'hb-u'   },
  CAT_DELETE:  { key:'cat_delete',  icon:'🗑️', label:'Category Deleted',badge:'hb-d'   },
  EXPORT:      { key:'export',      icon:'🗂️', label:'Data Exported',   badge:'hb-cat' },
  IMPORT:      { key:'import',      icon:'📥', label:'Data Imported',   badge:'hb-cat' },
  DELETE_ALL:  { key:'delete_all',  icon:'🧨', label:'All Data Deleted',badge:'hb-d'   },
  LOGIN:       { key:'login',       icon:'🔓', label:'Logged In',       badge:'hb-c'   },
  LOGOUT:      { key:'logout',      icon:'🔒', label:'Logged Out',      badge:'hb-u'   },
  PASS_CHANGE: { key:'pass_change', icon:'🔑', label:'Password Changed',badge:'hb-u'   },
  // Birthday-specific
  BDAY_ADD:    { key:'bday_add',    icon:'🎂', label:'Person Added',    badge:'hb-cat' },
  BDAY_EDIT:   { key:'bday_edit',   icon:'✏️', label:'Person Edited',   badge:'hb-u'   },
  BDAY_DEL:    { key:'bday_del',    icon:'🗑️', label:'Person Deleted',  badge:'hb-d'   },
  // Grocery-specific
  GROC_ADD:    { key:'groc_add',    icon:'🛒', label:'Purchase Added',  badge:'hb-cat' },
  GROC_EDIT:   { key:'groc_edit',   icon:'✏️', label:'Purchase Edited', badge:'hb-u'   },
  GROC_DEL:    { key:'groc_del',    icon:'🗑️', label:'Purchase Deleted',badge:'hb-d'   }
};

export async function logHistory(act, data){
  if (!act || !act.key) return;
  try {
    await addDoc(collection(db, COL.HISTORY), {
      action:    act.key,
      icon:      act.icon,
      label:     act.label,
      badge:     act.badge,
      user:      currentUser() || DEFAULT_USER,
      data:      data || {},
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn('History log failed:', e && e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS FOR BUILDING / CLEARING COLLECTIONS
   ═══════════════════════════════════════════════════════════════ */

/* Wipe an entire collection (chunked at 400 to stay under writeBatch limit) */
export async function wipeCollection(collectionName){
  const snap = await getDocs(collection(db, collectionName));
  const ids = snap.docs.map(d => d.id);
  for (let i = 0; i < ids.length; i += 400){
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach(id => batch.delete(doc(db, collectionName, id)));
    await batch.commit();
  }
  return ids.length;
}

/* Push an array of objects into a collection */
export async function pushCollection(collectionName, items){
  let count = 0;
  for (let i = 0; i < items.length; i += 400){
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach(o => {
      const { id, ...rest } = o;
      const ref = id ? doc(db, collectionName, id) : doc(collection(db, collectionName));
      batch.set(ref, rest);
    });
    await batch.commit();
    count += items.slice(i, i + 400).length;
  }
  return count;
}

/* ═══════════════════════════════════════════════════════════════
   FIRESTORE SETTINGS LISTENER
   Subscribes to household_settings/prefs so every device shares
   session timeout, theme, autoclear preference.
   ═══════════════════════════════════════════════════════════════ */
let _unsubSettings = null;

export function startSettingsListener(onUpdate){
  if (_unsubSettings) _unsubSettings();
  _unsubSettings = onSnapshot(doc(db, COL.SETTINGS, SETTINGS_DOC), snap => {
    if (snap.exists()){
      applyHouseholdSettings(snap.data());
      // Apply theme from Firestore settings if this device has no local override
      if (HOUSEHOLD_SETTINGS.currentThemeMode &&
          !localStorage.getItem(KEY_MODE)){
        localStorage.setItem(KEY_MODE, HOUSEHOLD_SETTINGS.currentThemeMode);
      }
      if (HOUSEHOLD_SETTINGS.currentThemePal &&
          !localStorage.getItem(KEY_PAL)){
        localStorage.setItem(KEY_PAL, HOUSEHOLD_SETTINGS.currentThemePal);
      }
      applyTheme();
    }
    if (onUpdate) onUpdate(HOUSEHOLD_SETTINGS);
  });
}

/* Persist settings to Firestore */
export async function saveHouseholdSettings(partial){
  try {
    const ref = doc(db, COL.SETTINGS, SETTINGS_DOC);
    await setDoc(ref, Object.assign({}, partial, {
      updatedAt: new Date().toISOString()
    }), { merge: true });
    applyHouseholdSettings(partial);
    return true;
  } catch (e) {
    console.warn('saveHouseholdSettings failed:', e && e.message);
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════
   CONFIRM MODAL — shared helper (creates one if not present)
   ═══════════════════════════════════════════════════════════════ */
export function ensureConfirmModal(){
  if ($('confirm-mo')) return;
  const mo = document.createElement('div');
  mo.className = 'mo';
  mo.id = 'confirm-mo';
  mo.innerHTML = `
    <div class="md">
      <div class="mt" id="confirm-title">⚠️ Confirm</div>
      <div id="confirm-body"></div>
      <div class="mf">
        <button class="btn bg2" id="confirm-cancel">Cancel</button>
        <button class="btn bd" id="confirm-ok-btn">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(mo);

  // Click outside to close
  mo.addEventListener('click', e => {
    if (e.target === mo) mo.classList.remove('open');
  });
  $('confirm-cancel').onclick = () => mo.classList.remove('open');
}

export function showConfirm(title, bodyHtml, okLabel, onOk, okClass){
  ensureConfirmModal();
  const mo = $('confirm-mo');
  $('confirm-title').innerHTML = title;
  $('confirm-body').innerHTML = bodyHtml;
  const ok = $('confirm-ok-btn');
  ok.textContent = okLabel || 'Confirm';
  ok.className = 'btn ' + (okClass || 'bd');
  ok.onclick = async () => {
    mo.classList.remove('open');
    if (onOk) await onOk();
  };
  mo.classList.add('open');
}

/* ═══════════════════════════════════════════════════════════════
   MODAL HELPERS — open / close by id
   ═══════════════════════════════════════════════════════════════ */
export function closeMo(id, ev){
  if (ev && ev.target !== $(id)) return;   // click-outside guard
  const el = $(id);
  if (el) el.classList.remove('open');
}
export function openMo(id){
  const el = $(id);
  if (el) el.classList.add('open');
}

/* ═══════════════════════════════════════════════════════════════
   AUTO-CLEAR HISTORY — deletes entries older than 30 days
   ═══════════════════════════════════════════════════════════════ */
export async function checkAutoClearHistory(){
  // Force the cleanup to run for quota optimization, ignoring the toggle
  // if (!HOUSEHOLD_SETTINGS.autoclearHistory) return; 

  /* Policy: keep only the newest MAX_ENTRIES entries AND only those within
     MAX_AGE_DAYS days. Everything else is deleted. */
  const MAX_ENTRIES = 100;
  const MAX_AGE_DAYS = 7;
  const cutoffMs = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  try {
    /* Fetch ALL history docs (id + timestamp only) so we can find every stale
       entry, not just the first 100. Uses select() to avoid pulling full data. */
    const snap = await getDocs(query(
      collection(db, COL.HISTORY),
      orderBy('timestamp', 'desc')
    ));

    const toDelete = [];

    snap.docs.forEach((d, i) => {
      const data = d.data();

      /* Rule 1: any doc beyond position MAX_ENTRIES is over the entry cap */
      if (i >= MAX_ENTRIES){
        toDelete.push(d.id);
        return;
      }

      /* Rule 2: any doc older than MAX_AGE_DAYS is beyond the age cap */
      if (data.timestamp){
        const t = new Date(data.timestamp).getTime();
        if (!isNaN(t) && t < cutoffMs) toDelete.push(d.id);
      }
    });

    if (!toDelete.length) return;

    for (let i = 0; i < toDelete.length; i += 400){
      const batch = writeBatch(db);
      toDelete.slice(i, i + 400).forEach(id => batch.delete(doc(db, COL.HISTORY, id)));
      await batch.commit();
    }
    console.info(`Auto-pruned ${toDelete.length} history entries (kept newest ${MAX_ENTRIES}, dropped >${MAX_AGE_DAYS} days)`);
  } catch (e) {
    console.warn('Auto-clear history failed:', e && e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS HELPERS — used by all 3 pages' Settings tabs
   ═══════════════════════════════════════════════════════════════ */

/* Change session timeout (used by Settings tab) */
export async function setSessionTimeout(min){
  const v = parseInt(min);
  if (isNaN(v) || v < 1 || v > 1440){
    return { ok: false, message: 'Enter minutes between 1 and 1440.' };
  }
  await saveHouseholdSettings({ sessionMin: v });
  if (isLoggedIn()){
    touchSession();
    resetSessionTimer();
  }
  return { ok: true, message: 'Session timeout set to ' + v + ' min.' };
}

/* Change password — for single-password mode this is disabled,
   but keep the helper for future multi-user support */
export async function setPassword(){
  return { ok: false, message: 'Single-password mode: password is fixed at 1432.' };
}

/* ═══════════════════════════════════════════════════════════════
   HOUSEHOLD TRACKER — Shared JavaScript
   Part 3 of 3 — CRUD, export/import, keyboard, initPage
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   SHARED CRUD HELPERS
   Every write goes through these so notifications + history + pill
   happen consistently on all 3 pages.
   ═══════════════════════════════════════════════════════════════ */

/* Add a document to any collection */
export async function addRecord(collectionName, data, opts){
  opts = opts || {};
  const { pillMsg, pillIcon, historyAction, historyData } = opts;
  setSyncStatus('saving');
  try {
    const ref = await addDoc(collection(db, collectionName), Object.assign({}, data, {
      createdAt: new Date().toISOString()
    }));
    if (pillMsg) pill(pillMsg, pillIcon);
    if (historyAction) await logHistory(historyAction, historyData || data);
    setSyncStatus('live');
    return { ok: true, id: ref.id };
  } catch (e) {
    setSyncStatus('error');
    toast('❌ Save failed: ' + (e.message || e), 'error');
    return { ok: false, error: e };
  }
}

/* Update a document */
export async function updateRecord(collectionName, id, data, opts){
  opts = opts || {};
  const { pillMsg, pillIcon, historyAction, historyData } = opts;
  setSyncStatus('saving');
  try {
    await updateDoc(doc(db, collectionName, id), Object.assign({}, data, {
      updatedAt: new Date().toISOString()
    }));
    if (pillMsg) pill(pillMsg, pillIcon);
    if (historyAction) await logHistory(historyAction, historyData || Object.assign({ id }, data));
    setSyncStatus('live');
    return { ok: true };
  } catch (e) {
    setSyncStatus('error');
    toast('❌ Update failed: ' + (e.message || e), 'error');
    return { ok: false, error: e };
  }
}

/* Delete a document */
export async function deleteRecord(collectionName, id, opts){
  opts = opts || {};
  const { pillMsg, pillIcon, historyAction, historyData } = opts;
  setSyncStatus('saving');
  try {
    await deleteDoc(doc(db, collectionName, id));
    if (pillMsg) pill(pillMsg, pillIcon);
    if (historyAction) await logHistory(historyAction, historyData || { id });
    setSyncStatus('live');
    return { ok: true };
  } catch (e) {
    setSyncStatus('error');
    toast('❌ Delete failed: ' + (e.message || e), 'error');
    return { ok: false, error: e };
  }
}

/* Set a document (used for singletons like prefs) */
export async function setRecord(collectionName, id, data, opts){
  opts = opts || {};
  const { pillMsg, pillIcon } = opts;
  setSyncStatus('saving');
  try {
    await setDoc(doc(db, collectionName, id), data, { merge: true });
    if (pillMsg) pill(pillMsg, pillIcon);
    setSyncStatus('live');
    return { ok: true };
  } catch (e) {
    setSyncStatus('error');
    return { ok: false, error: e };
  }
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT — CSV
   Rows = array of objects, headers = array of column keys
   ═══════════════════════════════════════════════════════════════ */
export function exportCSV(filename, headers, rows){
  if (!rows || !rows.length){
    toast('❌ Nothing to export', 'error');
    return;
  }
  const head = headers.map(h => `"${String(h.label || h.key).replace(/"/g, '""')}"`).join(',');

  const body = rows.map(r => {
    return headers.map(h => {
      const v = typeof h.value === 'function' ? h.value(r) : r[h.key];
      return `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    }).join(',');
  }).join('\r\n');

  const csv = '\ufeff' + head + '\r\n' + body;
  download(filename, csv, 'text/csv;charset=utf-8;');
  pill('CSV exported (' + rows.length + ')', '⬇');
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT — JSON BACKUP
   Payload shape:
   {
     project, exportedAt,
     expenses, categories, history, elecReadings, waterPurchases,
     waterPayModes, rentPayments, birthdays, birthdayPrefs,
     groceryPurchases, groceryItems, groceryList
   }
   ═══════════════════════════════════════════════════════════════ */
export function backupJSON(data, filename){
  const payload = Object.assign({
    project: firebaseConfig.projectId,
    exportedAt: new Date().toISOString()
  }, data);
  const fn = filename || ('household-backup-' + today() + '.json');
  download(fn, JSON.stringify(payload, null, 2), 'application/json');
  pill('Backup downloaded', '🗄️');
  logHistory(ACT.EXPORT, { kind: 'backup', sizes: sizesOf(payload) });
}

function sizesOf(obj){
  const out = {};
  Object.keys(obj).forEach(k => {
    if (Array.isArray(obj[k])) out[k] = obj[k].length;
    else if (obj[k] && typeof obj[k] === 'object') out[k] = Object.keys(obj[k]).length;
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════
   RESTORE — JSON
   Takes a parsed backup object and a map of collection destinations.
   destinations = {
     expenses: 'expenses',
     birthdays: 'birthdays',
     groceryPurchases: 'grocery_purchases',
     ...
   }
   ═══════════════════════════════════════════════════════════════ */
export async function restoreJSON(backup, destinations, opts){
  opts = opts || {};
  const { wipeFirst = false, onProgress } = opts;

  if (!backup || typeof backup !== 'object'){
    toast('❌ Invalid backup object', 'error');
    return { ok: false };
  }

  setSyncStatus('saving');
  const results = {};

  try {
    for (const key of Object.keys(destinations)){
      const collectionName = destinations[key];
      const items = backup[key];
      if (!Array.isArray(items) || !items.length){
        results[key] = 0;
        continue;
      }

      if (onProgress) onProgress(key, 'starting');

      if (wipeFirst){
        await wipeCollection(collectionName);
      }
      const n = await pushCollection(collectionName, items);
      results[key] = n;

      if (onProgress) onProgress(key, 'done', n);
    }

    await logHistory(ACT.IMPORT, { results });
    setSyncStatus('live');
    pill('Backup restored', '📥');
    return { ok: true, results };
  } catch (e) {
    setSyncStatus('error');
    toast('❌ Restore failed: ' + (e.message || e), 'error');
    return { ok: false, error: e };
  }
}

/* File input → backup object */
export function readJSONFile(file){
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No file')); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result);
        resolve(obj);
      } catch (err){
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL BACKUP
   Downloads JSON and opens the default mail client with a template
   ═══════════════════════════════════════════════════════════════ */
export function emailBackup(data, recipient){
  const to = recipient || BACKUP_EMAIL;
  const dateStr = today();

  // First download the file
  const filename = 'household-backup-' + dateStr + '.json';
  backupJSON(data, filename);

  // Then open mailto link
  const subject = encodeURIComponent('Household Tracker Backup — ' + dateStr);
  const body = encodeURIComponent(
    'Household Tracker Backup — ' + dateStr + '\n\n' +
    'Please attach the downloaded file: ' + filename + '\n\n' +
    '— Household Tracker'
  );

  setTimeout(() => {
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }, 600);

  pill('Attach the downloaded file to the email', '📧');
}

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS (universal)
   - `/`   — focus search box (page must have id="global-search")
   - `Esc` — close any open modal
   - `Alt+1/2/3` — switch to Household / Birthday / Grocery
   ═══════════════════════════════════════════════════════════════ */
export function installKeyboardShortcuts(){
  document.addEventListener('keydown', e => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const inField = /INPUT|TEXTAREA|SELECT/.test(tag);

    // Esc — close modals
    if (e.key === 'Escape'){
      document.querySelectorAll('.mo.open').forEach(m => m.classList.remove('open'));
      return;
    }

    // / — focus search
    if (e.key === '/' && !inField){
      const s = $('global-search') || $('r-search') || $('q');
      if (s){ e.preventDefault(); s.focus(); s.select && s.select(); }
      return;
    }

    // Alt + 1/2/3 — jump between pages
    if (e.altKey && !inField){
      if (e.key === '1'){ location.href = 'index.html'; }
      if (e.key === '2'){ location.href = 'Birthday.html'; }
      if (e.key === '3'){ location.href = 'Grocery.html'; }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   MOBILE RESPONSIVENESS HELPERS
   ═══════════════════════════════════════════════════════════════ */
export function isMobile(){ return window.innerWidth < 700; }
export function isDesktop(){ return window.innerWidth >= 900; }

/* Run callback on resize (debounced) */
export function onResize(cb){
  let t = null;
  window.addEventListener('resize', () => {
    if (t) clearTimeout(t);
    t = setTimeout(cb, 200);
  });
}

/* ═══════════════════════════════════════════════════════════════
   TAB SWITCHER — reusable across pages that use .tb / .tp patterns
   ═══════════════════════════════════════════════════════════════ */
export function switchTab(tabId, btnEl){
  document.querySelectorAll('.tp').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('active'));

  const panel = $('tab-' + tabId);
  if (panel) panel.classList.add('active');

  const btn = btnEl || document.querySelector(`.tb[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');

  // Update topbar title
  const titleEl = $('topbar-title');
  if (titleEl && btn && btn.dataset.title){
    titleEl.textContent = btn.dataset.title;
  } else if (titleEl){
    titleEl.textContent = tabId;
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Notify listeners (each page can subscribe)
  if (window.__onTabChange) window.__onTabChange(tabId);
}

/* Wire sidebar tab clicks automatically */
export function installSidebarTabs(){
  const nav = $('side-nav') || document.querySelector('.side-nav');
  if (!nav) return;
  nav.addEventListener('click', e => {
    const btn = e.target.closest('.tb[data-tab]');
    if (!btn) return;
    e.preventDefault();
    switchTab(btn.dataset.tab, btn);
  });
}

/* ═══════════════════════════════════════════════════════════════
   DATE INPUT DEFAULT
   Sets today's date into a date input if empty
   ═══════════════════════════════════════════════════════════════ */
export function fillToday(inputId){
  const el = $(inputId);
  if (el && !el.value) el.value = today();
}

/* ═══════════════════════════════════════════════════════════════
   LISTENERS — Subscribe with cleanup
   Every page uses these instead of raw onSnapshot so nothing leaks.
   ═══════════════════════════════════════════════════════════════ */

/* Store unsubscribers per page so we can clean up on navigation */
const _unsubscribers = [];

export function registerUnsub(fn){
  if (typeof fn === 'function') _unsubscribers.push(fn);
}

export function unregisterAll(){
  while (_unsubscribers.length){
    const fn = _unsubscribers.pop();
    try { fn(); } catch (e) {}
  }
}

/* Convenience: subscribe to a collection and re-run callback on updates */
export function subscribeCollection(collectionName, onData, onError, orderField){
  const coll = collection(db, collectionName);
  const q = orderField ? query(coll, orderBy(orderField, 'desc')) : coll;
  const unsub = onSnapshot(q, snap => {
    const rows = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    try { onData(rows, snap); }
    catch (e) { console.error('Render error:', e); }
  }, err => {
    console.error('Snapshot error [' + collectionName + ']:', err);
    if (onError) onError(err);
  });
  registerUnsub(unsub);
  return unsub;
}

/* Subscribe to a single document (settings-like) */
export function subscribeDocument(collectionName, docId, onData, onError){
  const unsub = onSnapshot(doc(db, collectionName, docId), snap => {
    const data = snap.exists() ? snap.data() : null;
    try { onData(data, snap); }
    catch (e) { console.error('Doc render error:', e); }
  }, err => {
    console.error('Doc snapshot error [' + collectionName + '/' + docId + ']:', err);
    if (onError) onError(err);
  });
  registerUnsub(unsub);
  return unsub;
}

/* ═══════════════════════════════════════════════════════════════
   PAGE INIT — every HTML page calls this once at boot
   Handles: theme, session, header, network, keyboard, settings
   ═══════════════════════════════════════════════════════════════ */
export function initPage(opts){
  opts = opts || {};
  const {
    appName   = 'Household Tracker',
    counters  = [],
    onReady   = null,
    skipLogin = false
  } = opts;

  // 1) Theme first (before paint)
  applyTheme();

  // 2) Network listeners
  installNetworkListeners();

  // 3) Keyboard shortcuts
  installKeyboardShortcuts();

  // 4) Settings listener (theme + sessionMin synced across devices)
  startSettingsListener(() => {
    // Re-apply theme if it changed
    applyTheme();
  });

  // 5) Session install
  installSession(
    (user) => {
      // Successfully logged in or already had a valid session
      const loader = $('loading-overlay');
      if (loader) loader.style.display = 'none';

      // Render header now that we know who the user is
      installHeader({ appName, counters });

      // Firestore heartbeat (session visibility)
      // (handled internally by installSession's heartbeat)

            // Note: LOGIN/LOGOUT are intentionally not logged to history —
      // they were ~90% of the audit log and drowned out actual edits.

      if (onReady) onReady(user);
    },
    (reason) => {
      // Logged out / session expired
      // Show login overlay again
      const overlay = $('login-overlay');
      if (overlay) overlay.style.display = 'flex';
    }
  );

  // 6) Hide boot overlay after short delay in case session gate opens late
  setTimeout(() => {
    const boot = $('boot');
    if (boot) boot.style.display = 'none';
    const loader = $('loading-overlay');
    if (loader && isLoggedIn()) loader.style.display = 'none';
  }, 200);
}

/* ═══════════════════════════════════════════════════════════════
   EXPOSE GLOBALS for inline event handlers in HTML
   (because our HTML files sometimes use inline onclick="")
   ═══════════════════════════════════════════════════════════════ */
window.$          = $;
window.esc        = esc;
window.toast      = toast;
window.pill       = pill;
window.fmt        = fmt;
window.fmtAmt     = fmtAmt;
window.fmt0       = fmt0;
window.fmtDate    = fmtDate;
window.fmtFull    = fmtFull;
window.monthLabel = monthLabel;
window.pmBadge    = pmBadge;
window.switchTab  = switchTab;
window.today      = today;
window.localDateStr = localDateStr;
window.updateDateDayLabel = updateDateDayLabel;
window.download   = download;
window.printLetterhead = printLetterhead;
window.openPrintWindow = openPrintWindow;
window.exportCSV  = exportCSV;
window.backupJSON = backupJSON;
window.emailBackup = emailBackup;
window.showConfirm = showConfirm;
window.dataSaved  = dataSaved;
window.dataUpdated = dataUpdated;
window.dataDeleted = dataDeleted;
window.closeMo = closeMo;
window.openMo  = openMo;
window.checkAutoClearHistory = checkAutoClearHistory;

/* ═══════════════════════════════════════════════════════════════
   END OF app.js
   ═══════════════════════════════════════════════════════════════ */

console.log('✅ Household Tracker shared module loaded');
