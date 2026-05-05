"""
替换有问题的菜品图片
保留：炸蛋肉酱米粉
其他不匹配的全部重新下载
"""
import json, os, sys, time, re, io, requests, urllib3
from pathlib import Path

urllib3.disable_warnings()
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

WORKTREE = Path(__file__).resolve().parent.parent
FOODS_JSON = WORKTREE / "data" / "foods.json"
IMAGES_DIR = WORKTREE / "images"

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
    print(f"\n已保存 foods.json")

def sanitize_filename(name):
    return re.sub(r'[\\/:*?"<>|]', "", name).strip()

def search_360_images(query, max_results=8):
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
                img_url = img_url.replace("http://", "https://")
                urls.append(img_url)
        return urls
    except:
        return []

def download_image(url, filepath, max_size_mb=2):
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
    except:
        return False

def download_better_image(name, stall, filepath):
    """Try multiple queries to get a better image"""
    queries = [
        f"{name} {stall} 美食",
        f"{name} {stall}",
        f"{name} 菜",
        f"{name} 实拍",
        f"{stall} {name}",
        f"{name}",
    ]
    for q in queries:
        urls = search_360_images(q, max_results=8)
        for url in urls:
            if download_image(url, filepath):
                return True
            time.sleep(0.3)
    return False

def main():
    data = load_foods()

    # Dishes to replace (all except 炸蛋肉酱米粉)
    to_replace = [
        "咸鸭蛋",
        "小街牛杂面",
        "牛肉小笼包",
        "众品土豆粉",
        "鲍汁大鸡排捞饭",
        "招牌肉沫米粉",
        "卤汁护心肉饭套餐",
        "安徽板面",
        "拆骨肉粉丝汤+饼",
        "浓香番茄口味小酥肉鱼粉",
        "香煎培根鸡蛋炒饭",
        "原味肉酱米粉",
    ]

    stats = {"ok": 0, "fail": 0}

    for item in data:
        if item["name"] not in to_replace:
            continue

        name = item["name"]
        stall = item["stall"]
        old_image = item.get("image", "")

        # Delete old image file
        if old_image:
            old_path = WORKTREE / old_image
            if old_path.exists():
                old_path.unlink()
                print(f"  删除旧图: {old_image}")

        # Determine new filename
        same_name = [d for d in data if d["name"] == name]
        floors = set(d.get("floor", "") for d in same_name)
        need_floor = len(floors) > 1

        stall_clean = sanitize_filename(stall)
        name_clean = sanitize_filename(name)
        floor = item.get("floor", "")
        if need_floor and floor:
            new_filename = f"{stall_clean}-{floor}-{name_clean}.jpg"
        else:
            new_filename = f"{stall_clean}-{name_clean}.jpg"

        new_path = IMAGES_DIR / new_filename

        # If new filename is same as old, just download over it
        # If different, old was already deleted above

        print(f"  下载: {name}", end="", flush=True)
        if download_better_image(name, stall, new_path):
            item["image"] = f"images/{new_filename}"
            print(f"  OK")
            stats["ok"] += 1
        else:
            print(f"  失败!")
            stats["fail"] += 1

    save_foods(data)
    print(f"\n结果: {stats['ok']} 成功, {stats['fail']} 失败")

if __name__ == "__main__":
    main()
