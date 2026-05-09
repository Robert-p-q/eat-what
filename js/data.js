/* ============================================
   data.js — 数据层
   ============================================ */

const FOODS_DATA_REVISION = "3";
const ALLOWED_CATEGORIES = new Set(["main", "side", "snack", "drink"]);

// 筛选选项定义
const FILTER_OPTIONS = {
  taste: [
    { id: "辣", label: "辣" },
    { id: "香辣", label: "香辣" },
    { id: "麻辣", label: "麻辣" },
    { id: "酸辣", label: "酸辣" },
    { id: "清淡", label: "清淡" },
  ],
  staple: [
    { id: "饭", label: "饭" },
    { id: "面", label: "面" },
    { id: "粉", label: "粉" },
    { id: "饺子馄饨", label: "饺子/馄饨" },
    { id: "饼", label: "饼" },
  ],
  cuisine: [
    { id: "盖饭", label: "盖饭" },
    { id: "捞饭", label: "捞饭" },
    { id: "拌面", label: "拌面" },
    { id: "汤面", label: "汤面" },
    { id: "水煮", label: "水煮" },
    { id: "麻辣烫", label: "麻辣烫" },
    { id: "套餐", label: "套餐" },
    { id: "干拌", label: "干拌/卤味" },
  ],
  protein: [
    { id: "牛肉", label: "牛肉" },
    { id: "鸡肉", label: "鸡肉" },
    { id: "猪肉", label: "猪肉" },
    { id: "鱼肉", label: "鱼肉" },
    { id: "鸡蛋", label: "鸡蛋" },
    { id: "素菜", label: "素菜" },
  ],
};

function foodsDataUrl() {
  const u = new URL("data/foods.json", window.location.href);
  u.searchParams.set("v", FOODS_DATA_REVISION);
  return u.href;
}

// ---- localStorage ----
function getData(key) {
  return JSON.parse(localStorage.getItem(key) || "[]");
}
function setData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ---- 历史记录 ----
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("history") || "{}");
  } catch { return {}; }
}
function saveHistory(history) {
  localStorage.setItem("history", JSON.stringify(history));
}
function recordEat(name) {
  const today = new Date().toISOString().slice(0, 10);
  const h = getHistory();
  if (!h[today]) h[today] = [];
  if (!h[today].includes(name)) h[today].push(name);
  // 只保留最近 30 天
  const keys = Object.keys(h).sort().reverse();
  if (keys.length > 30) {
    keys.slice(30).forEach(k => delete h[k]);
  }
  saveHistory(h);
}
function getRecentEaten(days = 7) {
  const h = getHistory();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const eaten = new Set();
  Object.keys(h).forEach(k => {
    if (k >= cutoffStr) {
      h[k].forEach(name => eaten.add(name));
    }
  });
  return eaten;
}

// ---- 数据校验 ----
function normalizeFoodsArray(rawList) {
  const list = [];
  const skipped = [];

  rawList.forEach((raw, index) => {
    const pos = `#${index}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      skipped.push({ pos, reason: "不是对象" });
      return;
    }

    const canteen = typeof raw.canteen === "string" ? raw.canteen.trim() : "";
    const floor = typeof raw.floor === "string" ? raw.floor.trim() : "";
    const stall = typeof raw.stall === "string" ? raw.stall.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const priceNum = Number(raw.price);

    if (!name) { skipped.push({ pos, reason: "name 缺失或为空" }); return; }
    if (!canteen) { skipped.push({ pos, reason: "canteen 缺失或为空" }); return; }
    if (!floor) { skipped.push({ pos, reason: "floor 缺失或为空" }); return; }
    if (!stall) { skipped.push({ pos, reason: "stall 缺失或为空" }); return; }
    if (!Number.isFinite(priceNum)) { skipped.push({ pos, reason: `price 无效` }); return; }

    let tags = [];
    if (Array.isArray(raw.tags)) {
      tags = raw.tags.map(t => (typeof t === "string" ? t.trim() : String(t ?? "").trim())).filter(Boolean);
    } else if (raw.tags != null) {
      console.warn(`[foods] ${pos}「${name}」tags 不是数组`);
    }

    let category = "main";
    if (raw.category != null && typeof raw.category === "string" && ALLOWED_CATEGORIES.has(raw.category)) {
      category = raw.category;
    }

    const image = typeof raw.image === "string" ? raw.image.trim() : "";

    list.push({ canteen, floor, stall, name, price: priceNum, tags, category, image });
  });

  return { list, skipped };
}

// ---- 筛选匹配 ----
function tagMatch(food, tagList) {
  const tags = Array.isArray(food?.tags) ? food.tags : [];
  return tagList.some(t => tags.includes(t));
}

function matchFilters(food, filters) {
  // 食堂
  if (filters.canteen !== "all" && food.canteen !== filters.canteen) return false;
  // 口味
  if (filters.taste.size > 0 && !tagMatch(food, [...filters.taste])) return false;
  // 主食
  if (filters.staple.size > 0 && !tagMatch(food, [...filters.staple])) return false;
  // 风格
  if (filters.cuisine.size > 0 && !tagMatch(food, [...filters.cuisine])) return false;
  // 食材
  if (filters.protein.size > 0 && !tagMatch(food, [...filters.protein])) return false;
  // 价格
  if (food.price < filters.priceMin || food.price > filters.priceMax) return false;
  // 不想吃
  if (filters.dislikes.has(food.name)) return false;
  return true;
}

function getFilteredList(foods, filters) {
  return foods.filter(f => f.category === "main" && matchFilters(f, filters));
}

function formatLoadError(err) {
  const name = err && err.name;
  const msg = err && err.message ? String(err.message) : String(err);
  if (name === "TypeError" && /fetch|Failed to fetch|Load failed|network/i.test(msg)) {
    return "无法发起请求（请使用本地静态服务器如 Live Server 打开页面）";
  }
  if (/AbortError/i.test(name || "") || /aborted/i.test(msg)) return "请求已取消";
  return msg;
}

function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}
