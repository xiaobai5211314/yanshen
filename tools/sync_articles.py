# -*- coding: utf-8 -*-
"""
知乎盐选文章抓取与离线预置同步工具
功能：抓取精选高赞小说全文，生成 presets.json 供本地离线和极速首屏使用
"""
import os
import re
import json
import ssl
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
INDEX_PATH = os.path.join(DATA_DIR, "index.json")
PRESETS_PATH = os.path.join(DATA_DIR, "presets.json")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def clean_html(html_str):
    """剔除网页中所有的广告、脚本、外链推广和追踪代码"""
    # 移除 script
    html_str = re.sub(r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>', '', html_str, flags=re.I)
    # 移除 adsbygoogle
    html_str = re.sub(r'<ins\b[^<]*(?:(?!<\/ins>)<[^<]*)*<\/ins>', '', html_str, flags=re.I)
    # 移除 license box
    html_str = re.sub(r'<div class=[\'"]license-box[\'"][^>]*>.*?</div>', '', html_str, flags=re.S)
    # 移除评论区或页脚
    html_str = re.sub(r'<section\b[^>]*class=[\'"][^\'"]*comments[^\'"]*[\'"][^>]*>.*?</section>', '', html_str, flags=re.S)
    # 提取文章主体
    m = re.search(r'<div class=[\'"]markdown-body[\'"]>(.*?)(?:<div class=[\'"]license-box|<hr\s*/?>|</div>\s*</article>)', html_str, flags=re.S)
    if m:
        content = m.group(1).strip()
    else:
        m2 = re.search(r'<div class=[\'"]markdown-body[\'"]>(.*?)</div>', html_str, flags=re.S)
        content = m2.group(1).strip() if m2 else ""
    
    # 再次清理多余内联 style 广告
    content = re.sub(r'<a[^>]*href=[\'"][^\'"]*pagead[^\'"]*[\'"][^>]*>.*?</a>', '', content, flags=re.I)
    return content

def fetch_single_article(article):
    url = "https://onehu.xyz" + article["url"]
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=12) as res:
            html = res.read().decode("utf-8", errors="ignore")
        content = clean_html(html)
        if len(content) > 100:
            return {
                "id": article["id"],
                "title": article["title"],
                "cat": article["cat"],
                "date": article["date"],
                "url": article["url"],
                "content": content
            }
    except Exception as e:
        print(f"[!] 抓取失败 {article['title']}: {e}")
    return None

def sync_presets(target_count=35):
    if not os.path.exists(INDEX_PATH):
        print("[!] 找不到 index.json，请先运行 fetch_index.py")
        return

    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        all_articles = json.load(f)

    # 精选不同分类的高赞代表作
    categories = {}
    for art in all_articles:
        c = art["cat"]
        if c not in categories:
            categories[c] = []
        categories[c].append(art)

    selected = []
    # 优先选取热门专栏的前 2~3 篇
    for cat_name, arts in categories.items():
        if len(selected) >= target_count:
            break
        for a in arts[:2]:
            selected.append(a)
            if len(selected) >= target_count:
                break

    print(f"[*] 选定 {len(selected)} 篇代表作进行离线预置抓取...")
    presets = {}
    
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = pool.map(fetch_single_article, selected)
        for res in results:
            if res:
                presets[str(res["id"])] = res
                print(f"[+] 抓取成功: {res['title']} (字数估算: {len(res['content'])})")

    with open(PRESETS_PATH, "w", encoding="utf-8") as f:
        json.dump(presets, f, ensure_ascii=False, indent=2)

    print(f"\n[✓] 离线预置库生成完毕！已打包 {len(presets)} 篇精选小说全文至 {PRESETS_PATH}")

if __name__ == "__main__":
    sync_presets(35)
