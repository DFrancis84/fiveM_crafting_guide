// ===============================
// 🌐 CONFIG
// ===============================

// 👉 Replace with your published Google Sheets JSON endpoints
const SHEET_ID = "1-VghUNT10zMsQoYNkADkZDu2yyW4Al0ealROIu6A2Zc"

const ITEMS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=Items`;
const RECIPES_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=Recipes`;

// materials you DO NOT want counted as recyclable
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
// 📦 GLOBAL DATA
// ===============================
let items = {};     // { itemName: { xp, materials:{} } }
let recipes = {};   // { itemName: [ { component, qty } ] }
let costMap = {};

// ===============================
// 🚀 INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  initDropdown();

  const itemSelect = document.getElementById("itemSelect");
  const quantityInput = document.getElementById("quantity");

  if (itemSelect.options.length > 0) {
    itemSelect.selectedIndex = 0;
  }

  itemSelect.addEventListener("change", calculate);
  quantityInput.addEventListener("input", calculate);

  calculate();
});
/**
  window.onload = async () => {
  await loadData();
  initDropdown();

  const itemSelect = document.getElementById("itemSelect");
  const quantityInput = document.getElementById("quantity");

  if (itemSelect.options.length > 0) {
    itemSelect.selectedIndex = 0;
  }

  // Auto-calculate on load
  calculate();

  // Auto-calculate when changed
  itemSelect.addEventListener("change", calculate);
  quantityInput.addEventListener("input", calculate);
};
*/
// ===============================
// 📥 LOAD DATA (HEADER-BASED)
// ===============================
async function loadData() {
  const res = await fetch("https://lucidcrafting.devinfrancis84.workers.dev/api/data");
  const data = await res.json();

  items = data.items;
  recipes = data.recipes;
  costMap = data.costs;
}

// ===============================
// 🧠 PARSE ITEMS TAB
// ===============================
function parseItems(data) {
  const headers = data[0];

  const itemIndex = headers.indexOf("Item Name");
  const xpIndex = headers.indexOf("XP");

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const itemName = row[itemIndex];

    if (!itemName) continue;

    const xp = Number(row[xpIndex]) || 0;
    const materials = {};

    headers.forEach((header, idx) => {
      if (idx === itemIndex || idx === xpIndex) return;

      const val = Number(row[idx]) || 0;
      if (val > 0) {
        materials[header] = val;
      }
    });

    items[itemName] = {
      xp,
      materials
    };
  }
}

// ===============================
// 🧩 PARSE RECIPES TAB
// ===============================
function parseRecipes(data) {
  const headers = data[0];

  const itemIndex = headers.indexOf("Item Name");
  const compIndex = headers.indexOf("Component");
  const qtyIndex = headers.indexOf("Qty");

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const item = row[itemIndex];
    const component = row[compIndex];
    const qty = Number(row[qtyIndex]) || 0;

    if (!item || !component || !qty) continue;

    if (!recipes[item]) {
      recipes[item] = [];
    }

    recipes[item].push({ component, qty });
  }
}

// ===============================
// 🎯 DROPDOWN INIT
// ===============================
function initDropdown() {
  const select = document.getElementById("itemSelect");
  select.innerHTML = "";

  Object.keys(items).forEach(item => {
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
// 🧩 COMPONENT RESOLUTION
// ===============================
function getComponents(item, qty, result = {}) {
  const comps = recipes[item];
  if (!comps) return result;

  comps.forEach(c => {
    const total = c.qty * qty;

    result[c.component] = (result[c.component] || 0) + total;

    // recurse deeper
    getComponents(c.component, total, result);
  });

  return result;
}

// ===============================
// 📦 MATERIAL CALCULATION
// ===============================
function getMaterials(item, qty, result = {}) {
  const itemData = items[item];
  if (!itemData) return result;

  // direct materials
  Object.entries(itemData.materials).forEach(([mat, val]) => {
    result[mat] = (result[mat] || 0) + val * qty;
  });

  // recurse components
  const comps = recipes[item];
  if (comps) {
    comps.forEach(c => {
      getMaterials(c.component, c.qty * qty, result);
    });
  }

  return result;
}

// ===============================
// ⭐ XP CALCULATION
// ===============================
function getXP(item, qty) {
  let total = (items[item]?.xp || 0) * qty;

  const comps = recipes[item];
  if (comps) {
    comps.forEach(c => {
      total += getXP(c.component, c.qty * qty);
    });
  }

  return total;
}

// ===============================
// ♻️ RECYCLABLE CALCULATION
// ===============================
function getRecyclableTotal(materials) {
  let total = 0;

  Object.entries(materials).forEach(([mat, qty]) => {
    if (!nonRecyclableMaterials.has(mat)) {
      total += qty;
    }
  });

  return total;
}

// ===============================
// 💲 CRAFTING COST CALCULATION
// =============================== 
function getCraftCost(materials) {
  let totalCost = 0;

  let recyclableTotal = 0;

  Object.entries(materials).forEach(([mat, qty]) => {
    if (mat === "Titanium" ||
        mat === "Circuit Board" ||
        mat === "Control Chip" ||
        mat === "Power Supply") {

      const costPer = costMap[mat] || 0;
      totalCost += qty * costPer;

    } else {
      // everything else = recyclable
      recyclableTotal += qty;
    }
  });

  // apply recyclable cost
  const recyclableCost = costMap["Recyclable Materials"] || 0;
  totalCost += recyclableTotal * recyclableCost;

  return totalCost;
}
// ===============================
// 🧾 CRAFTING QUEUE
// ===============================
function addCraftRow(item = "", qty = 1) {
  const container = document.getElementById("craftQueue");

  const row = document.createElement("div");
  row.className = "row-input";

  row.innerHTML = `
    <select class="queue-item"></select>
    <input type="number" class="queue-qty" value="${qty}" min="1">
    <button onclick="this.parentElement.remove()">❌</button>
  `;

  container.appendChild(row);

  populateRowDropdown(row.querySelector(".queue-item"), item);
}

function populateRowDropdown(select, selected = "") {
  Object.keys(items).forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    if (item === selected) opt.selected = true;
    select.appendChild(opt);
  });
}

function calculateQueue() {
  const rows = document.querySelectorAll("#craftQueue .row-input");

  let totalMaterials = {};
  let totalComponents = {};
  let totalXP = 0;

  const queueBreakdown = [];

  rows.forEach(row => {
    const item = row.querySelector(".queue-item").value;
    const qty = Number(row.querySelector(".queue-qty").value) || 1;

    const components = getComponents(item, qty);
    const materials = getMaterials(item, qty);
    const xp = getXP(item, qty);
    const recyclable = getRecyclableTotal(materials);
    const cost = getCraftCost(materials);

    queueBreakdown.push({
      item,
      qty,
      components,
      materials,
      xp,
      recyclable,
      cost
    });

    Object.entries(components).forEach(([name, amount]) => {
      totalComponents[name] = (totalComponents[name] || 0) + amount;
    });

    Object.entries(materials).forEach(([name, amount]) => {
      totalMaterials[name] = (totalMaterials[name] || 0) + amount;
    });

    totalXP += xp;
  });

  renderPerItemBreakdown(queueBreakdown);

  const recyclable = getRecyclableTotal(totalMaterials);
  const cost = getCraftCost(totalMaterials);

  renderList("components", totalComponents);
  renderList("materials", totalMaterials);

  document.getElementById("xpTotal").textContent =
    `⭐ XP Gained: ${totalXP.toLocaleString()}`;

  document.getElementById("recyclableTotal").textContent =
    `♻️ Recyclable Materials Needed: ${recyclable.toLocaleString()}`;

  document.getElementById("costTotal").textContent =
    `💰 Cost To Make: ${cost.toLocaleString()}`;
}

// ===============================
// 🎯 MAIN CALCULATE
// ===============================
function calculate() {
  const item = document.getElementById("itemSelect").value;
  const qty = Math.max(1, Number(document.getElementById("quantity").value) || 1);

  const components = getComponents(item, qty);
  const materials = getMaterials(item, qty);
  const xp = getXP(item, qty);
  const recyclable = getRecyclableTotal(materials);
  const cost = getCraftCost(materials);

  renderList("components", components);
  renderList("materials", materials);

  document.getElementById("xpTotal").textContent = `⭐ XP Gained: ${xp}`;
  document.getElementById("recyclableTotal").textContent =
    `♻️ Recyclable Materials Needed: ${recyclable}`;
  document.getElementById("costTotal").textContent =
    `💰 Cost To Make: ${cost.toLocaleString()}`;
}

// ===============================
// 🧾 ADD / UPDATE
// ===============================
function openAddItem() {
  document.getElementById("popup").style.display = "flex";
  populateEditItemSelect();
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
  row.className = "row-input";

  row.innerHTML = `
    <input class="entry-name" placeholder="Name" value="${name}">
    <input class="entry-qty" type="number" min="0" placeholder="Qty" value="${qty}">
    <button type="button" onclick="this.parentElement.remove()">✖</button>
  `;

  container.appendChild(row);
}

function getEditorRows(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .row-input`))
    .map(row => {
      return {
        name: row.querySelector(".entry-name").value.trim(),
        qty: Number(row.querySelector(".entry-qty").value) || 0
      };
    })
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

  const res = await fetch(SHEET_ENDPOINT, {
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
  calculate();
}

// ===============================
// 🧾 RENDER HELPER
// ===============================
function renderList(id, data) {
  const el = document.getElementById(id);
  el.innerHTML = "";

  Object.entries(data)
    .sort((a, b) => b[1] - a[1]) // sort descending
    .forEach(([name, qty]) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span>${name}</span><span>${qty}</span>`;
      el.appendChild(row);
    });
}

function renderPerItemBreakdown(queueItems) {
  const container = document.getElementById("perItemBreakdown");
  container.innerHTML = "";

  queueItems.forEach(entry => {
    const card = document.createElement("div");
    card.className = "breakdown-card";

    const materialsHtml = Object.entries(entry.materials)
      .sort((a, b) => b[1] - a[1])
      .map(([name, qty]) => `<div class="row"><span>${name}</span><span>${qty.toLocaleString()}</span></div>`)
      .join("");

    const componentsHtml = Object.entries(entry.components)
      .sort((a, b) => b[1] - a[1])
      .map(([name, qty]) => `<div class="row"><span>${name}</span><span>${qty.toLocaleString()}</span></div>`)
      .join("");

    card.innerHTML = `
      <h3>${entry.item} x${entry.qty}</h3>

      <h4>🧩 Components</h4>
      ${componentsHtml || `<div class="muted">No components required</div>`}

      <h4>📦 Materials</h4>
      ${materialsHtml || `<div class="muted">No materials required</div>`}

      <div class="summary-line">⭐ XP: ${entry.xp.toLocaleString()}</div>
      <div class="summary-line">♻️ Recyclables: ${entry.recyclable.toLocaleString()}</div>
      <div class="summary-line">💰 Cost: ${entry.cost.toLocaleString()}</div>
    `;

    container.appendChild(card);
  });
}
