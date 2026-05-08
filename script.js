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

let items = {};
let categories = {};
let recipes = {};
let kits = {};
let costMap = {};
let craftQueue = [];
let viewMode = "single";

let blueprints = { learned: [], needed: [] };
let blueprintView = "learned";

let ownedMaterials = {};
let ownedComponents = {};

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  initDropdowns();
  renderCraftQueue();

  const savedXPSetting = localStorage.getItem("includeComponentXP");
  if (savedXPSetting !== null) {
    document.getElementById("includeComponentXP").checked = savedXPSetting === "true";
  }

  document.getElementById("categorySelect").addEventListener("change", () => {
    populateItemDropdown(document.getElementById("categorySelect").value);
    recalculateCurrentView();
  });

  document.getElementById("itemSelect").addEventListener("change", recalculateCurrentView);
  document.getElementById("quantity").addEventListener("input", recalculateCurrentView);
  document.getElementById("ownedRecyclables").addEventListener("input", updateCraftableCount);

  document.getElementById("useOwnedMaterials").addEventListener("change", () => {
    recalculateCurrentView();
    updateOwnedSummaryRecyclables();
  });

  document.getElementById("useOwnedComponents").addEventListener("change", recalculateCurrentView);

  document.getElementById("addQueueBtn").addEventListener("click", addSelectedItemToQueue);
  document.getElementById("openEditorBtn").addEventListener("click", openAdminAuth);

  document.getElementById("submitAdminAuthBtn").addEventListener("click", submitAdminAuth);
  document.getElementById("closeAdminAuthBtn").addEventListener("click", closeAdminAuth);

  document.getElementById("singleViewBtn").addEventListener("click", () => setViewMode("single"));
  document.getElementById("queueViewBtn").addEventListener("click", () => setViewMode("queue"));

  document.getElementById("includeComponentXP").addEventListener("change", e => {
    localStorage.setItem("includeComponentXP", e.target.checked);
    recalculateCurrentView();
  });
  
  document.getElementById("openBlueprintsBtn").addEventListener("click", openBlueprintsModal);
  document.getElementById("closeBlueprintsBtn").addEventListener("click", closeBlueprintsModal);

  document.getElementById("bpLearnedTab").addEventListener("click", () => {
    blueprintView = "learned";
    renderBlueprints();
  });
  document.getElementById("bpNeededTab").addEventListener("click", () => {
    blueprintView = "needed";
    renderBlueprints();
  });
  
  document.querySelectorAll('input[name="fixerBoost"]').forEach(input => {
    input.addEventListener("change", recalculateCurrentView);
  });

  setViewMode("single");
});

async function loadData() {
  const res = await fetch(DATA_ENDPOINT);
  const data = await res.json();

  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "Failed to load data");
  }

  items = data.items || {};
  categories = data.categories || buildCategoriesFromItems(items);
  recipes = data.recipes || {};
  kits = data.kits || {};
  costMap = data.costs || {};
  blueprints = data.blueprints || { learned: [], needed: [] };
}

function buildCategoriesFromItems(itemMap) {
  const fallback = {};

  Object.entries(itemMap).forEach(([itemName, itemData]) => {
    const category = itemData.category || "Other";
    if (!fallback[category]) fallback[category] = [];
    fallback[category].push(itemName);
  });

  Object.keys(fallback).forEach(category => fallback[category].sort());
  return fallback;
}

function initDropdowns() {
  const categorySelect = document.getElementById("categorySelect");
  categorySelect.innerHTML = `<option value="">Select Category</option>`;

  Object.keys(categories).sort().forEach(category => {
    const opt = document.createElement("option");
    opt.value = category;
    opt.textContent = category;
    categorySelect.appendChild(opt);
  });

  const categoryOptions = Object.keys(categories).sort();

  if (categoryOptions.length > 0) {
    categorySelect.value = categoryOptions[0];
    populateItemDropdown(categoryOptions[0]);
  } else {
    populateItemDropdown("");
  }
}

function populateItemDropdown(category) {
  const itemSelect = document.getElementById("itemSelect");
  itemSelect.innerHTML = `<option value="">Select Item</option>`;

  if (!category || !categories[category]) {
    itemSelect.disabled = true;
    updateCraftableCount();
    return;
  }

  categories[category].forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    itemSelect.appendChild(opt);
  });

  itemSelect.disabled = false;

  if (itemSelect.options.length > 1) {
    itemSelect.selectedIndex = 1;
  }

  updateCraftableCount();
}

function setViewMode(mode) {
  viewMode = mode;

  document.getElementById("singleViewBtn").classList.toggle("active", mode === "single");
  document.getElementById("queueViewBtn").classList.toggle("active", mode === "queue");

  recalculateCurrentView();
}

function recalculateCurrentView() {
  if (viewMode === "single") calculateSingle();
  else calculateQueue();

  updateCraftableCount();
}

function addSelectedItemToQueue() {
  const item = document.getElementById("itemSelect").value;
  const qty = Math.max(1, Number(document.getElementById("quantity").value) || 1);

  if (!item) return;

  const existing = craftQueue.find(entry => entry.item === item);

  if (existing) existing.qty += qty;
  else craftQueue.push({ item, qty });

  renderCraftQueue();
  setViewMode("queue");
}

function removeFromQueue(index) {
  craftQueue.splice(index, 1);
  renderCraftQueue();
  calculateQueue();
}

function clearQueue() {
  craftQueue = [];
  renderCraftQueue();
  calculateQueue();
}

function renderCraftQueue() {
  const container = document.getElementById("craftQueue");
  container.innerHTML = "";

  if (craftQueue.length === 0) {
    container.innerHTML = `<div class="muted">No items added yet.</div>`;
    return;
  }

  craftQueue.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "queue-row";

    row.innerHTML = `
      <span class="queue-name">${escapeHtml(entry.item)}</span>
      <strong>x${entry.qty.toLocaleString()}</strong>
      <button type="button" onclick="removeFromQueue(${index})">Remove</button>
    `;

    container.appendChild(row);
  });
}

function calculateSingle() {
  const item = document.getElementById("itemSelect").value;
  const qty = Math.max(1, Number(document.getElementById("quantity").value) || 1);

  if (!item) {
    updateOutput({}, {}, 0, 0, 0, 0);
    return;
  }

  const includeComponentXP = document.getElementById("includeComponentXP").checked;

  const components = getComponents(item, qty);
  const materials = getMaterials(item, qty, {}, getOwnedComponentBudget());
  const xp = getXP(item, qty, includeComponentXP);
  const recyclable = getRecyclableTotal(materials);
  const cost = getCraftCost(materials);
  const stopLevel = (items[item]?.stopXP || 0) / 100;

  updateOutput(components, materials, xp, recyclable, cost, stopLevel);
}

function calculateQueue() {
  let totalComponents = {};
  let totalMaterials = {};
  let totalXP = 0;
  let maxStopLevel = 0;
  const ownedBudget = getOwnedComponentBudget();

  const includeComponentXP = document.getElementById("includeComponentXP").checked;

  craftQueue.forEach(entry => {
    const components = getComponents(entry.item, entry.qty);
    const materials = getMaterials(entry.item, entry.qty, {}, ownedBudget);
    const xp = getXP(entry.item, entry.qty, includeComponentXP);
    const stopLevel = (items[entry.item]?.stopXP || 0) / 100;

    mergeTotals(totalComponents, components);
    mergeTotals(totalMaterials, materials);
    totalXP += xp;

    if (stopLevel > maxStopLevel) maxStopLevel = stopLevel;
  });

  const recyclable = getRecyclableTotal(totalMaterials);
  const cost = getCraftCost(totalMaterials);

  updateOutput(totalComponents, totalMaterials, totalXP, recyclable, cost, maxStopLevel);
}

function getOwnedComponentBudget() {
  const useOwned = document.getElementById("useOwnedComponents")?.checked;

  if (!useOwned) return {};

  return { ...ownedComponents };
}

function mergeTotals(target, source) {
  Object.entries(source).forEach(([name, qty]) => {
    target[name] = (target[name] || 0) + qty;
  });
}

function getComponents(item, qty, result = {}) {
  const comps = recipes[item];
  if (!comps) return result;

  comps.forEach(c => {
    const total = c.qty * qty;
    result[c.component] = (result[c.component] || 0) + total;
    getComponents(c.component, total, result);
  });

  return result;
}

function getMaterials(item, qty, result = {}, ownedComponentBudget = {}) {
  const itemData = items[item];
  if (!itemData || qty <= 0) return result;

  Object.entries(itemData.materials || {}).forEach(([mat, val]) => {
    result[mat] = (result[mat] || 0) + val * qty;
  });

  const comps = recipes[item];

  if (comps) {
    comps.forEach(c => {
      let neededQty = c.qty * qty;

      if (ownedComponentBudget[c.component] > 0) {
        const usedOwned = Math.min(neededQty, ownedComponentBudget[c.component]);
        neededQty -= usedOwned;
        ownedComponentBudget[c.component] -= usedOwned;
      }

      getMaterials(c.component, neededQty, result, ownedComponentBudget);
    });
  }

  return result;
}

function getFixerBoost() {
  const selected = document.querySelector('input[name="fixerBoost"]:checked');
  return Number(selected?.value || 0);
}

function getXP(item, qty, includeComponents = true) {
  const boost = getFixerBoost();
  let total = ((items[item]?.xp || 0) + boost) * qty;

  if (!includeComponents) return total;

  const comps = recipes[item];

  if (comps) {
    comps.forEach(c => {
      total += getXP(c.component, c.qty * qty, true);
    });
  }

  return total;
}

function getRecyclableTotal(materials) {
  let total = 0;

  Object.entries(materials).forEach(([mat, qty]) => {
    if (!nonRecyclableMaterials.has(mat)) total += qty;
  });

  return total;
}

function getCraftCost(materials) {
  let totalCost = 0;
  let recyclableTotal = 0;

  Object.entries(materials).forEach(([mat, qty]) => {
    if (costMap[mat] !== undefined) {
      totalCost += qty * Number(costMap[mat]);
    } else if (!nonRecyclableMaterials.has(mat)) {
      recyclableTotal += qty;
    }
  });

  totalCost += recyclableTotal * Number(costMap["Recyclable Materials"] || 0);
  return totalCost;
}

function updateOutput(components, materials, xp, recyclable, cost, stopLevel = 0) {
  renderList("components", components);
  renderList("materials", materials);

  document.getElementById("stopLevel").textContent =
    `🎯 Stop Level: ${stopLevel.toLocaleString()}`;

  document.getElementById("xpTotal").textContent =
    `⭐ XP Gained: ${xp.toLocaleString()}`;

  document.getElementById("recyclableTotal").textContent =
    `♻️ Recyclable Materials Needed: ${recyclable.toLocaleString()}`;

  document.getElementById("costTotal").textContent =
    `💰 Cost To Make: ${cost.toLocaleString()}`;

  updateOwnedSummaryRecyclables();
}

function renderList(id, data) {
  const el = document.getElementById(id);
  el.innerHTML = "";

  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    el.innerHTML = `<div class="muted">None required.</div>`;
    return;
  }

  const useOwnedMaterials = document.getElementById("useOwnedMaterials")?.checked;
  const useOwnedComponents = document.getElementById("useOwnedComponents")?.checked;

  entries.forEach(([name, qty]) => {
    const row = document.createElement("div");

    if (id === "components" && useOwnedComponents) {
      const owned = Number(ownedComponents[name]) || 0;
      const remaining = Math.max(0, qty - owned);

      row.className = "result-row material-owned-row";

      row.innerHTML = `
        <span>${escapeHtml(name)}</span>

        <input
          class="owned-input"
          type="number"
          min="0"
          placeholder="Have"
          value="${owned || ""}"
          data-component="${escapeHtml(name)}"
        >

        <strong class="needed-after-owned">${remaining.toLocaleString()}</strong>
      `;

      const input = row.querySelector(".owned-input");

      input.addEventListener("change", e => {
        ownedComponents[name] = Number(e.target.value) || 0;
        recalculateCurrentView();
      });
    } else if (id === "materials" && useOwnedMaterials) {
      const owned = Number(ownedMaterials[name]) || 0;
      const remaining = Math.max(0, qty - owned);

      row.className = "result-row material-owned-row";

      row.innerHTML = `
        <span>${escapeHtml(name)}</span>

        <input
          class="owned-input"
          type="number"
          min="0"
          placeholder="Have"
          value="${owned || ""}"
          data-material="${escapeHtml(name)}"
        >

        <strong class="needed-after-owned">${remaining.toLocaleString()}</strong>
      `;

      const input = row.querySelector(".owned-input");
      const output = row.querySelector(".needed-after-owned");

      input.addEventListener("input", e => {
        const value = Number(e.target.value) || 0;
        ownedMaterials[name] = value;

        const newRemaining = Math.max(0, qty - value);
        output.textContent = newRemaining.toLocaleString();

        updateOwnedSummaryRecyclables();
      });
    } else {
      row.className = "result-row";
      row.innerHTML = `<span>${escapeHtml(name)}</span><strong>${qty.toLocaleString()}</strong>`;
    }

    el.appendChild(row);
  });
}

function updateOwnedSummaryRecyclables() {
  const useOwned = document.getElementById("useOwnedMaterials")?.checked;
  if (!useOwned) return;

  const materialRows = document.querySelectorAll("#materials .material-owned-row");
  let total = 0;

  materialRows.forEach(row => {
    const materialName = row.querySelector("span")?.textContent || "";
    const remainingText = row.querySelector(".needed-after-owned")?.textContent || "0";
    const remaining = Number(remainingText.replaceAll(",", "")) || 0;

    if (!nonRecyclableMaterials.has(materialName)) {
      total += remaining;
    }
  });

  document.getElementById("recyclableTotal").textContent =
    `♻️ Recyclable Materials Needed: ${total.toLocaleString()}`;
}

function updateCraftableCount() {
  const itemSelect = document.getElementById("itemSelect");
  const ownedInput = document.getElementById("ownedRecyclables");
  const output = document.getElementById("craftableCount");

  if (!itemSelect || !ownedInput || !output) return;

  const item = itemSelect.value;
  const owned = Number(ownedInput.value) || 0;

  if (!item || owned <= 0) {
    output.textContent = "Can craft: 0";
    return;
  }

  const materialsForOne = getMaterials(item, 1, {}, getOwnedComponentBudget());
  const recyclableNeeded = getRecyclableTotal(materialsForOne);

  if (recyclableNeeded <= 0) {
    output.textContent = "Can craft: ∞";
    return;
  }

  const craftable = Math.floor(owned / recyclableNeeded);
  output.textContent = `Can craft: ${craftable.toLocaleString()}`;
}

function openAdminAuth() {
  document.getElementById("adminAuthModal").style.display = "flex";
  document.getElementById("adminAuthCode").value = "";
}

function closeAdminAuth() {
  document.getElementById("adminAuthModal").style.display = "none";
}

async function submitAdminAuth() {
  const code = document.getElementById("adminAuthCode").value.trim();

  if (!code) {
    alert("Authenticator code is required.");
    return;
  }

  const res = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "verifyCode",
      code
    })
  });

  const result = await res.json();

  if (!res.ok || !result.ok) {
    alert(`❌ ${result.error || "Invalid code"}`);
    return;
  }

  sessionStorage.setItem("adminAuthed", "true");
  sessionStorage.setItem("adminCode", code);

  window.location.href = "admin.html";
}

function openBlueprintsModal() {
  blueprintView = "learned";
  document.getElementById("blueprintsModal").style.display = "flex";
  renderBlueprints();
}

function closeBlueprintsModal() {
  document.getElementById("blueprintsModal").style.display = "none";
}

function renderBlueprints() {
  const list = document.getElementById("blueprintList");
  const learnedTab = document.getElementById("bpLearnedTab");
  const neededTab = document.getElementById("bpNeededTab");

  learnedTab.classList.toggle("active", blueprintView === "learned");
  neededTab.classList.toggle("active", blueprintView === "needed");

  const data = blueprints[blueprintView] || [];

  if (data.length === 0) {
    list.innerHTML = `<div class="muted">No blueprints found.</div>`;
    return;
  }

  list.innerHTML = data.map(item => `
    <div class="bp-row">
      <span>${escapeHtml(item)}</span>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
