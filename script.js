let recipes = {};

async function loadRecipes() {
  const res = await fetch("recipes.json");
  recipes = await res.json();
}

// 🧩 Recursive expansion of components
function getComponents(item, qty, result = {}) {
  const data = recipes[item];
  if (!data || !data.components) return result;

  data.components.forEach(c => {
    const total = c.qty * qty;

    result[c.item] = (result[c.item] || 0) + total;

    // recurse deeper
    getComponents(c.item, total, result);
  });

  return result;
}

// 📦 Flatten raw materials
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

// 🎯 UI render
function calculate() {
  const item = document.getElementById("itemSelect").value;
  const qty = Number(document.getElementById("quantity").value);

  const components = getComponents(item, qty) || {};
  const materials = getMaterials(item, qty) || {};

  renderList("components", components);
  renderList("materials", materials);
}

// 🧾 reusable renderer
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

function initDropdown() {
  const select = document.getElementById("itemSelect");
  select.innerHTML = "";

  Object.keys(recipes)
    .filter(item => recipes[item].components || recipes[item].materials)
    .forEach(item => {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });
}

window.onload = async () => {
  await loadRecipes();   // ⬅️ load JSON first
  initDropdown();        // ⬅️ then populate dropdown

  const select = document.getElementById("itemSelect");
  if (select.options.length > 0) {
    select.selectedIndex = 0;
  }
};
