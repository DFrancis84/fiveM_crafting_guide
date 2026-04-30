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

// ===============================
// 🚀 INIT
// ===============================
window.onload = async () => {
  await loadData();
  initDropdown();
};

// ===============================
// 📥 LOAD DATA (HEADER-BASED)
// ===============================
async function loadData() {
  const res = await fetch("/api/data");
  const data = await res.json();

  items = data.items;
  recipes = data.recipes;
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
// 🎯 MAIN CALCULATE
// ===============================
function calculate() {
  const item = document.getElementById("itemSelect").value;
  const qty = Number(document.getElementById("quantity").value);

  const components = getComponents(item, qty);
  const materials = getMaterials(item, qty);
  const xp = getXP(item, qty);
  const recyclable = getRecyclableTotal(materials);

  renderList("components", components);
  renderList("materials", materials);

  document.getElementById("xpTotal").textContent =
    `⭐ XP Gained: ${xp}`;

  document.getElementById("recyclableTotal").textContent =
    `♻️ Recyclable Materials Needed: ${recyclable}`;
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
