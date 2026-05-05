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

let materialOptions = [];
let componentOptions = [];
let categoryOptions = [];
let ownedMaterials = {};

document.addEventListener("DOMContentLoaded", async () => {
  const popup = document.getElementById("popup");
  if (popup) popup.style.display = "none";

  await loadData();
  buildEditorOptions();
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

  document.getElementById("addQueueBtn").addEventListener("click", addSelectedItemToQueue);
  document.getElementById("openEditorBtn").addEventListener("click", openAddItem);

  document.getElementById("singleViewBtn").addEventListener("click", () => setViewMode("single"));
  document.getElementById("queueViewBtn").addEventListener("click", () => setViewMode("queue"));

  document.getElementById("includeComponentXP").addEventListener("change", e => {
    localStorage.setItem("includeComponentXP", e.target.checked);
    recalculateCurrentView();
  });

  document.querySelectorAll('input[name="fixerBoost"]').forEach(input => {
    input.addEventListener("change", recalculateCurrentView);
  });

  document.getElementById("addComponentRowBtn").addEventListener("click", () => {
    addEditorRow("componentsList");
  });

  document.getElementById("addMaterialRowBtn").addEventListener("click", () => {
    addEditorRow("materialsList");
  });

  document.getElementById("submitEditorBtn").addEventListener("click", submitItem);
  document.getElementById("closeEditorBtn").addEventListener("click", closeAddItem);
  document.getElementById("saveCostBtn").addEventListener("click", submitCostUpdate);

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

function buildEditorOptions() {
  const materialSet = new Set();
  const categorySet = new Set(Object.keys(categories));

  Object.values(items).forEach(item => {
    if (item.category) categorySet.add(item.category);
    Object.keys(item.materials || {}).forEach(mat => materialSet.add(mat));
  });

  Object.keys(costMap).forEach(mat => {
    if (mat !== "Recyclable Materials") materialSet.add(mat);
  });

  materialOptions = Array.from(materialSet).sort();
  componentOptions = Object.keys(items).sort();
  categoryOptions = Array.from(categorySet).sort();
}

function initDropdowns() {
  const categorySelect = document.getElementById("categorySelect");
  categorySelect.innerHTML = `<option value="">Select Category</option>`;

  categoryOptions.forEach(category => {
    const opt = document.createElement("option");
    opt.value = category;
    opt.textContent = category;
    categorySelect.appendChild(opt);
  });

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
  const materials = getMaterials(item, qty);
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

  const includeComponentXP = document.getElementById("includeComponentXP").checked;

  craftQueue.forEach(entry => {
    const components = getComponents(entry.item, entry.qty);
    const materials = getMaterials(entry.item, entry.qty);
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

  const useOwned = document.getElementById("useOwnedMaterials")?.checked;

  entries.forEach(([name, qty]) => {
    const row = document.createElement("div");

    if (id === "materials" && useOwned) {
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

  const materialsForOne = getMaterials(item, 1);
  const recyclableNeeded = getRecyclableTotal(materialsForOne);

  if (recyclableNeeded <= 0) {
    output.textContent = "Can craft: ∞";
    return;
  }

  const craftable = Math.floor(owned / recyclableNeeded);
  output.textContent = `Can craft: ${craftable.toLocaleString()}`;
}

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

  Object.keys(items).sort().forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    select.appendChild(opt);
  });

  select.onchange = () => {
    if (select.value) loadItemIntoEditor(select.value);
    else resetEditor();
  };
}

function resetEditor() {
  document.getElementById("newCategory").value = "";
  document.getElementById("newItem").value = "";
  document.getElementById("newXP").value = "";
  document.getElementById("newStopXP").value = "";
  document.getElementById("componentsList").innerHTML = "";
  document.getElementById("materialsList").innerHTML = "";
  document.getElementById("authCode").value = "";
}

function loadItemIntoEditor(itemName) {
  resetEditor();

  document.getElementById("newCategory").value = items[itemName]?.category || "";
  document.getElementById("newItem").value = itemName;
  document.getElementById("newXP").value = items[itemName]?.xp || 0;
  document.getElementById("newStopXP").value = items[itemName]?.stopXP || 0;

  Object.entries(items[itemName]?.materials || {}).forEach(([name, qty]) => {
    addEditorRow("materialsList", name, qty);
  });

  (recipes[itemName] || []).forEach(component => {
    addEditorRow("componentsList", component.component, component.qty);
  });
}

function addEditorRow(containerId, name = "", qty = "") {
  const container = document.getElementById(containerId);

  const options = containerId === "materialsList"
    ? materialOptions
    : componentOptions;

  const row = document.createElement("div");
  row.className = "editor-row";

  row.innerHTML = `
    <select class="entry-name">
      ${buildOptions(options, name)}
      <option value="__custom__" ${!options.includes(name) && name ? "selected" : ""}>Custom...</option>
    </select>

    <input class="custom-entry-name" placeholder="Custom name" value="${!options.includes(name) ? escapeHtml(name) : ""}" style="display:${!options.includes(name) && name ? "block" : "none"};">

    <input class="entry-qty" type="number" min="0" placeholder="Qty" value="${qty}">
    <button type="button" onclick="this.parentElement.remove()">✖</button>
  `;

  const select = row.querySelector(".entry-name");
  const customInput = row.querySelector(".custom-entry-name");

  select.addEventListener("change", () => {
    customInput.style.display = select.value === "__custom__" ? "block" : "none";
  });

  container.appendChild(row);
}

function buildOptions(list, selected = "") {
  return list.map(item => `
    <option value="${escapeHtml(item)}" ${item === selected ? "selected" : ""}>
      ${escapeHtml(item)}
    </option>
  `).join("");
}

function getEditorRows(containerId) {
  const rows = Array.from(document.querySelectorAll(`#${containerId} .editor-row`));

  const parsed = rows.map(row => {
    const selected = row.querySelector(".entry-name").value;
    const custom = row.querySelector(".custom-entry-name").value.trim();
    const qty = Number(row.querySelector(".entry-qty").value) || 0;

    const name = selected === "__custom__" ? custom : selected;

    return { name, qty };
  }).filter(row => row.name && row.qty > 0);

  const merged = {};

  parsed.forEach(row => {
    merged[row.name] = (merged[row.name] || 0) + row.qty;
  });

  return Object.entries(merged).map(([name, qty]) => ({ name, qty }));
}

async function submitItem() {
  const authCode = document.getElementById("authCode").value.trim();

  if (!authCode) {
    alert("Authenticator code is required.");
    return;
  }

  const payload = {
    action: "updateItem",
    category: document.getElementById("newCategory").value.trim() || "Other",
    item: document.getElementById("newItem").value.trim(),
    xp: Number(document.getElementById("newXP").value) || 0,
    stopXP: Number(document.getElementById("newStopXP").value) || 0,
    components: getEditorRows("componentsList"),
    materials: getEditorRows("materialsList"),
    code: authCode
  };

  if (!payload.item) {
    alert("Item name is required.");
    return;
  }

  const res = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  if (!res.ok || !result.ok) {
    alert(`❌ ${result.error || "Save failed"}`);
    return;
  }

  alert("✅ Item saved");
  closeAddItem();

  await loadData();
  buildEditorOptions();
  initDropdowns();
  renderCraftQueue();
  recalculateCurrentView();
}

function populateCostEditor() {
  const select = document.getElementById("costMaterialSelect");
  select.innerHTML = "";

  Object.keys(costMap).sort().forEach(material => {
    const opt = document.createElement("option");
    opt.value = material;
    opt.textContent = material;
    select.appendChild(opt);
  });

  if (select.options.length > 0) {
    select.selectedIndex = 0;
    document.getElementById("costPerInput").value = costMap[select.value] || 0;
  }

  select.onchange = () => {
    document.getElementById("costPerInput").value = costMap[select.value] || 0;
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  if (!res.ok || !result.ok) {
    alert(`❌ ${result.error || "Cost update failed"}`);
    return;
  }

  alert("✅ Cost updated");

  await loadData();
  buildEditorOptions();
  populateCostEditor();
  recalculateCurrentView();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
