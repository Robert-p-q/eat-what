/* ============================================
   ui.js — UI 组件
   ============================================ */

// ---- 初始化自定义食堂下拉 ----
function initCanteenSelect(onChange) {
  const trigger = document.getElementById("canteenTrigger");
  const menu = document.getElementById("canteenMenu");
  const valueEl = document.getElementById("canteenValue");
  const arrow = trigger?.querySelector(".select-arrow");
  const options = menu?.querySelectorAll(".select-option");
  if (!trigger || !menu || !valueEl || !options) return;

  let isOpen = false;

  function getValue() {
    const sel = menu.querySelector('.select-option[aria-selected="true"]');
    return sel ? sel.dataset.value : "all";
  }

  function setValue(val) {
    options.forEach(opt => {
      opt.setAttribute("aria-selected", String(opt.dataset.value === val));
    });
    const sel = menu.querySelector('.select-option[aria-selected="true"]');
    valueEl.textContent = sel ? sel.textContent : "全部食堂";
  }

  function openMenu() {
    isOpen = true;
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    arrow?.classList.add("open");
  }

  function closeMenu() {
    isOpen = false;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    arrow?.classList.remove("open");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    isOpen ? closeMenu() : openMenu();
  });

  options.forEach(opt => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = opt.dataset.value;
      if (val !== getValue()) {
        setValue(val);
        onChange?.();
      }
      closeMenu();
    });
  });

  document.addEventListener("click", () => { if (isOpen) closeMenu(); });

  // 键盘导航
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); isOpen ? closeMenu() : openMenu(); }
    if (e.key === "Escape" && isOpen) closeMenu();
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !isOpen) { e.preventDefault(); openMenu(); }
  });

  menu.addEventListener("keydown", (e) => {
    const items = Array.from(options);
    const cur = items.findIndex(o => o.getAttribute("aria-selected") === "true");
    if (e.key === "ArrowDown") { e.preventDefault(); setValue(items[(cur + 1) % items.length].dataset.value); }
    if (e.key === "ArrowUp") { e.preventDefault(); setValue(items[(cur - 1 + items.length) % items.length].dataset.value); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange?.(); closeMenu(); trigger.focus(); }
    if (e.key === "Escape") { closeMenu(); trigger.focus(); }
  });

  return { getValue, setValue };
}

// ---- Chip 渲染 ----
function renderChips(containerId, options, filterKey, onToggle) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  wrap.innerHTML = options.map(opt => {
    const id = String(opt.id || "").trim();
    const label = String(opt.label || "").trim();
    return `<button type="button" class="chip" data-filter-key="${filterKey}" data-filter-value="${id}" aria-pressed="false">${label}</button>`;
  }).join("");

  wrap.querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const b = e.currentTarget;
      const key = b?.dataset?.filterKey;
      const val = b?.dataset?.filterValue;
      if (!key || !val) return;
      const pressed = b.getAttribute("aria-pressed") === "true";
      b.setAttribute("aria-pressed", pressed ? "false" : "true");
      onToggle?.(key, val, !pressed);
    });
  });
}

// ---- 食物卡片渲染 ----
function renderFoodCard(food) {
  const resultEl = document.getElementById("result");

  function makeFoodImg(src, alt) {
    const wrap = document.createElement("div");
    wrap.className = "food-img-wrap";
    const skeleton = document.createElement("div");
    skeleton.className = "img-skeleton";
    wrap.appendChild(skeleton);
    const img = document.createElement("img");
    img.className = "food-img";
    img.src = src;
    img.alt = alt;
    img.loading = "lazy";
    img.onload = function () {
      skeleton.remove();
      img.classList.add("loaded");
    };
    img.onerror = function () {
      skeleton.remove();
      wrap.innerHTML = '<div class="food-img-fallback">🍽️</div>';
    };
    wrap.appendChild(img);
    return wrap.outerHTML;
  }

  const imgHtml = food.image
    ? makeFoodImg(food.image, food.name)
    : `<div class="food-img-wrap"><div class="food-img-fallback">🍽️</div></div>`;

  const tagsHtml = (Array.isArray(food.tags) ? food.tags : [])
    .map(tag => `<span data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`)
    .join("");

  resultEl.innerHTML = `
    <div class="food-card">
      ${imgHtml}
      <div class="top">
        <span>${escapeHtml(food.canteen)} · ${escapeHtml(food.floor)}</span>
        <span class="price-badge">¥${food.price}</span>
      </div>
      <div class="stall">${escapeHtml(food.stall)}</div>
      <div class="food-name">${escapeHtml(food.name)}</div>
      <div class="tags">${tagsHtml}</div>
    </div>`;
}

// ---- 老虎机动效 ----
function animateSlotMachine(pool, target, callback) {
  const resultEl = document.getElementById("result");

  const names = [];
  const others = pool.filter(f => f.name !== target.name);
  for (let i = 0; i < 10; i++) {
    if (others.length > 0) {
      names.push(others[Math.floor(Math.random() * others.length)].name);
    } else {
      names.push(target.name);
    }
  }
  names.push(target.name);

  const durations = names.map((_, i) => {
    const t = i / (names.length - 1);
    return 50 + t * t * 350;
  });

  resultEl.innerHTML = '<div class="slot-stage"><div class="slot-name"></div></div>';
  const slotEl = resultEl.querySelector(".slot-name");

  let idx = 0;
  function tick() {
    if (idx >= names.length) { callback(); return; }
    slotEl.textContent = names[idx];
    slotEl.style.animation = "none";
    void slotEl.offsetHeight;
    slotEl.style.animation = idx === names.length - 1
      ? "slotReveal 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
      : "slotPulse 0.12s ease";
    setTimeout(tick, durations[idx] || 100);
    idx++;
  }
  tick();
}

// ---- UI 状态更新 ----
function showStatus(message) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  if (window._statusTimer) clearTimeout(window._statusTimer);
  window._statusTimer = setTimeout(() => {
    el.classList.remove("show");
    el.textContent = "";
  }, 2000);
}

function updateFilterSummary(foods, filters, foodsReady) {
  if (!foodsReady) return;
  const list = getFilteredList(foods, filters);
  const parts = [];
  if (filters.taste.size) parts.push(`口味：${[...filters.taste].join("、")}`);
  if (filters.staple.size) parts.push(`主食：${[...filters.staple].join("、")}`);
  if (filters.cuisine.size) parts.push(`风格：${[...filters.cuisine].join("、")}`);
  if (filters.protein.size) parts.push(`食材：${[...filters.protein].join("、")}`);
  const tasteText = parts.length ? parts.join("；") : "口味：不限；主食：不限";
  const text = `${tasteText}（可选 ${list.length} 道）`;

  const summary = document.getElementById("filtersSummaryText");
  if (summary) summary.textContent = text;
  showStatus(text);
}

function showInitHint(text, icon) {
  const resultEl = document.getElementById("result");
  const emoji = icon || "🍽️";
  const msg = text || "选好食堂和口味，点一下开始";
  if (resultEl) resultEl.innerHTML = `<div class="init-hint"><span class="init-hint-icon">${emoji}</span><span class="init-hint-text">${msg}</span></div>`;
}

function showEmptyResult() {
  document.getElementById("result").innerHTML = `
    <div class="empty-result">
      <span class="empty-result-icon">🤔</span>
      <div class="empty-result-text">没得选了</div>
      <div class="empty-result-hint">放宽筛选条件，或去收藏/不想吃看看</div>
    </div>`;
}

function showErrorResult(msg) {
  document.getElementById("result").innerHTML = `
    <div class="load-error" role="alert">
      <strong>无法加载菜单</strong>
      <div style="margin-top:8px;opacity:0.92">${escapeHtml(msg)}</div>
      <button type="button" class="retry-btn" onclick="window._retryLoad?.()">重新加载</button>
    </div>`;
}

function setPrimaryLabel(hasCurrent) {
  const btn = document.getElementById("primaryBtn");
  if (btn) btn.textContent = hasCurrent ? "再来一个" : "开始推荐";
}

function setActionEnabled(enabled) {
  document.getElementById("favBtn").disabled = !enabled;
  document.getElementById("banBtn").disabled = !enabled;
}

function setControlsDisabled(disabled) {
  document.getElementById("primaryBtn")?.toggleAttribute("disabled", disabled);
  document.getElementById("clearFiltersBtn")?.toggleAttribute("disabled", disabled);
  document.querySelectorAll(".chip").forEach(b => b.toggleAttribute("disabled", disabled));
  document.getElementById("canteenTrigger")?.toggleAttribute("disabled", disabled);
}

// ---- 收藏列表 ----
function renderFavorites(favoritesVisible) {
  const fav = getData("favorites");
  const ul = document.getElementById("favUl");
  const clearBtn = document.getElementById("clearFavBtn");
  if (clearBtn) clearBtn.disabled = fav.length === 0;
  if (!ul || !favoritesVisible) return;

  if (fav.length === 0) {
    ul.innerHTML = '<li class="fav-empty">暂无收藏</li>';
    return;
  }

  ul.innerHTML = fav.map(name =>
    `<li class="fav-li"><span class="fav-name">${escapeHtml(name)}</span><button type="button" class="fav-remove" data-name="${name.replaceAll('"', '&quot;')}">移除</button></li>`
  ).join("");

  ul.querySelectorAll(".fav-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const n = e.currentTarget?.dataset?.name;
      if (n) window._removeFavorite?.(n);
    });
  });
}
