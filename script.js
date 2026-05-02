// ===============================
// CONFIG
// ===============================

// Replace these with your Cloudflare Worker endpoints.
const DATA_ENDPOINT = "https://lucidcrafting.devinfrancis84.workers.dev/api/data";
const SAVE_ENDPOINT = "https://lucidcrafting.devinfrancis84.workers.dev";

// Materials excluded from recyclable total.
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
let recipes = {};
let costMap = {};
let craftQueue = [];
let viewMode = "single";

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("popup").style.display = "none";
  
  await loadData();
  initDropdown();
  renderCraftQueue();

  document.getElementById("itemSelect").addEventListener("change", () => {
    if (viewMode === "single") calculateSingle();
  });

  document.getElementById("quantity").addEventListener("input", () => {
    if (viewMode === "single") calculateSingle();
  });

  document.getElementById("addQueueBtn").addEventListener("click", addSelectedItemToQueue);
  document.getElementById("openEditorBtn").addEventListener("click", openAddItem);

  document.querySelectorAll('input[name="fixerBoost"]').forEach(input => {
  input.addEventListener("change", () => {
    if (viewMode === "single") {
      calculateSingle();
    } else {
      calculateQueue();
    }
  });
});
  document.getElementById("includeComponentXP").addEventListener("change", () => {
    if (viewMode === "single") {
      calculateSingle();
    } else {
      calculateQueue();
    }
  });
  
  document.getElementById("singleViewBtn").addEventListener("click", () => setViewMode("single"));
  document.getElementById("queueViewBtn").addEventListener("click", () => setViewMode("queue"));

  document.getElementById("addComponentRowBtn").addEventListener("click", () => {
    addEditorRow("componentsList");
  });

  document.getElementById("addMaterialRowBtn").addEventListener("click", () => {
    addEditorRow("materialsList");
  });

  document.getElementById("saveCostBtn").addEventListener("click", submitCostUpdate);
  document.getElementById("submitEditorBtn").addEventListener("click", submitItem);
  document.getElementById("closeEditorBtn").addEventListener("click", closeAddItem);

  setViewMode("single");
});

// ===============================
// DATA LOADING
// ===============================
async function loadData() {
  const res = await fetch(DATA_ENDPOINT);
  const data = await res.json();

  items = data.items || {};
  recipes = data.recipes || {};
  costMap = data.costs || {};
}

function initDropdown() {
  const select = document.getElementById("itemSelect");
  select.innerHTML = "";

  Object.keys(items)
    .sort()
    .forEach(item => {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });

  if (select.options.length > 0) {
    select.selectedIndex = 0;
  }
}

// ===============================
// VIEW MODE
// ===============================
function setViewMode(mode) {
  viewMode = mode;

  document.getElementById("singleViewBtn").classList.toggle("active", mode === "single");
  document.getElementById("queueViewBtn").classList.toggle("active", mode === "queue");

  if (mode === "single") {
    calculateSingle();
  } else {
    calculateQueue();
  }
}

// ===============================
// QUEUE
// ===============================
function addSelectedItemToQueue() {
  const item = document.getElementById("itemSelect").value;
  const qty = Math.max(1, Number(document.getElementById("quantity").value) || 1);

  if (!item) return;

  const existing = craftQueue.find(entry => entry.item === item);

  if (existing) {
    existing.qty += qty;
  } else {
    craftQueue.push({ item, qty });
  }

  renderCraftQueue();
  setViewMode("queue");
}

function removeFromQueue(index) {
  craftQueue.splice(index, 1);
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
      <span class="queue-name">${entry.item}</span>
      <strong>x${entry.qty.toLocaleString()}</strong>
      <button type="button" onclick="removeFromQueue(${index})">Remove</button>
    `;

    container.appendChild(row);
  });
}

// ===============================
// CALCULATIONS
// ===============================
function calculateSingle() {
  const item = document.getElementById("itemSelect").value;
  const qty = Math.max(1, Number(document.getElementById("quantity").value) || 1);
  const includeComponentXP = document.getElementById("includeComponentXP").checked;

  if (!item) return;

  const components = getComponents(item, qty);
  const materials = getMaterials(item, qty);
  const xp = getXP(item, qty, includeComponentXP);
  const recyclable = getRecyclableTotal(materials);
  const cost = getCraftCost(materials);

  updateOutput(components, materials, xp, recyclable, cost);
}

function calculateQueue() {
  let totalComponents = {};
  let totalMaterials = {};
  let totalXP = 0;

  const includeComponentXP = document.getElementById("includeComponentXP").checked;
  craftQueue.forEach(entry => {
    const components = getComponents(entry.item, entry.qty);
    const materials = getMaterials(entry.item, entry.qty);
    const xp = getXP(entry.item, entry.qty, includeComponentXP);

    mergeTotals(totalComponents, components);
    mergeTotals(totalMaterials, materials);

    totalXP += xp;
  });

  const recyclable = getRecyclableTotal(totalMaterials);
  const cost = getCraftCost(totalMaterials);

  updateOutput(totalComponents, totalMaterials, totalXP, recyclable, cost);
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

function getMaterials(item, qty, result = {}) {
  const itemData = items[item];
  if (!itemData) return result;

  Object.entries(itemData.materials || {}).forEach(([mat, val]) => {
    result[mat] = (result[mat] || 0) + val * qty;
  });

  const comps = recipes[item];
  if (comps) {
    comps.forEach(c => {
      getMaterials(c.component, c.qty * qty, result);
    });
  }

  return result;
}

function getXP(item, qty, includeComponents = true) {
  const boost = getFixerBoost();

  let total = ((items[item]?.xp || 0) + boost) * qty;

  if (!includeComponents) {
    return total;
  }

  const comps = recipes[item];
  if (comps) {
    comps.forEach(c => {
      total += getXP(c.component, c.qty * qty, true);
    });
  }

  return total;
}

function getFixerBoost() {
  const selected = document.querySelector('input[name="fixerBoost"]:checked');
  return Number(selected?.value || 0);
}

function getRecyclableTotal(materials) {
  let total = 0;

  Object.entries(materials).forEach(([mat, qty]) => {
    if (!nonRecyclableMaterials.has(mat)) {
      total += qty;
    }
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

// ===============================
// RENDERING
// ===============================
function updateOutput(components, materials, xp, recyclable, cost) {
  renderList("components", components);
  renderList("materials", materials);

  document.getElementById("xpTotal").textContent =
    `⭐ XP Gained: ${xp.toLocaleString()}`;

  document.getElementById("recyclableTotal").textContent =
    `♻️ Recyclable Materials Needed: ${recyclable.toLocaleString()}`;

  document.getElementById("costTotal").textContent =
    `💰 Cost To Make: ${cost.toLocaleString()}`;
}

function renderList(id, data) {
  const el = document.getElementById(id);
  el.innerHTML = "";

  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    el.innerHTML = `<div class="muted">None required.</div>`;
    return;
  }

  entries.forEach(([name, qty]) => {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `<span>${name}</span><strong>${qty.toLocaleString()}</strong>`;
    el.appendChild(row);
  });
}

// ===============================
// ADD / UPDATE EDITOR
// ===============================
function openAddItem() {
  document.getElementById("popup").style.display = "flex";
  populateEditItemSelect();
  populateCostEditor();
  resetEditor();
}

function closeAddItem() {
  document.getElementById("popup").style.display = "none";
}

function populateEditItemSelect() {
  const select = document.getElementById("editItemSelect");
  select.innerHTML = `<option value="">New Item</option>`;

  Object.keys(items)
    .sort()
    .forEach(item => {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });

  select.onchange = () => {
    if (select.value) {
      loadItemIntoEditor(select.value);
    } else {
      resetEditor();
    }
  };
}

function resetEditor() {
  document.getElementById("newItem").value = "";
  document.getElementById("newXP").value = "";
  document.getElementById("componentsList").innerHTML = "";
  document.getElementById("materialsList").innerHTML = "";
  document.getElementById("authCode").value = "";
}

function loadItemIntoEditor(itemName) {
  resetEditor();

  document.getElementById("newItem").value = itemName;
  document.getElementById("newXP").value = items[itemName]?.xp || 0;

  const itemMaterials = items[itemName]?.materials || {};
  Object.entries(itemMaterials).forEach(([name, qty]) => {
    addEditorRow("materialsList", name, qty);
  });

  const itemComponents = recipes[itemName] || [];
  itemComponents.forEach(component => {
    addEditorRow("componentsList", component.component, component.qty);
  });
}

function addEditorRow(containerId, name = "", qty = "") {
  const container = document.getElementById(containerId);

  const row = document.createElement("div");
  row.className = "editor-row";

  row.innerHTML = `
    <input class="entry-name" placeholder="Name" value="${escapeHtml(name)}">
    <input class="entry-qty" type="number" min="0" placeholder="Qty" value="${qty}">
    <button type="button" onclick="this.parentElement.remove()">✖</button>
  `;

  container.appendChild(row);
}

function getEditorRows(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .editor-row`))
    .map(row => ({
      name: row.querySelector(".entry-name").value.trim(),
      qty: Number(row.querySelector(".entry-qty").value) || 0
    }))
    .filter(row => row.name && row.qty > 0);
}

async function submitItem() {
  const payload = {
    item: document.getElementById("newItem").value.trim(),
    xp: Number(document.getElementById("newXP").value) || 0,
    components: getEditorRows("componentsList"),
    materials: getEditorRows("materialsList"),
    code: document.getElementById("authCode").value.trim()
  };

  if (!payload.item) {
    alert("Item name is required");
    return;
  }

  const res = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  if (!result.ok) {
    alert(`❌ ${result.error || "Save failed"}`);
    return;
  }

  alert("✅ Item saved");

  closeAddItem();

  await loadData();
  initDropdown();
  renderCraftQueue();

  if (viewMode === "single") {
    calculateSingle();
  } else {
    calculateQueue();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function populateCostEditor() {
  const select = document.getElementById("costMaterialSelect");
  select.innerHTML = "";

  Object.keys(costMap)
    .sort()
    .forEach(material => {
      const opt = document.createElement("option");
      opt.value = material;
      opt.textContent = material;
      select.appendChild(opt);
    });

  if (select.options.length > 0) {
    select.selectedIndex = 0;
    document.getElementById("costPerInput").value =
      costMap[select.value] || 0;
  }

  select.onchange = () => {
    document.getElementById("costPerInput").value =
      costMap[select.value] || 0;
  };
}

async function submitCostUpdate() {
  const authCode = document.getElementById("authCode").value.trim();

  if (!authCode) {
    alert("Authenticator code is required to update costs.");
    return;
  }

  const payload = {
    action: "updateCost",
    material: document.getElementById("costMaterialSelect").value,
    costPer: Number(document.getElementById("costPerInput").value) || 0,
    code: authCode
  };

  const res = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  if (!result.ok) {
    alert(`❌ ${result.error || "Cost update failed"}`);
    return;
  }

  alert("✅ Cost updated");

  await loadData();
  populateCostEditor();

  if (viewMode === "single") {
    calculateSingle();
  } else {
    calculateQueue();
  }
}
