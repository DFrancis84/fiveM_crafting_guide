const DATA_ENDPOINT = "https://lucidcrafting.devinfrancis84.workers.dev/api/data";
const SAVE_ENDPOINT = "https://lucidcrafting.devinfrancis84.workers.dev/api/save";

let items = {};
let categories = {};
let recipes = {};
let kits = {};
let costMap = {};

let materialOptions = [];
let componentOptions = [];
let categoryOptions = [];

document.addEventListener("DOMContentLoaded", async () => {
  const isAuthed = sessionStorage.getItem("adminAuthed") === "true";
  const adminCode = sessionStorage.getItem("adminCode");

  if (!isAuthed || !adminCode) {
    window.location.href = "index.html";
    return;
  }

  await loadData();
  buildEditorOptions();
  populateCategoryOptions();
  populateEditItemSelect();
  populateCostEditor();
  resetEditor();

  document.getElementById("logoutAdminBtn").addEventListener("click", logoutAdmin);
  document.getElementById("resetEditorBtn").addEventListener("click", resetEditor);
  document.getElementById("submitEditorBtn").addEventListener("click", submitItem);
  document.getElementById("deleteItemBtn").addEventListener("click", deleteCurrentItem);
  document.getElementById("saveCostBtn").addEventListener("click", submitCostUpdate);

  document.getElementById("addComponentRowBtn").addEventListener("click", () => {
    addEditorRow("componentsList");
  });

  document.getElementById("addMaterialRowBtn").addEventListener("click", () => {
    addEditorRow("materialsList");
  });
});

async function loadData() {
  const res = await fetch(DATA_ENDPOINT);
  const data = await res.json();

  if (!res.ok || data.ok === false) {
    alert(`Failed to load data: ${data.error || "Unknown error"}`);
    return;
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
  document.getElementById("editItemSelect").value = "";
  document.getElementById("newCategory").value = "";
  document.getElementById("newItem").value = "";
  document.getElementById("newXP").value = "";
  document.getElementById("newStopXP").value = "";
  document.getElementById("componentsList").innerHTML = "";
  document.getElementById("materialsList").innerHTML = "";
  document.getElementById("adminPreview").innerHTML = "Creating a new item.";
}

function loadItemIntoEditor(itemName) {
  resetEditor();

  const item = items[itemName] || {};

  document.getElementById("editItemSelect").value = itemName;
  document.getElementById("newCategory").value = item.category || "";
  document.getElementById("newItem").value = itemName;
  document.getElementById("newXP").value = item.xp || 0;
  document.getElementById("newStopXP").value = item.stopXP || 0;

  Object.entries(item.materials || {}).forEach(([name, qty]) => {
    addEditorRow("materialsList", name, qty);
  });

  (recipes[itemName] || []).forEach(component => {
    addEditorRow("componentsList", component.component, component.qty);
  });

  renderPreview(itemName);
}

function renderPreview(itemName) {
  const item = items[itemName];
  const components = recipes[itemName] || [];

  if (!item) {
    document.getElementById("adminPreview").innerHTML = "No item selected.";
    return;
  }

  const materialsHtml = Object.entries(item.materials || {})
    .map(([name, qty]) => `<div class="result-row"><span>${escapeHtml(name)}</span><strong>${qty}</strong></div>`)
    .join("") || `<div class="muted">No materials.</div>`;

  const componentsHtml = components
    .map(c => `<div class="result-row"><span>${escapeHtml(c.component)}</span><strong>${c.qty}</strong></div>`)
    .join("") || `<div class="muted">No components.</div>`;

  document.getElementById("adminPreview").innerHTML = `
    <div><strong>Category:</strong> ${escapeHtml(item.category || "Other")}</div>
    <div><strong>XP:</strong> ${(item.xp || 0).toLocaleString()}</div>
    <div><strong>Stop Level:</strong> ${((item.stopXP || 0) / 100).toLocaleString()}</div>

    <div class="section-divider"></div>

    <strong>Materials</strong>
    ${materialsHtml}

    <div class="section-divider"></div>

    <strong>Components</strong>
    ${componentsHtml}
  `;
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

function populateCategoryOptions() {
  const datalist = document.getElementById("categoryOptions");
  datalist.innerHTML = "";

  categoryOptions.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    datalist.appendChild(opt);
  });
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
  const code = sessionStorage.getItem("adminCode");

  const payload = {
    action: "updateItem",
    category: document.getElementById("newCategory").value.trim() || "Other",
    item: document.getElementById("newItem").value.trim(),
    xp: Number(document.getElementById("newXP").value) || 0,
    stopXP: Number(document.getElementById("newStopXP").value) || 0,
    components: getEditorRows("componentsList"),
    materials: getEditorRows("materialsList"),
    code
  };

  if (!payload.item) {
    alert("Item name is required.");
    return;
  }

  const result = await postSave(payload);

  if (!result.ok) {
    alert(`❌ ${result.error || "Save failed"}`);
    return;
  }

  alert("✅ Item saved");

  await refreshAdminData();
  document.getElementById("editItemSelect").value = payload.item;
  loadItemIntoEditor(payload.item);
}

async function deleteCurrentItem() {
  const selected = document.getElementById("editItemSelect").value;
  const typed = document.getElementById("newItem").value.trim();
  const item = selected || typed;

  if (!item) {
    alert("Select or enter an item to delete.");
    return;
  }

  const confirmed = confirm(`Delete "${item}" from Items and Recipes?`);
  if (!confirmed) return;

  const result = await postSave({
    action: "deleteItem",
    item,
    code: sessionStorage.getItem("adminCode")
  });

  if (!result.ok) {
    alert(`❌ ${result.error || "Delete failed"}`);
    return;
  }

  alert("✅ Item deleted");

  await refreshAdminData();
  resetEditor();
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
  const material = document.getElementById("costMaterialSelect").value;
  const costPer = Number(document.getElementById("costPerInput").value) || 0;

  if (!material) {
    alert("Material is required.");
    return;
  }

  const result = await postSave({
    action: "updateCost",
    material,
    costPer,
    code: sessionStorage.getItem("adminCode")
  });

  if (!result.ok) {
    alert(`❌ ${result.error || "Cost update failed"}`);
    return;
  }

  alert("✅ Cost updated");

  await refreshAdminData();
}

async function refreshAdminData() {
  await loadData();
  buildEditorOptions();

  populateCategoryOptions();   // 👈 ADD THIS LINE

  populateEditItemSelect();
  populateCostEditor();
}

async function postSave(payload) {
  const res = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  if (!res.ok || !result.ok) {
    return { ok: false, error: result.error || "Request failed" };
  }

  return result;
}

function logoutAdmin() {
  sessionStorage.removeItem("adminAuthed");
  sessionStorage.removeItem("adminCode");
  window.location.href = "index.html";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
