/* ============================================
   app.js — 应用主逻辑
   ============================================ */

let foods = [];
let foodsReady = false;
let current = null;
let favoritesVisible = false;

// 筛选状态（由 app 持有，传给 data 层的筛选函数）
const filters = {
  taste: new Set(),
  staple: new Set(),
  cuisine: new Set(),
  protein: new Set(),
  canteen: "all",
  dislikes: new Set(),
  priceMin: 0,
  priceMax: 999,
};

// ---- 数据加载 ----
async function loadFoods() {
  const root = document.getElementById("appRoot");
  const resultEl = document.getElementById("result");
  const summary = document.getElementById("filtersSummaryText");

  foodsReady = false;
  root?.classList.add("app-blocked");
  root?.classList.remove("app-error");
  root?.setAttribute("aria-busy", "true");

  setControlsDisabled(true);
  if (summary) summary.textContent = "菜单加载中…";
  if (resultEl) resultEl.innerHTML = '<div class="init-hint"><span class="init-hint-icon">⏳</span><span class="init-hint-text">正在加载菜单…</span></div>';
  if (window._statusTimer) clearTimeout(window._statusTimer);
  document.getElementById("status").textContent = "";
  document.getElementById("status").classList.remove("show");

  try {
    const res = await fetch(foodsDataUrl(), { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    let data;
    try { data = await res.json(); } catch { throw new Error("解析 JSON 失败"); }
    if (!Array.isArray(data)) throw new Error("根节点应为数组");

    const { list, skipped } = normalizeFoodsArray(data);
    if (skipped.length) console.warn(`[foods] 已跳过 ${skipped.length} 条无效记录：`, skipped);
    if (list.length === 0) {
      throw new Error(skipped.length ? "没有通过校验的菜品" : "菜单为空数组");
    }

    foods = list;
    foodsReady = true;

    // 加载本地黑名单
    filters.dislikes = new Set(getData("dislikes"));

    root?.classList.remove("app-blocked");
    root?.classList.remove("app-error");
    root?.removeAttribute("aria-busy");
    setControlsDisabled(false);

    current = null;
    setActionEnabled(false);
    setPrimaryLabel(false);
    showInitHint();
    updateFilterSummary(foods, filters, true);

    if (skipped.length) showStatus(`已跳过 ${skipped.length} 条无效菜品（详情见控制台）`);

    // 暴露重试
    window._retryLoad = loadFoods;

  } catch (err) {
    foods = [];
    foodsReady = false;
    root?.classList.add("app-blocked");
    root?.classList.add("app-error");
    root?.removeAttribute("aria-busy");
    setControlsDisabled(true);
    if (summary) summary.textContent = "菜单加载失败";
    showErrorResult(formatLoadError(err));
    const rawMsg = String(err?.message || "");
    const hint = /file:\/\/|Failed to fetch|fetch|NetworkError|无法发起请求/i.test(rawMsg)
      ? "请使用本地静态服务器打开项目目录"
      : "请检查 data/foods.json 是否存在、路径正确";
    showStatus(hint);
    window._retryLoad = loadFoods;
  }
}

// ---- 推荐 ----
function recommend() {
  if (!foodsReady) { showStatus("菜单尚未加载完成"); return; }

  const list = getFilteredList(foods, filters);
  if (list.length === 0) { showEmptyResult(); showStatus("放宽筛选条件试试"); return; }

  // 优先推荐未吃过的
  const eaten = getRecentEaten(7);
  const uneaten = list.filter(f => !eaten.has(f.name));
  const pool = uneaten.length > 0 ? uneaten : list;

  let newFood;
  do {
    newFood = pool[Math.floor(Math.random() * pool.length)];
  } while (pool.length > 1 && current && newFood.name === current.name);

  current = newFood;
  setActionEnabled(true);
  setPrimaryLabel(true);
  recordEat(current.name);

  animateSlotMachine(pool, newFood, () => {
    renderFoodCard(newFood);
  });
}

// ---- 收藏 ----
function addFavorite() {
  if (!current) return;
  const fav = getData("favorites");
  if (!fav.includes(current.name)) {
    fav.push(current.name);
    setData("favorites", fav);
    showStatus("已收藏");
    renderFavorites(favoritesVisible);
  } else {
    showStatus("已在收藏里");
  }
}

function removeFavorite(name) {
  const fav = getData("favorites").filter(x => x !== name);
  setData("favorites", fav);
  showStatus("已移除");
  renderFavorites(favoritesVisible);
}
window._removeFavorite = removeFavorite;

function toggleFavorites() {
  favoritesVisible = !favoritesVisible;
  const wrap = document.getElementById("favList");
  if (wrap) wrap.hidden = !favoritesVisible;
  renderFavorites(favoritesVisible);
}

function clearFavorites() {
  setData("favorites", []);
  showStatus("已清空收藏");
  renderFavorites(favoritesVisible);
}

// ---- 不想吃 ----
function addDislike() {
  if (!current) return;
  const dis = getData("dislikes");
  if (!dis.includes(current.name)) {
    dis.push(current.name);
    setData("dislikes", dis);
    filters.dislikes.add(current.name);
    showStatus("已标记为不想吃");
    updateFilterSummary(foods, filters, foodsReady);
  } else {
    showStatus("已经是不想吃了");
  }
}

// ---- 筛选事件 ----
function onFilterChange() {
  current = null;
  setActionEnabled(false);
  setPrimaryLabel(false);
  showInitHint("已筛选，点一下开始", "🔎");
  updateFilterSummary(foods, filters, foodsReady);
}

function onChipToggle(key, value, pressed) {
  if (!filters[key]) return;
  if (pressed) filters[key].add(value);
  else filters[key].delete(value);
  onFilterChange();
}

function clearAllFilters() {
  Object.keys(filters).forEach(k => {
    if (filters[k] instanceof Set) filters[k].clear();
  });
  filters.priceMin = 0;
  filters.priceMax = 999;
  document.getElementById("priceMin").value = "0";
  document.getElementById("priceMax").value = "999";

  document.querySelectorAll(".chip").forEach(btn => {
    btn.setAttribute("aria-pressed", "false");
  });

  current = null;
  setActionEnabled(false);
  setPrimaryLabel(false);
  showInitHint("已清空筛选，点一下开始", "🧹");
  updateFilterSummary(foods, filters, foodsReady);
}

function onPriceChange() {
  const min = parseFloat(document.getElementById("priceMin").value) || 0;
  const max = parseFloat(document.getElementById("priceMax").value) || 999;
  filters.priceMin = min;
  filters.priceMax = max;
  onFilterChange();
}

// ---- 初始化 ----
document.addEventListener("DOMContentLoaded", () => {
  // 初始化食堂选择
  window.__canteenSelect = initCanteenSelect(() => {
    filters.canteen = window.__canteenSelect.getValue();
    onFilterChange();
  });

  // 渲染筛选 chip
  renderChips("tasteChips", FILTER_OPTIONS.taste, "taste", onChipToggle);
  renderChips("stapleChips", FILTER_OPTIONS.staple, "staple", onChipToggle);
  renderChips("cuisineChips", FILTER_OPTIONS.cuisine, "cuisine", onChipToggle);
  renderChips("proteinChips", FILTER_OPTIONS.protein, "protein", onChipToggle);

  // 价格筛选
  document.getElementById("priceMin")?.addEventListener("change", onPriceChange);
  document.getElementById("priceMax")?.addEventListener("change", onPriceChange);

  // 清空筛选
  document.getElementById("clearFiltersBtn")?.addEventListener("click", clearAllFilters);

  // 默认收起筛选
  document.getElementById("filtersDetails")?.removeAttribute("open");

  // 主按钮
  document.getElementById("primaryBtn")?.addEventListener("click", recommend);

  // 收藏 / 排除
  document.getElementById("favBtn")?.addEventListener("click", addFavorite);
  document.getElementById("banBtn")?.addEventListener("click", addDislike);
  document.getElementById("showFavBtn")?.addEventListener("click", toggleFavorites);
  document.getElementById("clearFavBtn")?.addEventListener("click", clearFavorites);

  // 初始状态
  setActionEnabled(false);
  setPrimaryLabel(false);

  // 加载数据
  loadFoods();
});
