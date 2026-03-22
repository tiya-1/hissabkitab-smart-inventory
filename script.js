// script.js - Hissab-Kitab (Single-file merged + UI fixes)


import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  getDocs,
  query,
  orderBy,
  setDoc,
  getDoc,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import { getAuth, updatePassword } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

/* ========== Firebase config (unchanged) ========== */
const firebaseConfig = {
  apiKey: "AIzaSyA0LV2WtmmuutTVulTXlTo8F3ZRoqV90Rw",
  authDomain: "smart-inventory-61554.firebaseapp.com",
  projectId: "smart-inventory-61554",
  storageBucket: "smart-inventory-61554.firebasestorage.app",
  messagingSenderId: "468463129466",
  appId: "1:468463129466:web:844f0821d10048574dfcc3",
  measurementId: "G-RVFX83QPZG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth ? getAuth(app) : null;

/* Collections (unchanged) */
const inventoryCol = collection(db, "inventory");
const usersCol = collection(db, "users");
const logsCol = collection(db, "activity_logs");

/* Local state */
let inventory = [];
let currentUserLoggedIn = localStorage.getItem("isLoggedIn") === "true";
let currentUserId = localStorage.getItem("currentUserId") || null;
let currentUserRole = localStorage.getItem("currentUserRole") || null;
let barChart = null;
let pieChart = null;
let trendingChart = null;
let activeHtml5QrScanner = null; // kept for compatibility but not used for file based scanning

/* Helpers */
function uidFromUsername(username){ return `local-${username}`; }
function escapeHtml(s){ return (s+"").replace(/[&<>\"'`]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","`":"&#96;" }[c])); }

async function createUserProfile(uid,email,role){
  const ref = doc(db,"users",uid);
  const snap = await getDoc(ref);
  if(!snap.exists()) await setDoc(ref,{ email, role });
  else { const data = snap.data(); if(!data.role) await setDoc(ref,{ ...data, role },{ merge:true }); }
}
async function getUserRole(uid){ if(!uid) return null; const ref = doc(db,"users",uid); const snap = await getDoc(ref); return snap.exists()? snap.data().role : null; }
async function logAction(action, meta = {}){ try{ await addDoc(logsCol, { userId: currentUserId||"anon", role: currentUserRole||"unknown", action, meta, timestamp: Date.now() }); } catch(e){ console.error("logAction error",e); } }

/* Simple permission helper (UI only) */
// function hasPermission(op){
//   // op: 'add', 'edit', 'delete', 'download', 'view'
//   if(currentUserRole === 'admin') return true;
//   if(currentUserRole === 'staff') return (op !== 'delete');
//   if(currentUserRole === 'viewer') return (op === 'download' || op === 'view');
//   return false;
// }
/* Simple permission helper (UI only) */
function hasPermission(op){
  // op: 'add', 'edit', 'delete', 'download', 'view'
  if(currentUserRole === 'admin') return true; // admin can do everything
  if(currentUserRole === 'staff') {
    return op === 'add' || op === 'view'; // staff can only add or view
  }
  if(currentUserRole === 'viewer') {
    return op === 'view' || op === 'download'; // viewer only view/download
  }
  return false; // fallback: no permissions
}
/**




/* Local demo password store for non-Firebase demo users (does not change Firestore structure) */
function _getLocalPasswords(){ try{ return JSON.parse(localStorage.getItem('hissab_local_passwords')||'{}'); }catch(e){ return {}; } }
function _setLocalPassword(uid, pwd){ const m = _getLocalPasswords(); m[uid] = pwd; localStorage.setItem('hissab_local_passwords', JSON.stringify(m)); }

/* Seed sample if empty */
async function seedSampleIfEmpty(){
  const snap = await getDocs(query(inventoryCol, orderBy("__name__")));
  if(snap.empty){
    const samples = [
      { name: "Tea", quantity: 12, threshold: 5, sales: [10,12,7], price: 15, imageUrl: "" },
      { name: "Coffee", quantity: 6, threshold: 10, sales: [5,8,4], price: 25, imageUrl: "" },
      { name: "Sugar", quantity: 30, threshold: 8, sales: [12,10,6], price: 40, imageUrl: "" },
      { name: "Notebook", quantity: 50, threshold: 15, sales: [20,15,8], price: 20, imageUrl: "" },
    ];
    for(const s of samples){ const docRef = await addDoc(inventoryCol,s); await logAction("Seeded item",{ id: docRef.id, name: s.name }); }
  }
}

/* Realtime listener */
function initRealtimeListener(){
  const q = query(inventoryCol, orderBy("name"));
  onSnapshot(q, snapshot => {
    inventory = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // update UI pages if present
    if(currentUserLoggedIn){
      updateLowStockBadge();
      const contentRoot = document.getElementById("content");
      if(contentRoot){
        if(document.getElementById("dashboard")) renderDashboard();
        else if(document.getElementById("stocks")) renderStocks();
        else if(document.getElementById("analysis")) renderAnalysis();
        else if(document.getElementById("settings")) renderSettings();
        else if(document.getElementById("alerts")) renderAlerts();
        else if(document.getElementById("qrhub")) renderQRHub();
        else if(document.getElementById("reports")) renderReports();
      }

      // ---------- Low-stock alert check ----------
      checkLowStockAlerts();
    }
  }, err => console.error("Realtime listener error:", err));
}

// Keep a set to avoid repeated alerts
const alertedItems = new Set();

function checkLowStockAlerts() {
  inventory.forEach(item => {
    const qty = item.quantity ?? 0;
    const th = item.threshold ?? 10;

    if(qty <= th && !alertedItems.has(item.id)) {
      // Show UI alert
      alert(`⚠️ Low Stock Alert: ${item.name} has ${qty} left (threshold: ${th})`);

      // Optional: log it
      logAction("Low Stock Alert Triggered", { id: item.id, name: item.name, quantity: qty });

      // Mark as alerted
      alertedItems.add(item.id);
    }

    // Remove from alerted set if stock is back above threshold
    if(qty > th && alertedItems.has(item.id)) {
      alertedItems.delete(item.id);
    }
  });
}


/* Mount helper */
function mountRoot(html){ document.getElementById("app").innerHTML = html; }

/* --- Login --- */
function renderLoginScreen(){
  const html = `
  <div class="login-screen">
    <div class="login-card">
      <div class="login-illustration"> 
         <img src="https://toppng.com/uploads/thumbnail/301-x-251-png-3kb-inventory-control-icon-images-inventory-icon-png-blue-11562937718hmfr3gqjsz.png" />
        </div>

      <div class="login-form">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="brand"><div class="logo">H</div> <div style="font-weight:900">Hissab-Kitab</div></div>
        </div>
        <h2>Sign in to Hissab-Kitab</h2>
        <p>Manage inventory, reports and alerts — securely and simply.</p>

        <input id="loginUser" class="input" placeholder="Username" value="admin" />
        <input id="loginPass" class="input" placeholder="Password" type="password" value="password" />
        <div style="display:flex; gap:10px; align-items:center;">
          <select id="loginRole" class="input" style="min-width:120px;">
            <option value="admin" selected>Admin</option>
            <option value="staff">Staff</option>
            <option value="viewer">Viewer</option>
          </select>
          <button id="loginBtn" class="btn primary">Sign in</button>
        </div>
        <div style="display:flex; gap:10px; margin-top:12px;">
          <button id="signupBtn" class="btn ghost">Sign up</button>
          <button id="helpBtn" class="btn ghost">Help</button>
        </div>
        <p style="color:var(--muted); font-size:0.9rem; margin-top:10px">Demo: use <strong>admin</strong>/<strong>password</strong></p>
      </div>
    </div>
  </div>
  `;
  mountRoot(html);

  document.getElementById("loginBtn").addEventListener("click", async ()=>{
    const u = document.getElementById("loginUser").value.trim();
    const p = document.getElementById("loginPass").value.trim();
    const roleSelection = document.getElementById("loginRole").value;
    if((u === "admin" && p === "password") || u.length > 0){
      const uid = uidFromUsername(u);
      await createUserProfile(uid, u + "@local", roleSelection);
      const role = await getUserRole(uid);
      localStorage.setItem("isLoggedIn","true");
      localStorage.setItem("currentUserId", uid);
      localStorage.setItem("currentUserRole", role);
      currentUserLoggedIn = true; currentUserId = uid; currentUserRole = role;
      // Save demo password locally so change-password works in demo
      const localPwds = _getLocalPasswords(); if(!localPwds[uid]) _setLocalPassword(uid, p || "password");
      await logAction("User logged in",{ username:u, role });
      await seedSampleIfEmpty();
      initRealtimeListener();
      renderApp();
    } else alert("Invalid credentials (try admin / password)");
  });

  document.getElementById("signupBtn").addEventListener("click", ()=> alert("Signup flow not implemented in demo — use login"));
  document.getElementById("helpBtn").addEventListener("click", ()=> alert("Contact your project maintainer for help."));
}

/* Header */
function headerHtml(){
  // profile button removed per UI request; search box added
  return `
  <div class="header">
    <div class="brand"><div class="logo">H</div> Hissab-Kitab</div>
    <div style="flex:1;margin:0 14px">
      <input id="globalSearch" class="input" placeholder="Search items by id, name, qty, price, threshold..." />
    </div>
    <div class="navlinks">
      <a id="nav-dashboard"><i class="material-icons">dashboard</i> Dashboard <span id="lowBadge"></span></a>
      <a id="nav-stocks"><i class="material-icons">inventory_2</i> Stocks</a>
      <a id="nav-analysis"><i class="material-icons">analytics</i> Analytics</a>
      <a id="nav-qr"><i class="material-icons">qr_code_scanner</i> QR Hub</a>
      <a id="nav-reports"><i class="material-icons">file_download</i> Reports</a>
      <a id="nav-alerts"><i class="material-icons">notifications</i> Alerts</a>
      <a id="nav-settings"><i class="material-icons">settings</i> Settings</a>
      <div style="width:12px"></div>
      <div class="nav-cta">
        <button class="btn primary" id="nav-logout">Logout</button>
      </div>
    </div>
  </div>
  `;
}

/* App render */
function renderApp(){
  (async ()=>{ if(!currentUserRole && currentUserId){ currentUserRole = await getUserRole(currentUserId); localStorage.setItem("currentUserRole", currentUserRole); }})();

  const html = `${headerHtml()}<div class="container" id="container"><div id="content"></div></div>`;
  mountRoot(html);

  // attach nav
  document.getElementById("nav-dashboard").addEventListener("click", ()=> { setActiveNav("nav-dashboard"); renderDashboard(); });
  document.getElementById("nav-stocks").addEventListener("click", ()=> { setActiveNav("nav-stocks"); renderStocks(); });
  document.getElementById("nav-analysis").addEventListener("click", ()=> { setActiveNav("nav-analysis"); renderAnalysis(); });
  document.getElementById("nav-qr").addEventListener("click", ()=> { setActiveNav("nav-qr"); renderQRHub(); });
  document.getElementById("nav-reports").addEventListener("click", ()=> { setActiveNav("nav-reports"); renderReports(); });
  document.getElementById("nav-alerts").addEventListener("click", ()=> { setActiveNav("nav-alerts"); renderAlerts(); });
  document.getElementById("nav-settings").addEventListener("click", ()=> { setActiveNav("nav-settings"); renderSettings(); });

  document.getElementById("nav-logout").addEventListener("click", async ()=> {
    await logAction("User logged out");
    localStorage.removeItem("isLoggedIn"); localStorage.removeItem("currentUserId"); localStorage.removeItem("currentUserRole");
    currentUserLoggedIn = false; currentUserId = null; currentUserRole = null;
    render();
  });

  // global search wiring
  const searchInp = document.getElementById('globalSearch');
  if(searchInp){
    let to = null;
    searchInp.addEventListener('input', ()=>{
      clearTimeout(to); to = setTimeout(()=> performSearch(searchInp.value.trim()), 160);
    });
    searchInp.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ performSearch(searchInp.value.trim(), true); } });
  }

  renderDashboard();
}

/* Nav active highlight */
function setActiveNav(id){
  const links = document.querySelectorAll(".navlinks a");
  links.forEach(a => a.classList.remove("active"));
  const el = document.getElementById(id);
  if(el) el.classList.add("active");
}

/* ---------- Search ---------- */
/* ---------- Search (FINAL — Solid Black Border) ---------- */
function performSearch(q, openFull = false) {

  // remove box if search is empty
  if (!q || q.trim() === "") {
    document.getElementById("searchResultsBox")?.remove();
    return;
  }

  // Create search results box
  let box = document.getElementById("searchResultsBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "searchResultsBox";

    Object.assign(box.style, {
      position: "fixed",
      right: "20px",
      top: "80px",
      width: "380px",
      maxHeight: "60vh",
      overflowY: "auto",
      background: "white",
      padding: "12px",
      borderRadius: "12px",

      /* 🔥 PURE BLACK BORDER */
      border: "2px solid #000",

      boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      zIndex: 999999,
      transition: "all 0.2s ease"
    });

    document.body.appendChild(box);
  }

  const low = q.toLowerCase();

  const matches = inventory.filter(item =>
    (item.id && item.id.toLowerCase().includes(low)) ||
    (item.name && item.name.toLowerCase().includes(low)) ||
    String(item.quantity ?? "").includes(low) ||
    String(item.price ?? "").includes(low) ||
    String(item.threshold ?? "").includes(low)
  ).slice(0, 25);

  if (matches.length === 0) {
    box.innerHTML = `
      <div style="padding:10px;color:#777;font-size:0.95rem;">
        No results for <b>${escapeHtml(q)}</b>
      </div>`;
    return;
  }

  box.innerHTML = matches.map(m => `
    <div style="
      padding: 10px 6px;
      border-bottom: 1px dashed rgba(0,0,0,0.1);
      display:flex;
      justify-content:space-between;
      align-items:center;
    ">
      <div style="flex:1;margin-right:10px;">
        <div style="font-weight:700">${escapeHtml(m.name)}
          <span style="color:#777;font-size:0.85rem">(${escapeHtml(m.id)})</span>
        </div>
        <div style="color:#666;font-size:0.9rem">
          Qty: ${m.quantity} • Price: ₹${m.price ?? 0} • Th: ${m.threshold ?? "-"}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn-gradient"
          onclick="(function(){
            document.getElementById('searchResultsBox')?.remove();
            window.viewDetails('${m.id}');
          })()">View</button>

        <button class="btn ghost"
          onclick="(function(){
            navigator.clipboard?.writeText(JSON.stringify({
              id:'${m.id}', name:'${escapeHtml(m.name)}',
              qty:${m.quantity}, price:${m.price}
            }));
            alert('Copied!');
          })()">Copy</button>
      </div>
    </div>
  `).join("");

  if (openFull && matches[0]) {
    document.getElementById("searchResultsBox")?.remove();
    window.viewDetails(matches[0].id);
  }
}



// document.addEventListener("click", (e) => {
//   const box = document.getElementById("searchResultsBox");
//   if (!box) return;
//   if (!box.contains(e.target) && e.target.id !== "searchInput") {
//     box.remove();
//   }
// });

/* ---------- Dashboard ---------- */
function renderDashboard(){
  setActiveNav("nav-dashboard");
  const totalItems = inventory.length;
  const lowStock = inventory.filter(i => (i.quantity ?? 0) <= (i.threshold ?? 10)).length;
  const totalValue = inventory.reduce((s,i)=> s + ((i.price ?? 0) * (i.quantity ?? 0)), 0);
  const topSelling = inventory.map(i => ({ name:i.name, totalSales:(i.sales||[]).reduce((a,b)=>a+b,0) })).sort((a,b)=>b.totalSales-a.totalSales)[0]?.name || "None";

  // role-specific quick actions
  const canManage = hasPermission('add');
  const canDownload = hasPermission('download');

  const html = `
    <div id="dashboard">
      <h2>Hissab-Kitab Dashboard</h2>
      <div class="stats">
        <div class="card"><h4>Total Items</h4><div class="value">${totalItems}</div></div>
        <div class="card"><h4>Low Stock</h4><div class="value">${lowStock}</div></div>
        <div class="card"><h4>Total Value</h4><div class="value">₹ ${totalValue}</div></div>
        <div class="card"><h4>Top Selling</h4><div class="value">${escapeHtml(topSelling)}</div></div>
      </div>

      <div class="chart-area">
        <div class="chart-panel">
          <h4>Inventory Quantities</h4>
          <canvas id="barChart"></canvas>
        </div>

        <div class="chart-panel">
          <h4>Quick Actions</h4>
          <div class="actions">
            ${canManage?'<button class="btn-gradient" id="goto-stocks"><i class="fas fa-boxes"></i>&nbsp; Manage Stocks</button>':''}
            <button class="btn-gradient" id="goto-analysis"><i class="fas fa-chart-line"></i>&nbsp; View Analysis</button>
            ${canDownload?'<button class="btn-gradient" id="btnPdf"><i class="fas fa-file-pdf"></i>&nbsp; Download PDF</button>':''}
            ${canDownload?'<button class="btn-gradient" id="btnExcel"><i class="fas fa-file-excel"></i>&nbsp; Download Excel</button>':''}
            <button class="btn-gradient" id="btnScan"><i class="fas fa-qrcode"></i>&nbsp; Manual Scan</button>
          </div>
          <div style="margin-top:16px">
            <h4>Recent Activities</h4>
            <ul id="recentList" style="color:var(--muted);margin-top:8px"></ul>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:18px;margin-top:18px;flex-wrap:wrap">
        <div class="card" style="flex:1 1 620px; min-width:320px">
          <h4>Top 5 Items (By Quantity)</h4>
          <div id="top5List" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px"></div>
          <div style="margin-top:16px">
            <h4>Inventory Activity Feed</h4>
            <div id="activityFeed" style="color:var(--muted);margin-top:8px"></div>
          </div>
        </div>

        <div class="card" style="width:360px;">
          <h4>Trending Items</h4>
          <div id="trendingArea" style="margin-top:12px;">
            <canvas id="trendingChart" width="320" height="200"></canvas>
            <div id="trendingList" style="margin-top:10px"></div>
          </div>
        </div>
      </div>

      <div style="margin-top:28px">
        <div class="card">
          <h4>Detailed Inventory Table</h4>
          <div style="margin-top:12px">
            <table class="table">
              <thead><tr><th>Name</th><th>Qty</th><th>Threshold</th><th>Price</th></tr></thead>
              <tbody>
                ${inventory.map(it=>`<tr><td>${escapeHtml(it.name)}</td><td>${it.quantity}</td><td>${it.threshold ?? '-'}</td><td>₹ ${it.price ?? 0}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById("content").innerHTML = html;

  // actions
  if(canManage) document.getElementById("goto-stocks").addEventListener("click", ()=> renderStocks());
  document.getElementById("goto-analysis").addEventListener("click", ()=> renderAnalysis());
  if(canDownload) document.getElementById("btnPdf").addEventListener("click", async ()=> { await generatePDFReport(); await logAction("Exported PDF report"); });
  if(canDownload) document.getElementById("btnExcel").addEventListener("click", async ()=> { generateExcelReport(); await logAction("Exported Excel report"); });
  document.getElementById("btnScan").addEventListener("click", ()=> openManualScanModal());

  renderBarChart();
  renderRecentActivities();
  renderTop5List();
  renderTrendingChart();
  updateLowStockBadge();
}

/* Charts and small components: renderBarChart, renderTrendingChart etc. */
function renderBarChart(){
  const ctx = document.getElementById("barChart")?.getContext("2d");
  if(!ctx) return;
  const labels = inventory.map(i => i.name);
  const data = inventory.map(i => i.quantity ?? 0);
  if(barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Quantity", data, backgroundColor: labels.map(()=> 'rgba(63,81,181,0.9)') }] },
    options: { responsive:true, plugins:{ legend:{ display:false } } }
  });
}

async function renderRecentActivities(){
  const feed = document.getElementById("activityFeed");
  const listEl = document.getElementById("recentList");
  try{
    const q = query(logsCol, orderBy("timestamp"), limit(6));
    const snaps = await getDocs(q);
    const rows = [];
    const feedRows = [];
    snaps.forEach(s => {
      const d = s.data();
      const t = new Date(d.timestamp).toLocaleString();
      rows.push(`<li>${t} — ${escapeHtml(d.userId)} — ${escapeHtml(d.action)}</li>`);
      feedRows.push(`<div style="padding:8px 0;border-bottom:1px dashed rgba(0,0,0,0.04)"><strong>${escapeHtml(d.action)}</strong><div style="color:var(--muted);font-size:0.85rem">${t} • ${escapeHtml(d.userId)}</div></div>`);
    });
    if(listEl) listEl.innerHTML = rows.join("") || "<li>No recent activities</li>";
    if(feed) feed.innerHTML = feedRows.join("") || "<div>No activity</div>";
  } catch(e){
    if(listEl) listEl.innerHTML = inventory.slice(-5).reverse().map(i => `<li>Item: ${i.name} — Qty: ${i.quantity}</li>`).join("") || "<li>No recent activities</li>";
    if(feed) feed.innerHTML = "<div>No activity</div>";
  }
}

function renderTop5List(){
  const container = document.getElementById("top5List");
  const items = [...inventory].sort((a,b)=> (b.quantity ?? 0) - (a.quantity ?? 0)).slice(0,5);
  container.innerHTML = items.map(i => `
    <div class="card" style="min-width:140px;padding:12px;">
      <div style="font-weight:800">${escapeHtml(i.name)}</div>
      <div style="color:var(--muted)">Qty: ${i.quantity}</div>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button class="btn-gradient" onclick="window.generateQR('${i.id}','${escapeHtml(i.name)}', ${i.quantity})"><i class="fas fa-qrcode"></i>&nbsp; Generate QR</button>
        <button class="btn-gradient" onclick="window.openItemScan('${i.id}','${escapeHtml(i.name)}')"><i class="fas fa-eye"></i>&nbsp; View Details</button>
      </div>
    </div>
  `).join("") || "<div>No items</div>";
}

function renderTrendingChart(){
  const ctx = document.getElementById("trendingChart")?.getContext("2d");
  if(!ctx) return;
  const scored = inventory.map(i => ({ name:i.name, score: ( (i.sales||[]).reduce((a,b)=>a+b,0) || 0) + 0.2*(i.quantity||0) }));
  scored.sort((a,b)=>b.score-a.score);
  const top = scored.slice(0,5);
  const labels = top.map(t=>t.name);
  const data = top.map(t=>Math.round(t.score));
  if(trendingChart) trendingChart.destroy();
  trendingChart = new Chart(ctx, { type:"bar", data:{ labels, datasets:[{ label:"Trending score", data, backgroundColor: labels.map(()=> 'rgba(111,140,255,0.95)') }] }, options:{ responsive:true, plugins:{ legend:{ display:false }, tooltip:{ mode:'index' } } } });

  const list = document.getElementById("trendingList");
  if(list){
    list.innerHTML = top.map(t=> `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed rgba(0,0,0,0.04)"><strong>${escapeHtml(t.name)}</strong><span style="color:var(--muted)">${Math.round(t.score)}</span></div>`).join("");
  }
}

/* ---------- Stocks view ---------- */
function renderStocks(){
  setActiveNav("nav-stocks");
  const html = `
    <div id="stocks">
      <div class="panel card">
        <h3>Manage Stocks</h3>
        <div class="form-row" style="margin-top:12px">
          <input id="f-name" class="input" placeholder="Name" />
          <input id="f-qty" class="input" type="number" placeholder="Quantity" />
          <input id="f-th" class="input" type="number" placeholder="Threshold" />
          <input id="f-price" class="input" type="number" placeholder="Price (₹)" />
          <button class="btn-gradient" id="addBtn"><i class="fas fa-plus"></i>&nbsp; Add Item</button>
        </div>

        <div class="panel" style="padding:10px; margin-top:12px;">
          <table class="table" id="stocksTable" role="grid">
            <thead>
              <tr><th>Name</th><th>Quantity</th><th>Threshold</th><th>Price</th><th>Total Value</th><th>Actions</th></tr>
            </thead>
            <tbody id="stocksBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.getElementById("content").innerHTML = html;

  document.getElementById("addBtn").addEventListener("click", async ()=>{
    const name = document.getElementById("f-name").value.trim();
    const qty = parseInt(document.getElementById("f-qty").value || "0");
    const th = parseInt(document.getElementById("f-th").value || "0");
    const price = parseFloat(document.getElementById("f-price").value || "0") || 0;
    if(!name) return alert("Enter item name");
    if(!hasPermission('add')) return alert("You don't have permission to add items.");
    const docRef = await addDoc(inventoryCol, { name, quantity: qty, threshold: th, sales: [], price, imageUrl: "" });
    await logAction("Added Product", { id: docRef.id, name, qty, threshold: th, price });
    document.getElementById("f-name").value = ""; document.getElementById("f-qty").value = ""; document.getElementById("f-th").value = ""; document.getElementById("f-price").value = "";
  });

  drawStocksTable();
}

function drawStocksTable(){
  const tbody = document.getElementById("stocksBody");
  if(!tbody) return;
  tbody.innerHTML = inventory.map(item => {
    const lowClass = (item.quantity <= (item.threshold ?? 10)) ? "low-stock": "";
    const deleteBtn = (currentUserRole === "admin") ? `<button class="btn-danger" onclick="window.deleteItem('${item.id}')"><i class="fas fa-trash"></i>&nbsp; Delete</button>` : '';
    const editBtn = (currentUserRole === "viewer") ? '' : `<button class="btn-gradient" onclick="window.editItem('${item.id}')"><i class="fas fa-edit"></i>&nbsp; Edit</button>`;
    const totalValue = (item.quantity||0) * (item.price||0);
    return `
      <tr class="${lowClass}">
        <td>${escapeHtml(item.name)}</td>
        <td>${item.quantity}</td>
        <td>${item.threshold ?? "-"}</td>
        <td>₹ ${item.price ?? 0}</td>
        <td>₹ ${totalValue}</td>
        <td style="display:flex;gap:8px;">${editBtn} ${deleteBtn} <button class="btn-gradient" onclick="window.generateQR('${item.id}','${escapeHtml(item.name)}', ${item.quantity})"><i class="fas fa-qrcode"></i>&nbsp; QR</button></td>
      </tr>
    `;
  }).join("");
}

/* Inline handlers (kept names) */
window.editItem = async function(id){
  const item = inventory.find(i => i.id === id);
  if(!item) return;
  showEditModal(item);
};
window.deleteItem = async function(id){
  if(currentUserRole !== "admin") return alert("Only admin can delete items.");
  if(!confirm("Delete this item?")) return;
  await deleteDoc(doc(db,"inventory",id));
  await logAction("Deleted Product",{ id });
};

/* Edit modal (price added) */
function showEditModal(item){
  const modalHtml = `
    <div class="modal active" id="modalRoot">
      <div class="modal-box">
        <button class="close-x" id="closeEdit">✕</button>
        <h4>Edit Item</h4>
        <input id="m-name" class="input" value="${escapeHtml(item.name)}" />
        <input id="m-qty" class="input" type="number" value="${item.quantity}" />
        <input id="m-th" class="input" type="number" value="${item.threshold ?? 0}" />
        <input id="m-price" class="input" type="number" value="${item.price ?? 0}" />
        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px">
          <button class="btn-gradient" id="saveEdit">Save</button>
          <button class="btn ghost" id="cancelEdit" style="background:#f3f4f6;color:var(--text)">Cancel</button>
        </div>
      </div>
    </div>
  `;
  const container = document.getElementById("content");
  container.insertAdjacentHTML("beforeend", modalHtml);
  document.getElementById("closeEdit").addEventListener("click", ()=> document.getElementById("modalRoot")?.remove());
  document.getElementById("cancelEdit").addEventListener("click", ()=> document.getElementById("modalRoot")?.remove());
  document.getElementById("saveEdit").addEventListener("click", async ()=>{
    const name = document.getElementById("m-name").value.trim();
    const qty = parseInt(document.getElementById("m-qty").value || "0");
    const th = parseInt(document.getElementById("m-th").value || "0");
    const price = parseFloat(document.getElementById("m-price").value || "0") || 0;
    if(!hasPermission('edit')) return alert("You don't have permission to update.");
    const old = { name: item.name, quantity: item.quantity, threshold: item.threshold, price: item.price };
    await updateDoc(doc(db,"inventory",item.id), { name, quantity: qty, threshold: th, price });
    await logAction("Updated Product",{ id: item.id, before: old, after: { name, quantity: qty, threshold: th, price } });
    document.getElementById("modalRoot")?.remove();
  });
}

/* ---------- Analysis ---------- */
function renderAnalysis(){
  setActiveNav("nav-analysis");
  const html = `
    <div id="analysis">
      <div class="panel">
        <h3>Analysis</h3>
        <div class="chart-area">
          <div class="chart-panel"><h4>Inventory Distribution</h4><canvas id="pieChart"></canvas></div>
          <div class="chart-panel"><h4>Sales Trends</h4><canvas id="lineChart"></canvas></div>
        </div>
      </div>
    </div>
  `;
  document.getElementById("content").innerHTML = html;
  drawPieChart(); drawLineChart();
}
function drawPieChart(){
  const ctx = document.getElementById("pieChart")?.getContext("2d");
  if(!ctx) return;
  const labels = inventory.map(i=>i.name); const data = inventory.map(i=>i.quantity ?? 0);
  if(pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, { type:"pie", data:{ labels, datasets:[{ data, backgroundColor: labels.map(()=> '#' + Math.floor(Math.random()*16777215).toString(16)) }] }, options:{ responsive:true } });
}
function drawLineChart(){
  const ctx = document.getElementById("lineChart")?.getContext("2d");
  if(!ctx) return;
  const labels = ["Wk1","Wk2","Wk3"];
  const datasets = inventory.map(i=> ({ label:i.name, data:(i.sales && i.sales.length===3)? i.sales : [ (i.sales||[])[0]||5,(i.sales||[])[1]||8,(i.sales||[])[2]||10 ], borderColor:'#'+Math.floor(Math.random()*16777215).toString(16), fill:false }));
  new Chart(ctx, { type:"line", data:{ labels, datasets }, options:{ responsive:true } });
}

/* Low-stock badge */
function updateLowStockBadge(){
  const low = inventory.filter(i=> (i.quantity ?? 0) <= (i.threshold ?? 10)).length;
  const badgeRoot = document.getElementById("lowBadge");
  if(!badgeRoot) return;
  badgeRoot.innerHTML = low>0 ? `<span class="badge">${low}</span>` : "";
}

/* ---------- Alerts page ---------- */
async function renderAlerts(){
  setActiveNav("nav-alerts");
  const html = `
    <div id="alerts">
      <h3>Alerts</h3>
      <div id="alertsList" style="margin-top:12px;"></div>
    </div>
  `;
  document.getElementById("content").innerHTML = html;
  const list = document.getElementById("alertsList");
  const lowItems = inventory.filter(i => (i.quantity ?? 0) <= (i.threshold ?? 10));
  if(lowItems.length === 0){
    list.innerHTML = `<div class="card"><div style="color:var(--muted)">No alerts right now.</div></div>`;
    updateLowStockBadge();
    return;
  }
  list.innerHTML = lowItems.map(it => `
    <div class="alert-card" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:800">${escapeHtml(it.name)}</div>
        <div style="color:var(--muted)">Qty: ${it.quantity} • Threshold: ${it.threshold}</div>
      </div>
      <div style="display:flex;gap:8px; align-items:center">
        <button class="btn-gradient" onclick="(async ()=>{ await logAction('Snoozed alert',{ id:'${it.id}' }); this.closest('.alert-card').style.opacity=0.6; setTimeout(()=> this.closest('.alert-card').remove(), 300); })()">Snooze</button>
        <button class="btn-danger" onclick="(async ()=>{ await logAction('Dismissed alert',{ id:'${it.id}' }); this.closest('.alert-card').remove(); updateLowStockBadge(); })()">Dismiss</button>
      </div>
    </div>
  `).join("");
  updateLowStockBadge();
}

/* ---------- Reports page ---------- */
function renderReports(){
  setActiveNav("nav-reports");
  const html = `
    <div id="reports">
      <div class="reports-head">
        <h3>Reports</h3>
        <div style="display:flex;gap:8px">
          <button class="btn-gradient" id="downloadMonthly">Download Monthly Report (PDF)</button>
          <button class="btn-gradient" id="downloadCustom">Download Custom Report</button>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <h4>Past Downloads</h4>
        <div class="reports-list" style="margin-top:10px">
          <table>
            <thead><tr><th>File</th><th>Date</th><th>Action</th></tr></thead>
            <tbody id="reportsTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.getElementById("content").innerHTML = html;

  document.getElementById("downloadMonthly").addEventListener("click", async ()=>{
    await generatePDFReport(); await logAction("Downloaded monthly report");
    addReportRow(`inventory-monthly-${new Date().toISOString()}.pdf`);
  });
  document.getElementById("downloadCustom").addEventListener("click", async ()=>{
    const from = prompt("From date (YYYY-MM-DD):"); const to = prompt("To date (YYYY-MM-DD):");
    if(!from || !to) return alert("Dates required");
    await generatePDFReport(); await logAction("Downloaded custom report", { from, to });
    addReportRow(`inventory-${from}-to-${to}.pdf`);
  });

  // load past downloads from localStorage (simple)
  const rows = JSON.parse(localStorage.getItem("hissab_reports") || "[]");
  const tbody = document.getElementById("reportsTableBody");
  tbody.innerHTML = rows.map(r => `<tr><td>${escapeHtml(r.file)}</td><td>${escapeHtml(new Date(r.when).toLocaleString())}</td><td><button class="btn-gradient" onclick="alert('Download simulated')">Download</button></td></tr>`).join("") || `<tr><td colspan="3" style="color:var(--muted)">No reports</td></tr>`;
}

function addReportRow(filename){
  const rows = JSON.parse(localStorage.getItem("hissab_reports") || "[]");
  rows.unshift({ file: filename, when: Date.now() });
  localStorage.setItem("hissab_reports", JSON.stringify(rows.slice(0,20)));
  renderReports();
}

/* ---------- QR Hub (file/paste based scanning) ---------- */
function renderQRHub(){
  setActiveNav("nav-qr");
  const html = `
    <div id="qrhub">
      <h3>QR Hub</h3>
      <p style="color:var(--muted)">Generate QR for items, view details or scan/upload a QR image (manual paste supported).</p>
      <div class="qr-grid" id="qrGrid"></div>
    </div>
  `;
  document.getElementById("content").innerHTML = html;
  const grid = document.getElementById("qrGrid");
  if(!grid) return;
  grid.innerHTML = inventory.map(it => `
    <div class="qr-item">
       
      <div style="font-weight:800">${escapeHtml(it.name)}</div>
      <div style="color:var(--muted)">Qty: ${it.quantity}</div>
      <div style="color:var(--muted)">Price: ₹ ${it.price ?? 0}</div>
      <div style="color:var(--muted)">Total: ₹ ${(it.quantity||0)*(it.price||0)}</div>
      <div style="display:flex;gap:8px;margin-top:8px;width:100%;justify-content:center;flex-wrap:wrap;">
        <button class="btn-gradient" onclick="window.generateQR('${it.id}','${escapeHtml(it.name)}', ${it.quantity})"><i class="fas fa-qrcode"></i>&nbsp; Generate QR</button>
        <button class="btn-gradient" onclick="window.viewDetails('${it.id}')"><i class="fas fa-eye"></i>&nbsp; View Details</button>
        <button class="btn-gradient" onclick="window.openItemScan('${it.id}','${escapeHtml(it.name)}')"><i class="fas fa-upload"></i>&nbsp; Scan/Upload</button>
      </div>
    </div>
  `).join("") || `<div style="color:var(--muted)">No items</div>`;
}

window.viewDetails = function(id){
  const it = inventory.find(x=>x.id===id);
  if(!it) return alert('Item not found');
  const html = `
    <div class="modal active" id="modalDetail">
      <div class="modal-box">
        <button class="close-x" id="closeDetail">✕</button>
        <h4>${escapeHtml(it.name)}</h4>
        <div style="color:var(--muted)">Quantity: ${it.quantity}</div>
        <div style="color:var(--muted)">Price: ₹ ${it.price}</div>
        <div style="color:var(--muted)">Total value: ₹ ${(it.quantity||0)*(it.price||0)}</div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn-gradient" id="closeDetail2">Close</button></div>
      </div>
    </div>
  `;
  document.getElementById('content').insertAdjacentHTML('beforeend', html);
  const rm = ()=> document.getElementById('modalDetail')?.remove();
  document.getElementById('closeDetail')?.addEventListener('click', rm);
  document.getElementById('closeDetail2')?.addEventListener('click', rm);
};

/* Generate QR (keeps existing signature) */
window.generateQR = function(id,name,qty){
  const modalHtml = `
    <div class="modal active" id="modalQR">
      <div class="modal-box">
        <button class="close-x" id="closeQR">✕</button>
        <h4>QR for ${escapeHtml(name)}</h4>
        <div id="qrcodeHolder" style="margin:auto;padding:12px;"></div>
        <div style="margin-top:12px;display:flex;justify-content:center">
          <button class="btn-gradient" id="closeQR2">Close</button>
        </div>
      </div>
    </div>
  `;
  const container = document.getElementById("content");
  container.insertAdjacentHTML("beforeend", modalHtml);
  const qHolder = document.getElementById("qrcodeHolder"); qHolder.innerHTML = "";
  new QRCode(qHolder,{ text: JSON.stringify({ id,name,qty }), width:200, height:200 });
  const rm = ()=> document.getElementById("modalQR")?.remove();
  document.getElementById("closeQR").addEventListener("click", rm);
  document.getElementById("closeQR2").addEventListener("click", rm);
};

/* Open item-specific "scan" modal that accepts upload or paste */
window.openItemScan = function(id,name){
  const modalHtml = `
    <div class="modal active" id="modalUploadScan">
      <div class="modal-box">
        <button class="close-x" id="closeUploadScan">✕</button>
        <h4>Scan / Upload for ${escapeHtml(name)}</h4>
        <p style="color:var(--muted)">Upload a QR image (or paste the QR JSON text) — demo mode only.</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <input type="file" id="qrFileInput" accept="image/*" />
          <textarea id="qrPaste" placeholder='Or paste QR JSON here, e.g. {"id":"..","name":"..","qty":10}' style="min-height:100px;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06)"></textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            <button class="btn-gradient" id="processQrBtn">Process</button>
            <button class="btn ghost" id="cancelProcess">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('content').insertAdjacentHTML('beforeend', modalHtml);
  document.getElementById('closeUploadScan')?.addEventListener('click', ()=> document.getElementById('modalUploadScan')?.remove());
  document.getElementById('cancelProcess')?.addEventListener('click', ()=> document.getElementById('modalUploadScan')?.remove());

  // Process button: prefer pasted JSON; else just show filename (since we don't decode images here)
  document.getElementById('processQrBtn').addEventListener('click', ()=>{
    const pasted = document.getElementById('qrPaste').value.trim();
    if(pasted){
      try{
        const obj = JSON.parse(pasted);
        document.getElementById('modalUploadScan')?.remove();
        showScannedItem(obj);
      } catch(e){ alert('Invalid JSON pasted.'); }
      return;
    }
    const f = document.getElementById('qrFileInput').files[0];
    if(!f) return alert('No file chosen and no JSON pasted.');
    // Demo fallback: show filename and let user confirm
    const obj = { id, name, qty: 'unknown', fileName: f.name };
    document.getElementById('modalUploadScan')?.remove();
    showScannedItem(obj);
  });
};

/* Show scanned item modal (keeps same behavior) */
function showScannedItem(payload){
  const modalHtml = `
    <div class="modal active" id="modalScanned">
      <div class="modal-box">
        <button class="close-x" id="closeScannedBtn">✕</button>
        <h4>Item: ${escapeHtml(payload.name || payload.fileName || 'Unknown')}</h4>
        <p>Quantity: ${payload.qty}</p>
        <div style="display:flex;justify-content:flex-end; gap:8px; margin-top:12px;">
          <button class="btn-gradient" id="viewItemBtn">Open Item</button>
          <button class="btn ghost" id="closeScanned">Close</button>
        </div>
      </div>
    </div>
  `;
  const container = document.getElementById("content");
  container.insertAdjacentHTML("beforeend", modalHtml);

  const remove = ()=> document.getElementById("modalScanned")?.remove();
  document.getElementById("closeScanned")?.addEventListener("click", remove);
  document.getElementById("closeScannedBtn")?.addEventListener("click", remove);

  document.getElementById("viewItemBtn")?.addEventListener("click", ()=>{
    remove();
    renderStocks();
    setTimeout(()=>{
      const rows = Array.from(document.querySelectorAll("#stocksBody tr"));
      for(const r of rows){
        if(r.innerText.includes(payload.name)){
          r.scrollIntoView({ behavior:"smooth", block:"center" });
          r.style.outline = "3px solid rgba(255,235,59,0.9)";
          setTimeout(()=> r.style.outline = "", 2200);
          break;
        }
      }
    },200);
  });
}

/* Reports & PDF/Excel (existing logic reused) */
async function generatePDFReport(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p','pt','a4');
  doc.setFontSize(18); doc.text("Hissab-Kitab — Inventory Report", 40, 50);
  doc.setFontSize(12); doc.text(`Generated: ${new Date().toLocaleString()}`,40,70);
  const totalValue = inventory.reduce((s,i)=> s + ((i.price||0)*(i.quantity||0)),0);
  const lowItems = inventory.filter(i=> (i.quantity ??0) <= (i.threshold ??10));
  doc.text(`Total items: ${inventory.length}`, 40, 100); doc.text(`Total inventory value: ₹ ${totalValue}`, 40, 116); doc.text(`Low-stock items: ${lowItems.length}`, 40, 132);
  let y=160; doc.setFontSize(10); doc.text("Name",40,y); doc.text("Qty",260,y); doc.text("Threshold",320,y); doc.text("Price",420,y); y+=14;
  inventory.forEach(it=> { if(y>740){ doc.addPage(); y=60; } doc.text(escapeHtml(it.name).toString(),40,y); doc.text(String(it.quantity ?? 0),260,y); doc.text(String(it.threshold ?? "-"),320,y); doc.text(String(it.price ?? "-"),420,y); y+=14; });
  try{ const barCanvas = document.getElementById("barChart"); if(barCanvas){ const dataUrl = barCanvas.toDataURL("image/png"); doc.addPage(); doc.text("Inventory Chart",40,40); doc.addImage(dataUrl,'PNG',40,60,520,250); } }catch(e){ console.warn("Chart export failed:",e); }
  const fname = `Hissab-Kitab-Inventory-${Date.now()}.pdf`;
  doc.save(fname);
  addReportRow(fname);
}
function generateExcelReport(){
  const ws_data = [["Name","Quantity","Threshold","Price"]];
  inventory.forEach(i=> ws_data.push([i.name,i.quantity,i.threshold,i.price]));
  const ws = XLSX.utils.aoa_to_sheet(ws_data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Inventory"); XLSX.writeFile(wb,`Hissab-Kitab-Inventory-${Date.now()}.xlsx`);
}

/* ---------- Settings (functional) ---------- */
function renderSettings(){
  setActiveNav("nav-settings");
  const html = `
    <div id="settings" style="padding-top:6px;">
      <h3>Settings</h3>
      <div class="settings-grid">
        <div class="settings-left">
          <div class="card">
            <h4>Profile</h4>
            <div style="display:flex;gap:12px;align-items:center;margin-top:12px">
              <div style="width:72px;height:72px;border-radius:999px;background:linear-gradient(90deg,var(--primary-600),var(--primary-400));display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:24px">H</div>
              <div>
                <div style="font-weight:800">${currentUserId || "User"}</div>
                <div style="color:var(--muted)">${currentUserId ? currentUserId + "@local" : "user@local"}</div>
                <div style="margin-top:8px"><button class="btn-gradient" id="changePwdBtn">Change Password</button> <button class="btn ghost" id="logoutBtn">Logout</button></div>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:12px">
            <h4>Notifications</h4>
            <div style="margin-top:12px;display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div><strong>Low stock alerts</strong><div style="color:var(--muted);font-size:0.9rem">Show in-app low stock alerts</div></div>
                <div class="toggle" id="toggleLowStock"><div class="knob"></div></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div><strong>Email alerts</strong><div style="color:var(--muted);font-size:0.9rem">Send monthly or triggered emails</div></div>
                <div class="toggle" id="toggleEmail"><div class="knob"></div></div>
              </div>
            </div>
          </div>

        </div>

        <div class="settings-right">
          <div class="card">
            <h4>Appearance</h4>
            <div style="margin-top:12px;display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;gap:8px;align-items:center">
                <button class="btn-gradient theme-btn" data-theme="blue">Blue</button>
                <button class="btn-gradient theme-btn" data-theme="indigo">Indigo</button>
                <button class="btn-gradient theme-btn" data-theme="teal">Teal</button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
                <div><strong>Dark mode</strong><div style="color:var(--muted);font-size:0.9rem">Toggle dark theme</div></div>
                <div class="toggle" id="toggleDark"><div class="knob"></div></div>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:12px">
            <h4>App Info</h4>
            <div style="margin-top:12px">
              <div>Project: <strong>Hissab-Kitab</strong></div>
              <div style="margin-top:6px">Version: <strong>1.0.0</strong></div>
              <div style="margin-top:10px">
                <button class="btn-gradient" id="reportIssueBtn">Report issue</button>
                <button class="btn ghost" id="docsBtn">Documentation</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById("content").innerHTML = html;

  initToggleState("toggleLowStock","lowStockAlertEnabled", true);
  initToggleState("toggleEmail","emailAlertEnabled", false);
  initToggleState("toggleDark","darkMode", localStorage.getItem("darkMode")==="true");

  document.querySelectorAll(".theme-btn").forEach(b=> b.addEventListener("click", ()=> {
    applyThemeColor(b.dataset.theme); localStorage.setItem("themeColor", b.dataset.theme);
  }));

  document.getElementById("changePwdBtn").addEventListener("click", async ()=>{
    const newPwd = prompt("Enter new password:");
    if(!newPwd) return;
    // If Firebase Auth is configured and user is signed in, use it; otherwise fallback to demo local store
    if(auth && auth.currentUser){
      try{ await updatePassword(auth.currentUser, newPwd); alert("Password updated successfully."); await logAction("Password changed (UI)"); }
      catch(e){ alert("Error updating password: " + (e.message || e)); }
    } else if(currentUserId){
      // demo fallback: update local password map
      _setLocalPassword(currentUserId, newPwd);
      alert('Password updated locally for demo user.');
      await logAction("Password changed (local)");
    } else {
      alert("Firebase Auth not configured and no demo user present.");
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async ()=> {
    await logAction("User logged out");
    localStorage.removeItem("isLoggedIn"); localStorage.removeItem("currentUserId"); localStorage.removeItem("currentUserRole");
    currentUserLoggedIn = false; currentUserId = null; currentUserRole = null; render();
  });

  document.getElementById("reportIssueBtn").addEventListener("click", ()=> openReportIssueModal());
  document.getElementById("docsBtn").addEventListener("click", ()=> alert("Open docs (placeholder)"));
}

function openReportIssueModal(){
  const html = `
    <div class="modal active" id="modalIssue">
      <div class="modal-box">
        <button class="close-x" id="closeIssue">✕</button>
        <h4>Report an Issue</h4>
        <textarea id="issueText" placeholder="Describe the issue" style="width:100%;min-height:120px;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06)"></textarea>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
          <button class="btn-gradient" id="submitIssue">Submit</button>
          <button class="btn ghost" id="cancelIssue">Cancel</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('content').insertAdjacentHTML('beforeend', html);
  document.getElementById('closeIssue').addEventListener('click', ()=> document.getElementById('modalIssue')?.remove());
  document.getElementById('cancelIssue').addEventListener('click', ()=> document.getElementById('modalIssue')?.remove());
  document.getElementById('submitIssue').addEventListener('click', ()=>{
    const text = document.getElementById('issueText').value.trim();
    if(!text) return alert('Please describe the issue');
    // UI-only: pretend to send
    document.getElementById('modalIssue')?.remove();
    // small success toast
    const t = document.createElement('div'); t.innerText = 'Issue submitted — thank you!'; t.style.position='fixed'; t.style.right='20px'; t.style.bottom='20px'; t.style.background='linear-gradient(90deg,var(--primary-600),var(--primary-400))'; t.style.color='white'; t.style.padding='10px 14px'; t.style.borderRadius='10px'; t.style.boxShadow='0 8px 20px rgba(0,0,0,0.12)'; document.body.appendChild(t);
    setTimeout(()=> t.remove(), 3000);
  });
}

/* Toggle helper */
function initToggleState(elId, storageKey, defaultValue=false){
  const el = document.getElementById(elId);
  if(!el) return;
  const stored = localStorage.getItem(storageKey);
  const on = stored === null ? defaultValue : (stored === "true");
  if(on) el.classList.add("on");
  el.addEventListener("click", ()=> {
    el.classList.toggle("on");
    const now = el.classList.contains("on");
    localStorage.setItem(storageKey, now.toString());
    if(elId === "toggleDark"){ document.body.classList.toggle("dark", now); localStorage.setItem("darkMode", now.toString()); }
  });
}

/* Apply theme color */
function applyThemeColor(t){
  switch(t){
    case "indigo":
      document.documentElement.style.setProperty('--primary-600','#2f46e0');
      document.documentElement.style.setProperty('--primary-400','#4f79ff');
      document.documentElement.style.setProperty('--accent','#00a3ff');
      break;
    case "teal":
      document.documentElement.style.setProperty('--primary-600','#0d9488');
      document.documentElement.style.setProperty('--primary-400','#34d399');
      document.documentElement.style.setProperty('--accent','#14b8a6');
      break;
    default:
      document.documentElement.style.setProperty('--primary-600','#2f46e0');
      document.documentElement.style.setProperty('--primary-400','#4f79ff');
      document.documentElement.style.setProperty('--accent','#00a3ff');
  }
}

/* Manual scan modal opener (dashboard/manual) */
function openManualScanModal(){
  // reuse the same UI as openItemScan but generic
  const html = `
    <div class="modal active" id="modalManualScan">
      <div class="modal-box">
        <button class="close-x" id="closeManual">✕</button>
        <h4>Manual Scan / Upload</h4>
        <p style="color:var(--muted)">Paste QR JSON or upload an image (demo).</p>
        <textarea id="manualQrPaste" placeholder='Paste QR JSON here' style="width:100%;min-height:120px;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06)"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          <button class="btn-gradient" id="processManual">Process</button>
          <button class="btn ghost" id="cancelManual">Cancel</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('content').insertAdjacentHTML('beforeend', html);
  document.getElementById('closeManual').addEventListener('click', ()=> document.getElementById('modalManualScan')?.remove());
  document.getElementById('cancelManual').addEventListener('click', ()=> document.getElementById('modalManualScan')?.remove());
  document.getElementById('processManual').addEventListener('click', ()=>{
    const txt = document.getElementById('manualQrPaste').value.trim();
    if(!txt) return alert('Paste QR JSON or upload image in QR Hub items.');
    try{ const obj = JSON.parse(txt); document.getElementById('modalManualScan')?.remove(); showScannedItem(obj); } catch(e){ alert('Invalid JSON'); }
  });
}
//threshold

/* Boot sequence */
async function render(){
  const theme = localStorage.getItem("themeColor") || "blue";
  applyThemeColor(theme);
  const dark = localStorage.getItem("darkMode") === "true";
  document.body.classList.toggle("dark", dark);

  if(!currentUserLoggedIn) renderLoginScreen();
  else{
    if(!currentUserRole && currentUserId){ currentUserRole = await getUserRole(currentUserId); localStorage.setItem("currentUserRole", currentUserRole); }
    await seedSampleIfEmpty();
    initRealtimeListener();
    renderApp();
  }
}

/* Start */
render();
