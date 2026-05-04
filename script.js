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

let materialOptions = [];
let componentOptions = [];
let categoryOptions = [];

// ===============================
// INIT
// ===============================

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

  ownedMaterials = JSON.parse(localStorage.getItem("ownedMaterials") || "{}");

  document.getElementById("categorySelect").addEventListener("change", () => {
    populateItemDropdown(document.getElementById("categorySelect").value);
    recalculateCurrentView();
  });

  document.getElementById("itemSelect").addEventListener("change", recalculateCurrentView);
  document.getElementById("quantity").addEventListener("input", recalculateCurrentView);

  document.getElementById("ownedRecyclables").addEventListener("input", updateCraftableCount);

  document.getElementById("useOwnedMaterials").addEventListener("change", () => {
    recalculateCurrentView();
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

// ===============================
// DATA LOADING
// ===============================

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

  Object.keys(fallback).forEach(category => {
    fallback[category].sort();
  });

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

// ===============================
// DROPDOWNS
// ===============================

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
  itemSelect.innerHTML = `<
