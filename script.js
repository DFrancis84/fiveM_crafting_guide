// ===============================
// CONFIG
// ===============================
const DATA_ENDPOINT = "https://lucidcrafting.devinfrancis84.workers.dev/api/data";
const SAVE_ENDPOINT = "https://lucidcrafting.devinfrancis84.workers.dev/api/save";

const nonRecyclableMaterials = new Set([
  "Titanium",
  "Circuit Board",
  "Control Chip",
  "Power Supply",
  "Charcoal",
  "Sulfur",
  "Gunpowder",
  "Golden Nugget",
  "Copper Ore",
  "Tech Shavings",
  "Super Cell Battery",
  "Broken USB",
  "Broken VPN",
  "Radio",
  "Steel Bar",
  "Leather Hide",
  "Sewing Thread"
]);

// ===============================
// GLOBAL STATE
// ===============================
let items = {};
let categories = {};
let recipes = {};
let kits = {};
let costMap = {};

let craftQueue = [];
let viewMode = "single";
let ownedMaterials = {}; // NOT persisted

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  initDropdowns();
  renderCraftQueue();

  document.getElementById("categorySelect").addEventListener("change", () => {
    populateItemDropdown(categorySelect.value);
    recalculateCurrentView();
  });

  document.getElementById("itemSelect").addEventListener("change", recalculateCurrentView);
  document.getElementById("quantity").addEventListener("input", recalculateCurrentView);

  document.getElementById("ownedRecyclables").addEventListener("input", updateCraftableCount);
  document.getElementById("useOwnedMaterials").addEventListener("change", recalculateCurrentView);

  document.getElementById("addQueueBtn").addEventListener("click", addToQueue);

  document.getElementById("singleViewBtn").onclick = () => setViewMode("single");
  document.getElementById("queueViewBtn").onclick = () => setViewMode("queue");

  setViewMode("single");
});

// ===============================
// DATA LOAD
// ===============================
async function loadData() {
  const res = await fetch(DATA_ENDPOINT);
  const data = await res.json();

  items = data.items;
  categories = data.categories;
  recipes = data.recipes;
  kits = data.kits;
  costMap = data.costs;
}

// ===============================
// DROPDOWNS
// ===============================
function initDropdowns() {
  const categorySelect = document.getElementById("categorySelect");

  categorySelect.innerHTML = `<option value="">Select Category</option>`;

  Object.keys(categories).forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
}

function populateItemDropdown(category) {
  const itemSelect = document.getElementById("itemSelect");

  itemSelect.innerHTML = `<option value="">Select Item</option>`;

  if (!category) {
    itemSelect.disabled = true;
    return;
  }

  categories[category].forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    itemSelect.appendChild(opt);
  });

  itemSelect.disabled = false;
}

// ===============================
// VIEW MODE
// ===============================
function setViewMode(mode) {
  viewMode = mode;

  document.getElementById("singleViewBtn").classList.toggle("active", mode === "single");
  document.getElementById("queueViewBtn").classList.toggle("active", mode === "queue");

  recalculateCurrentView();
}

// ===============================
// QUEUE
// ===============================
function addToQueue() {
  const item = itemSelect.value;
  const qty = Number(quantity.value) || 1;

  if (!item) return;

  const existing = craftQueue.find(e => e.item === item);

  if (existing) existing.qty += qty;
  else craftQueue.push({ item, qty });

  renderCraftQueue();
  setViewMode("queue");
}

function renderCraftQueue() {
  const el = document.getElementById("craftQueue");
  el.innerHTML = "";

  if (!craftQueue.length) {
    el.innerHTML = `<div class="muted">No items added yet.</div>`;
    return;
  }

  craftQueue.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "queue-row";

    row.innerHTML = `
      <span>${entry.item}</span>
      <strong>x${entry.qty}</strong>
      <button onclick="removeFromQueue(${i})">Remove</button>
    `;

    el.appendChild(row);
  });
}

function removeFromQueue(i) {
  craftQueue.splice(i, 1);
  renderCraftQueue();
  recalculateCurrentView();
}

// ===============================
// CALCULATIONS
// ===============================
function recalculateCurrentView() {
  if (viewMode === "single") calculateSingle();
  else calculateQueue();

  updateCraftableCount();
}

function calculateSingle() {
  const item = itemSelect.value;
  const qty = Number(quantity.value) || 1;

  if (!item) return;

  const materials = getMaterials(item, qty);
  const xp = items[item].xp * qty;
  const recyclable = getRecyclableTotal(materials);
  const cost = getCost(materials);
  const stopLevel = (items[item].stopXP || 0) / 100;

  updateOutput(materials, xp, recyclable, cost, stopLevel);
}

function calculateQueue() {
  let materials = {};
  let xp = 0;
  let maxStop = 0;

  craftQueue.forEach(entry => {
    merge(materials, getMaterials(entry.item, entry.qty));
    xp += items[entry.item].xp * entry.qty;

    const lvl = (items[entry.item].stopXP || 0) / 100;
    if (lvl > maxStop) maxStop = lvl;
  });

  const recyclable = getRecyclableTotal(materials);
  const cost = getCost(materials);

  updateOutput(materials, xp, recyclable, cost, maxStop);
}

function getMaterials(item, qty, result = {}) {
  const base = items[item].materials || {};

  Object.entries(base).forEach(([m, v]) => {
    result[m] = (result[m] || 0) + v * qty;
  });

  (recipes[item] || []).forEach(c => {
    getMaterials(c.component, c.qty * qty, result);
  });

  return result;
}

function merge(a, b) {
  Object.entries(b).forEach(([k, v]) => {
    a[k] = (a[k] || 0) + v;
  });
}

function getRecyclableTotal(mats) {
  let total = 0;

  Object.entries(mats).forEach(([m, q]) => {
    if (!nonRecyclableMaterials.has(m)) total += q;
  });

  return total;
}

function getCost(mats) {
  let total = 0;

  Object.entries(mats).forEach(([m, q]) => {
    total += (costMap[m] || 0) * q;
  });

  return total;
}

// ===============================
// OUTPUT
// ===============================
function updateOutput(materials, xp, recyclable, cost, stopLevel) {
  renderMaterials(materials);

  stopLevelEl.textContent = `🎯 Stop Level: ${stopLevel}`;
  xpTotal.textContent = `⭐ XP Gained: ${xp}`;
  recyclableTotal.textContent = `♻️ Recyclable Materials Needed: ${recyclable}`;
  costTotal.textContent = `💰 Cost To Make: ${cost}`;
}

// ===============================
// MATERIAL RENDER (FIXED)
// ===============================
function renderMaterials(data) {
  const el = document.getElementById("materials");
  el.innerHTML = "";

  const useOwned = useOwnedMaterials.checked;

  Object.entries(data).forEach(([name, qty]) => {
    const row = document.createElement("div");
    row.className = "result-row";

    if (useOwned) {
      const owned = ownedMaterials[name] || 0;
      const remaining = Math.max(0, qty - owned);

      row.classList.add("material-owned-row");

      row.innerHTML = `
        <span>${name}</span>
        <input class="owned-input" type="number" value="${owned}">
        <strong>${remaining}</strong>
      `;

      const input = row.querySelector("input");
      const output = row.querySelector("strong");

      input.addEventListener("input", e => {
        const val = Number(e.target.value) || 0;
        ownedMaterials[name] = val;

        const newRemaining = Math.max(0, qty - val);
        output.textContent = newRemaining;

        updateOwnedRecyclables();
      });
    } else {
      row.innerHTML = `<span>${name}</span><strong>${qty}</strong>`;
    }

    el.appendChild(row);
  });
}

// ===============================
// OWNED RECYCLE UPDATE
// ===============================
function updateOwnedRecyclables() {
  if (!useOwnedMaterials.checked) return;

  let total = 0;

  document.querySelectorAll("#materials .material-owned-row").forEach(row => {
    const name = row.querySelector("span").textContent;
    const remaining = Number(row.querySelector("strong").textContent) || 0;

    if (!nonRecyclableMaterials.has(name)) {
      total += remaining;
    }
  });

  recyclableTotal.textContent = `♻️ Recyclable Materials Needed: ${total}`;
}

// ===============================
// CRAFTABLE
// ===============================
function updateCraftableCount() {
  const item = itemSelect.value;
  const owned = Number(ownedRecyclables.value) || 0;

  if (!item || owned <= 0) {
    craftableCount.textContent = "Can craft: 0";
    return;
  }

  const mats = getMaterials(item, 1);
  const needed = getRecyclableTotal(mats);

  if (!needed) {
    craftableCount.textContent = "Can craft: ∞";
    return;
  }

  craftableCount.textContent = `Can craft: ${Math.floor(owned / needed)}`;
}
