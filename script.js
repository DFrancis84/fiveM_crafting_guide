let recipes = {};
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
// 🧠 LOAD GOOGLE SHEETS DATA
// ===============================
async function loadRecipes() {
  const sheetId = "1-VghUNT10zMsQoYNkADkZDu2yyW4Al0ealROIu6A2Zc";

  const urls = {
    base: `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=BaseMaterials`,
    direct: `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=DirectMaterials`,
    components: `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Recipes`
  };

  const [base, direct, components] = await Promise.all([
    fetchSheet(urls.base),
    fetchSheet(urls.direct),
    fetchSheet(urls.components)
  ]);

  buildWideMaterials(base);
  buildWideMaterials(direct);
  buildComponents(components);
}

// ===============================
// 📊 PARSE GOOGLE SHEET RESPONSE
// ===============================
async function fetchSheet(url) {
  const res = await fetch(url);
  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  return json.table.rows;
}

// ===============================
// 🧱 BASE + DIRECT MATERIALS
// (WIDE FORMAT SHEETS)
// ===============================
function buildWideMaterials(rows) {
  const mats = ["Plastic", "Aluminum", "Steel", "Rubber", "Scrap", "Electronics", "Glass", "Wire", "Titanium", "Circuit Board", "Control Chip", "Power Supply", "Charcoal", "Sulfur", "Gunpowder", "Golden Nugget", "Copper Ore"];

  rows.forEach(row => {
    const item = row.c[0]?.v;
    if (!item) return;

    if (!recipes[item]) {
      recipes[item] = { components: [], materials: [] };
    }

    mats.forEach((mat, i) => {
      const qty = row.c[i + 1]?.v;

      if (qty && qty > 0) {
        recipes[item].materials.push({
          item: mat,
          qty: Number(qty)
        });
      }
    });
  });
}

// ===============================
// 🧩 COMPONENTS (NARROW FORMAT)
// ===============================
function buildComponents(rows) {
  rows.forEach(row => {
    const item = row.c[0]?.v;
    const component = row.c[1]?.v;
    const qty = Number(row.c[2]?.v);

    if (!item || !component) return;

    if (!recipes[item]) {
      recipes[item] = { components: [], materials: [] };
    }

    recipes[item].components.push({
      item: component,
      qty: qty || 1
    });
  });
}

// ===============================
// 🔁 RECURSIVE COMPONENT EXPANSION
// ===============================
function getComponents(item, qty, result = {}) {
  const data = recipes[item];
  if (!data || !data.components) return result;

  data.components.forEach(c => {
    const total = c.qty * qty;

    result[c.item] = (result[c.item] || 0) + total;

    getComponents(c.item, total, result);
  });

  return result;
}

// ===============================
// 📦 FULL MATERIAL FLATTENING
// ===============================
function getMaterials(item, qty, result = {}) {
  const data = recipes[item];
  if (!data) return result;

  // direct materials
  if (data.materials) {
    data.materials.forEach(m => {
      const total = m.qty * qty;
      result[m.item] = (result[m.item] || 0) + total;
    });
  }

  // recurse into components
  if (data.components) {
    data.components.forEach(c => {
      getMaterials(c.item, c.qty * qty, result);
    });
  }

  return result;
}

function getRecyclableBreakdown(materials) {
  let total = 0;
  const breakdown = {};

  Object.entries(materials).forEach(([item, qty]) => {
    if (!nonRecyclableMaterials.has(item)) {
      total += qty;
      breakdown[item] = qty;
    }
  });

  return { total, breakdown };
}

// ===============================
// 🎯 UI ACTION
// ===============================
function calculate() {
  const item = document.getElementById("itemSelect").value;
  const qty = Number(document.getElementById("quantity").value);

  const components = getComponents(item, qty);
  const materials = getMaterials(item, qty);

  renderList("components", components);
  renderList("materials", materials);

  // ♻️ recyclable calculation (STEP 4 goes HERE)
  const { total } = getRecyclableBreakdown(materials);

  document.getElementById("recyclableTotal").textContent =
    `♻️ Recyclable Materials Needed: ${total}`;
}

// ===============================
// 🧾 RENDER UI LIST
// ===============================
function renderList(id, data) {
  const el = document.getElementById(id);
  el.innerHTML = "";

  Object.entries(data).forEach(([name, qty]) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${name}</span><span>${qty}</span>`;
    el.appendChild(row);
  });
}

// ===============================
// 🎮 DROPDOWN INIT
// ===============================
function initDropdown() {
  const select = document.getElementById("itemSelect");
  select.innerHTML = "";

  Object.keys(recipes)
    .filter(item => recipes[item].components || recipes[item].materials)
    .sort()
    .forEach(item => {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });
}

// ===============================
//   ADD ITEM
// ===============================
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbxksBFBhN-NWPLRbD4sPk5UuqtRZWmH9z-hp9OLaabeXba3lRFM7A1nO2xzr6uQW3yd-w/exec";

function openAddItem() {
  document.getElementById("popup").style.display = "block";
}

function closeAddItem() {
  document.getElementById("popup").style.display = "none";
}

async function submitItem() {
  const payload = {
    item: document.getElementById("newItem").value,
    type: document.getElementById("newType").value,
    name: document.getElementById("newName").value,
    qty: Number(document.getElementById("newQty").value),
    code: document.getElementById("authCode").value
  };

const SHEET_ENDPOINT = "https://crafting-api.devinfrancis84.workers.dev";
try {
  await fetch(SHEET_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  alert("✅ Submitted (check sheet)");

  closeAddItem();
  location.reload();

} catch (err) {
  alert("❌ Failed to submit");
}

  alert("✅ Success");
  closeAddItem();
  location.reload();
}

// ===============================
// 🚀 BOOT SEQUENCE
// ===============================
window.onload = async () => {
  await loadRecipes();
  initDropdown();

  const select = document.getElementById("itemSelect");
  if (select.options.length > 0) {
    select.selectedIndex = 0;
  }
};
