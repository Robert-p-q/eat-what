"""
清洗 foods.json 标签：按口味/主食/风格/食材 4 维度标准化
"""
import json, re, sys, io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
FOODS_JSON = ROOT / "data" / "foods.json"

# 映射：原始 tag → 标准化 tag（按维度）
TAG_MAP = {
    # ===== 口味 (taste) =====
    "辣": "辣", "香辣": "香辣", "麻辣": "麻辣", "酸辣": "酸辣",
    "番茄": "番茄", "清淡": "清淡", "酸甜": "酸甜",
    # ===== 主食 (staple) =====
    "米饭": "饭", "盖饭": "饭", "炒饭": "饭", "捞饭": "饭",
    "牛肉饭": "饭", "双拼饭": "饭",
    "面": "面", "面食": "面", "面类": "面", "拌面": "面",
    "汤面": "面", "浇头面": "面", "板面": "面", "热干面": "面",
    "干拌面": "面",
    "米粉": "粉", "米线": "粉", "粉面": "粉", "汤粉": "粉",
    "鱼粉": "粉", "土豆粉": "粉",
    "水饺": "饺子馄饨", "馄饨": "饺子馄饨",
    "饼": "饼", "饼类": "饼", "煎饼": "饼", "包子": "饼",
    # ===== 风格/烹饪方式 (cuisine) =====
    "盖饭": "盖饭", "捞饭": "捞饭",
    "拌面": "拌面", "汤面": "汤面", "干拌面": "拌面",
    "浇头面": "拌面", "板面": "汤面", "热干面": "干拌",
    "干拌": "干拌", "卤味": "干拌",
    "水煮": "水煮",
    "麻辣烫": "麻辣烫", "麻辣拌": "干拌",
    "套餐": "套餐", "双拼饭": "套餐",
    # ===== 食材 (protein) =====
    "牛肉": "牛肉", "鸡肉": "鸡肉", "猪肉": "猪肉", "鱼肉": "鱼肉",
    "排骨": "猪肉", "五花肉": "猪肉", "猪肝": "猪肉",
    "鸡排": "鸡肉", "鸡柳": "鸡肉",
    "培根": "猪肉", "火腿": "猪肉", "里脊": "猪肉",
    "肥牛": "牛肉", "牛杂": "牛肉", "牛肚": "牛肉",
    "羊杂": "牛肉",
    "巴沙鱼": "鱼肉", "小酥鱼": "鱼肉",
    "鸡蛋": "鸡蛋", "煎蛋": "鸡蛋", "炸蛋": "鸡蛋",
    "肉沫": "猪肉", "肉酱": "猪肉", "辣肉": "猪肉",
    "鸡肉": "鸡肉",
    "素菜": "素菜", "豆腐": "素菜", "茄子": "素菜",
    "素馅": "素菜", "花甲": "鱼肉",
    "鱼豆腐": "鱼肉",
    "烤鸭": "鸡肉", "鸡腿": "鸡肉", "鸡肉": "鸡肉",
    "拆骨肉": "猪肉",
    "小酥肉": "猪肉",
    # 额外修正
    "炒饭": "饭",
    "轻食": "素菜",
    "金汤": "",
    "干拌面": "干拌",
    "辣椒炒肉": "辣",
    "牛杂": "牛肉",
    "羊杂": "牛肉",
    "鱼粉": "粉",
    "土豆粉": "粉",
    "卤味": "干拌",
    "下饭菜": "",
    "湘菜": "",
    "川菜": "",
}

# 要删除的冗余/无分类价值 tag
REMOVE_TAGS = {"经典", "热门", "主食", "快餐", "早餐", "小吃",
               "自选", "汤类", "下饭菜", "配菜", "湘菜", "川菜",
               "招牌"}

def clean_tags(old_tags):
    """清洗单个菜品的 tags"""
    new_tags = set()
    for t in old_tags:
        t = t.strip()
        if t in REMOVE_TAGS:
            continue
        mapped = TAG_MAP.get(t)
        if mapped:
            new_tags.add(mapped)
        elif mapped == "":
            continue  # 显式跳过
        else:
            # 尝试模糊匹配
            for key, val in TAG_MAP.items():
                if key in t or t in key:
                    new_tags.add(val)
                    break
            else:
                print(f"  [?] 未映射的 tag: [{t}]")
    return sorted(new_tags)

def main():
    with open(FOODS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    changes = 0
    for item in data:
        old = item.get("tags", [])
        new = clean_tags(old)
        if set(old) != set(new):
            print(f"  {item['name']}: {old} → {new}")
            item["tags"] = new
            changes += 1

    with open(FOODS_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n共修改 {changes} 条记录")

if __name__ == "__main__":
    main()
