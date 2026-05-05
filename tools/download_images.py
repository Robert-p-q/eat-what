"""
批量下载菜品图片工具
数据源：360 图片搜索 (免费API，无需Key，国内可访问)
"""

import json
import os
import sys
import time
import re
import io
import requests
import urllib3
from pathlib import Path

urllib3.disable_warnings()

# Windows GBK 兼容
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

WORKTREE = Path(__file__).resolve().parent.parent
FOODS_JSON = WORKTREE / "data" / "foods.json"
IMAGES_DIR = WORKTREE / "images"

IMAGES_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://image.so.com/",
}

PROXIES = {"http": "http://127.0.0.1:17890", "https": "http://127.0.0.1:17890"}

session = requests.Session()
session.headers.update(HEADERS)
session.verify = False
session.proxies.update(PROXIES)


def load_foods():
    with open(FOODS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def save_foods(data):
    with open(FOODS_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 已保存 foods.json")


def sanitize_filename(name):
    name = re.sub(r'[\\/:*?"<>|]', "", name)
    return name.strip()


def make_filename(stall, name, floor=None):
    stall_clean = sanitize_filename(stall)
    name_clean = sanitize_filename(name)
    if floor:
        return f"{stall_clean}-{floor}-{name_clean}.jpg"
    return f"{stall_clean}-{name_clean}.jpg"


def download_image(url, filepath, max_size_mb=2):
    if filepath.exists() and filepath.stat().st_size > 5000:
        return True
    try:
        resp = session.get(url, timeout=20, stream=True)
        if resp.status_code != 200:
            return False
        content_type = resp.headers.get("content-type", "")
        if "image" not in content_type:
            return False
        content = b""
        for chunk in resp.iter_content(chunk_size=8192):
            content += chunk
            if len(content) > max_size_mb * 1024 * 1024:
                return False
        filepath.write_bytes(content)
        return filepath.stat().st_size > 5000
    except Exception as e:
        return False


# ============================================================
# 策略1: 360 图片搜索 (主方案，国内可用)
# ============================================================

def search_360_images(query, max_results=5):
    """使用360图片搜索获取图片URL列表"""
    url = "https://image.so.com/j"
    params = {"q": query, "sn": 0, "pn": max_results, "ps": 0}
    try:
        resp = session.get(url, params=params, timeout=15)
        if resp.status_code != 200:
            return []
        data = resp.json()
        urls = []
        for item in data.get("list", []):
            img_url = item.get("img") or item.get("thumb") or item.get("qhimg_url")
            if img_url:
                # Ensure HTTPS
                img_url = img_url.replace("http://", "https://")
                urls.append(img_url)
        return urls
    except Exception as e:
        return []


def try_360(name, filepath):
    """从360图片搜索下载菜品图片"""
    # 尝试多种搜索词
    queries = [name, f"{name} 美食", f"{name} 菜"]
    for q in queries:
        urls = search_360_images(q)
        for url in urls:
            if download_image(url, filepath):
                print(f"  ✅ [OK] {name}")
                return True
            time.sleep(0.3)
    return False


# ============================================================
# 主流程
# ============================================================

def main():
    data = load_foods()
    missing = [d for d in data if not d.get("image")]
    total = len(missing)

    if total == 0:
        print("所有菜品已有图片！")
        return

    print(f"共 {total} 道菜需要配图\n")

    # 扫描已有图片
    existing = set()
    for f in IMAGES_DIR.iterdir():
        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            existing.add(f.stem)

    stats = {"downloaded": 0, "failed": 0}
    need_manual = []

    for i, item in enumerate(missing):
        stall = item["stall"]
        name = item["name"]
        floor = item.get("floor", "")

        same_name = [d for d in data if d["name"] == name]
        floors = set(d["floor"] for d in same_name)
        need_floor = len(floors) > 1

        filename = make_filename(stall, name, floor if need_floor else None)
        filepath = IMAGES_DIR / filename

        # 检查已有文件
        if filepath.name in existing or filename in existing:
            item["image"] = f"images/{filename}"
            print(f"  [{i+1}/{total}] ⏭️  已有：{name}")
            continue

        name_filepath = IMAGES_DIR / f"{sanitize_filename(name)}.jpg"
        if name_filepath.exists():
            item["image"] = f"images/{sanitize_filename(name)}.jpg"
            print(f"  [{i+1}/{total}] ⏭️  已有(按菜名)：{name}")
            continue

        print(f"  [{i+1}/{total}] {name}", end="", flush=True)

        # 从360图片搜索下载
        if try_360(name, filepath):
            item["image"] = f"images/{filename}"
            stats["downloaded"] += 1
        else:
            need_manual.append(item)
            stats["failed"] += 1
            print(f"\r  [{i+1}/{total}] ❌ {name}")

    # 保存
    save_foods(data)

    print(f"\n下载统计：")
    print(f"  ✅ 成功: {stats['downloaded']}")
    print(f"  ⏭️  已有: {total - stats['failed'] - stats['downloaded']}")
    print(f"  ❌ 失败: {stats['failed']}")

    if need_manual:
        print(f"\n以下 {len(need_manual)} 道菜需要手动补图：")
        for item in need_manual:
            name = item["name"]
            stall = item["stall"]
            floor = item.get("floor", "")
            floors = set(d["floor"] for d in data if d["name"] == name)
            filename = make_filename(stall, name, floor if len(floors) > 1 else None)
            print(f"  {name}  ->  {filename}")


if __name__ == "__main__":
    main()
