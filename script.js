// ===============================
// CONFIG
// ===============================

const DATA_ENDPOINT = "https://lucidcrafting.devinfrancis84.workers.dev/api/data";
const SAVE_ENDPOINT = "https://lucidcrafting.devinfrancis84.workers.dev";

const nonRecyclableMaterials = new Set([
  "Titanium",
  "Circuit Board",
  "Control Chip",
  "Power Supply",
  "Charcoal",
  "Sulfur",
  "Gunpowder",
  "Golden Nugget",
  "Copper Ore"
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

let ownedMaterials = {};

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  const popup = document.getElementById("popup");
  if (popup) popup.style.display = "none";

  await loadData();
  initDropdowns();
  renderCraftQueue();

  document.getElementById("categorySelect").addEventListener("change", () => {
    populateItemDropdown(document.getElementById("categorySelect").value);
    recalculateCurrentView();
  });

  document.getElementById("itemSelect").addEventListener("change", recalculateCurrentView);
  document.getElementById("quantity").addEventListener("input", recalculateCurrentView);

  document.getElementById("ownedRecyclables").addEventListener("input", updateCraftableCount);
  document.getElementById("useOwnedMaterials").addEventListener("change", recalculateCurrentView);

  document.getElementById("addQueueBtn").addEventListener("click", addSelectedItemToQueue);

  setViewMode("single");
});

// ===============================
// DATA
// ===============================
async function loadData() {
  const res = await fetch(DATA_ENDPOINT);
  const data = await res.json();

  items = data.items || {};
  categories = data.categories || {};
  recipes = data.recipes || {};
  kits = data.kits || {};
  costMap = data.costs || {};
}

// ===============================
// DROPDOWNS
// ===============================
function initDropdowns() {
  const categorySelect = document.getElementById("categorySelect");

  categorySelect.innerHTML = `<option value="">Select Category</option>`;

  Object.keys(categories).sort().forEach(category => {
    const opt = document.createElement("option");
    opt.value = category;
    opt.textContent = category;
    categorySelect.appendChild(opt);
  });

  if (categorySelect.options.length > 1) {
    categorySelect.selectedIndex = 1;
    populateItemDropdown(categorySelect.value);
  }
}

function populateItemDropdown(category) {
  const itemSelect = document.getElementById("itemSelect");

  itemSelect.innerHTML = `<option value="">Select Item</option>`;

  if (!category || !categories[category]) {
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
  recalculateCurrentView();
}

function recalculateCurrentView() {
  if (viewMode === "single") calculateSingle();
  else calculateQueue();

  updateCraftableCount();
}

// ===============================
// QUEUE
// ===============================
function addSelectedItemToQueue() {
  const item = document.getElementById("itemSelect").value;
  const qty = Number(document.getElementById("quantity").value) || 1;

  if (!item) return;

  const existing = craftQueue.find(e => e.item === item);

  if (existing) existing.qty += qty;
  else craftQueue.push({ item, qty });

  renderCraftQueue();
}

function renderCraftQueue() {
  const container = document.getElementById("craftQueue");
  container.innerHTML = "";

  craftQueue.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "queue-row";

    row.innerHTML = `
      <span>${entry.item}</span>
      <strong>x${entry.qty}</strong>
      <button onclick="removeFromQueue(${i})">Remove</button>
    `;

    container.appendChild(row);
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
function calculateSingle() {
  const item = document.getElementById("itemSelect").value;
  const qty = Number(document.getElementById("quantity").value) || 1;

  if (!item) return;

  const materials = getMaterials(item, qty);
  const xp = getXP(item, qty);
  const recyclable = getRecyclableTotal(materials);
  const cost = getCraftCost(materials);
  const stopLevel = (items[item]?.stopXP || 0) / 100;

  updateOutput({}, materials, xp, recyclable, cost, stopLevel);
}

function calculateQueue() {
  let totalMaterials = {};
  let totalXP = 0;
  let maxStop = 0;

  craftQueue.forEach(entry => {
    const mats = getMaterials(entry.item, entry.qty);
    mergeTotals(totalMaterials, mats);

    totalXP += getXP(entry.item, entry.qty);

    const stop = (items[entry.item]?.stopXP || 0) / 100;
    if (stop > maxStop) maxStop = stop;
  });

  const recyclable = getRecyclableTotal(totalMaterials);
  const cost = getCraftCost(totalMaterials);

  updateOutput({}, totalMaterials, totalXP, recyclable, cost, maxStop);
}

function getMaterials(item, qty, result = {}) {
  const itemData = items[item];
  if (!itemData) return result;

  Object.entries(itemData.materials || {}).forEach(([m, v]) => {
    result[m] = (result[m] || 0) + v * qty;
  });

  (recipes[item] || []).forEach(c => {
    getMaterials(c.component, c.qty * qty, result);
  });

  return result;
}

function getXP(item, qty) {
  return (items[item]?.xp || 0) * qty;
}

function getRecyclableTotal(materials) {
  let total = 0;
  Object.entries(materials).forEach(([m, q]) => {
    if (!nonRecyclableMaterials.has(m)) total += q;
  });
  return total;
}

function getCraftCost(materials) {
  let total = 0;
  Object.entries(materials).forEach(([m, q]) => {
    total += (costMap[m] || 0) * q;
  });
  return total;
}

function mergeTotals(target, source) {
  Object.entries(source).forEach(([k, v]) => {
    target[k] = (target[k] || 0) + v;
  });
}

// ===============================
// OWNED MATERIALS (KEY FEATURE)
// ===============================
function renderList(id, data) {
  const el = document.getElementById(id);
  el.innerHTML = "";

  const useOwned = document.getElementById("useOwnedMaterials")?.checked;

  Object.entries(data).forEach(([name, qty]) => {
    const row = document.createElement("div");

    if (id === "materials" && useOwned) {
      const owned = ownedMaterials[name] || 0;
      const remaining = Math.max(0, qty - owned);

      row.className = "result-row material-owned-row";

      row.innerHTML = `
        <span>${name}</span>
        <input class="owned-input" type="number" value="${owned}">
        <strong>${remaining}</strong>
      `;

      row.querySelector("input").addEventListener("input", e => {
        ownedMaterials[name] = Number(e.target.value) || 0;
        recalculateCurrentView();
      });
    } else {
      row.className = "result-row";
      row.innerHTML = `<span>${name}</span><strong>${qty}</strong>`;
    }

    el.appendChild(row);
  });
}

// ===============================
// OUTPUT
// ===============================
function updateOutput(_, materials, xp, recyclable, cost, stopLevel) {
  renderList("materials", materials);

  document.getElementById("xpTotal").textContent = `XP: ${xp}`;
  document.getElementById("recyclableTotal").textContent = `Recyclables: ${recyclable}`;
  document.getElementById("costTotal").textContent = `Cost: ${cost}`;
  document.getElementById("stopLevel").textContent = `Stop Level: ${stopLevel}`;
}

// ===============================
// CRAFTABLE
// ===============================
function updateCraftableCount() {
  const item = document.getElementById("itemSelect").value;
  const owned = Number(document.getElementById("ownedRecyclables").value) || 0;
  const out = document.getElementById("craftableCount");

  if (!item || owned <= 0) {
    out.textContent = "Can craft: 0";
    return;
  }

  const mats = getMaterials(item, 1);
  const needed = getRecyclableTotal(mats);

  if (!needed) {
    out.textContent = "Can craft: ∞";
    return;
  }

  out.textContent = `Can craft: ${Math.floor(owned / needed)}`;
}
