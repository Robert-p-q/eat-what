"""
批量生成菜品图片工具
使用 inference.sh belt CLI 调用 P-Image 模型生成统一风格的菜品图片

使用方法：
  1. 先登录：belt login
  2. 运行：python tools/generate_images.py

P-Image 费用：约 $0.0001/张，75 张总计约 $0.0075
"""
import json, sys, io, os, time, subprocess
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
FOODS_JSON = ROOT / "data" / "foods.json"
IMAGES_DIR = ROOT / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# belt 可执行文件路径
BELT = str(Path.home() / ".local" / "bin" / "belt")

# 统一的图片风格提示词后缀
STYLE_PROMPT = (
    "professional food photography, studio lighting, "
    "canon eos r5, 85mm lens, shallow depth of field, "
    "appetizing, clean white plate, light wooden table surface, "
    "top-down angle, 3:2 aspect ratio, high resolution, "
    "no text, no watermark, no people"
)

def sanitize_filename(name):
    import re
    name = re.sub(r'[\\/:*?"<>|]', "", name)
    return name.strip()

def make_filename(stall, name, floor=None):
    stall_clean = sanitize_filename(stall)
    name_clean = sanitize_filename(name)
    if floor:
        return f"{stall_clean}-{floor}-{name_clean}.jpg"
    return f"{stall_clean}-{name_clean}.jpg"

def build_prompt(name, stall):
    """为每道菜生成英文提示词"""
    prompt = (
        f"A plate of {name} (Chinese dish from {stall} stall), "
        f"{STYLE_PROMPT}"
    )
    return prompt

def generate_image(prompt, filename):
    """调用 belt 生成图片，返回 True/False"""
    filepath = IMAGES_DIR / filename
    if filepath.exists() and filepath.stat().st_size > 10000:
        print(f"  ⏭️  已存在：{filename}")
        return True

    cmd = [
        BELT, "app", "run", "pruna/p-image",
        "--input", json.dumps({
            "prompt": prompt,
            "aspect_ratio": "3:2",
        }, ensure_ascii=False),
    ]

    print(f"  🎨 生成中：{filename}", end="", flush=True)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=120,
        )

        # belt 输出包含 ANSI 转义码，需清理后提取 URL
        import re
        raw_out = result.stdout.decode("utf-8", errors="replace")
        # 去除 ANSI 转义序列
        clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', raw_out)
        clean = re.sub(r'\x1b\][0-9;]*[^\x1b]*\x1b\\', '', clean)
        lines = [l.strip() for l in clean.splitlines() if l.strip()]

        if result.returncode != 0:
            err = result.stderr.decode("utf-8", errors="replace")[:200]
            print(f"  ❌ (exit {result.returncode})：{err}")
            return False

        # 从输出中找图片 URL
        img_url = None
        for line in lines:
            if line.startswith("http") and any(ext in line for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                img_url = line
                break

        if img_url:
            import requests as req
            resp = req.get(img_url, timeout=30)
            if resp.status_code == 200:
                filepath.write_bytes(resp.content)
                if filepath.stat().st_size > 5000:
                    print(f"  ✅")
                    return True

        # 如果 belt 只返回了图片 URL 不含扩展名，也尝试下载
        for line in lines:
            if line.startswith("http") and "://" in line:
                import requests as req
                resp = req.get(line, timeout=30)
                if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
                    filepath.write_bytes(resp.content)
                    if filepath.stat().st_size > 5000:
                        print(f"  ✅")
                        return True

        print(f"  ⚠️  未找到图片 URL（输出：{lines[-1] if lines else '空'}）")
        return False

    except subprocess.TimeoutExpired:
        print(f"  ❌ 超时")
        return False
    except Exception as e:
        print(f"  ❌ 错误：{e}")
        return False

def main():
    # 检查 belt 是否登录
    result = subprocess.run([BELT, "me"], capture_output=True)
    if result.returncode != 0:
        print("❌ 未登录！请先运行：belt login --key YOUR_API_KEY")
        print("   获取 key：https://app.inference.sh/settings/keys")
        return

    print("✅ belt 已登录")
    print()

    # 读取菜品数据
    with open(FOODS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 只处理 main 类别的菜品
    items = [d for d in data if d.get("category", "main") == "main"]
    total = len(items)
    print(f"共 {total} 道菜需要生成图片\n")

    stats = {"ok": 0, "skip": 0, "fail": 0}

    for i, item in enumerate(items):
        stall = item["stall"]
        name = item["name"]
        floor = item.get("floor", "")

        # 确定文件名
        same_name = [d for d in data if d["name"] == name]
        need_floor = len(set(d["floor"] for d in same_name)) > 1
        filename = make_filename(stall, name, floor if need_floor else None)

        print(f"[{i+1}/{total}] {name}")

        # 生成提示词
        prompt = build_prompt(name, stall)
        print(f"  prompt: {prompt[:80]}...")

        # 生成图片
        success = generate_image(prompt, filename)

        if success:
            # 更新 foods.json 中的 image 路径
            item["image"] = f"images/{filename}"
            stats["ok"] += 1
        else:
            stats["fail"] += 1

        # 保存进度（每张都保存，防止中断丢失）
        with open(FOODS_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print()

    # 统计
    print("=" * 40)
    print(f"✅ 成功: {stats['ok']}")
    print(f"⏭️  跳过: {stats['skip']}")
    print(f"❌ 失败: {stats['fail']}")
    print(f"总费用估计: ${stats['ok'] * 0.0001:.4f}")

if __name__ == "__main__":
    main()
