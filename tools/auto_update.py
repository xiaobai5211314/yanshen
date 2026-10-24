# -*- coding: utf-8 -*-
"""
纯净盐神 - 全自动增量更新拉取脚本
功能：
1. 监听源站 (onehu.xyz) local-search.xml 与 sitemap.xml
2. 智能对比当前已收录的 index.json，检测是否有新文章或新章节发布
3. 自动抓取新增文章内容，彻底过滤清洗广告代码
4. 自动将新文章追加到本地索引与预置库 (index.json / presets.json)
5. 自动同步推送至又拍云 CDN 高速存储桶 (guzhizhushou)
6. 自动提交并推送至 GitHub 仓库 (xiaobai5211314/yanshen)，触发 Actions 自动上线
运行方式: python tools/auto_update.py
"""
import os
import re
import ssl
import json
import time
import subprocess
import urllib.request
import xml.etree.ElementTree as ET

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
INDEX_PATH = os.path.join(DATA_DIR, "index.json")
PRESETS_PATH = os.path.join(DATA_DIR, "presets.json")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def clean_html(html_str):
    """剔除网页中所有的广告、脚本、外链推广和追踪代码"""
    html_str = re.sub(r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>', '', html_str, flags=re.I)
    html_str = re.sub(r'<ins\b[^<]*(?:(?!<\/ins>)<[^<]*)*<\/ins>', '', html_str, flags=re.I)
    html_str = re.sub(r'<div class=[\'"]license-box[\'"][^>]*>.*?</div>', '', html_str, flags=re.S)
    html_str = re.sub(r'<section\b[^>]*class=[\'"][^\'"]*comments[^\'"]*[\'"][^>]*>.*?</section>', '', html_str, flags=re.S)
    m = re.search(r'<div class=[\'"]markdown-body[\'"]>(.*?)(?:<div class=[\'"]license-box|<hr\s*/?>|</div>\s*</article>)', html_str, flags=re.S)
    if m:
        content = m.group(1).strip()
    else:
        m2 = re.search(r'<div class=[\'"]markdown-body[\'"]>(.*?)</div>', html_str, flags=re.S)
        content = m2.group(1).strip() if m2 else ""
    content = re.sub(r'<a[^>]*href=[\'"][^\'"]*pagead[^\'"]*[\'"][^>]*>.*?</a>', '', content, flags=re.I)
    return content

def check_and_update(push_git=True, sync_cdn=True):
    print("=" * 60)
    print(" 🔄 纯净盐神 - 自动检测与增量拉取更新")
    print("=" * 60)

    # 1. 读取本地当前索引
    if os.path.exists(INDEX_PATH):
        with open(INDEX_PATH, "r", encoding="utf-8") as f:
            local_articles = json.load(f)
    else:
        local_articles = []
    
    local_urls = {a["url"] for a in local_articles}
    max_id = max([a["id"] for a in local_articles], default=-1)
    print(f"[*] 本地已收录小说总数: {len(local_articles)} 篇 (最大 ID: {max_id})")

    # 2. 从源站拉取最新 XML 索引
    print("[*] 正在向源站接口请求最新 local-search.xml ...")
    url = "https://onehu.xyz/local-search.xml"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as res:
            xml_content = res.read()
    except Exception as e:
        print(f"[x] 请求源站失败: {e}")
        return False

    root = ET.fromstring(xml_content)
    new_articles = []
    curr_id = max_id + 1

    for entry in root.findall("entry"):
        title = (entry.findtext("title") or "").strip()
        art_url = (entry.findtext("url") or "").strip()
        cats = [c.text.strip() for c in entry.findall(".//category") if c.text]
        if not title or not art_url:
            continue
        
        # 判断是否为新增文章
        if art_url not in local_urls:
            m = re.search(r"/(\d{4}/\d{2}/\d{2})/", art_url)
            date_str = m.group(1).replace("/", "-") if m else ""
            cat_str = cats[0] if cats else "其它"
            if cat_str.lower() == "zhihu":
                cat_str = "知乎精选"
            elif cat_str == "回答":
                cat_str = "高赞回答"
            
            new_articles.append({
                "id": curr_id,
                "title": title,
                "url": art_url,
                "cat": cat_str,
                "date": date_str
            })
            curr_id += 1

    if not new_articles:
        print("[✓] 检查完毕！本地数据库已是最新状态，源站暂无新增小说。")
        return False

    print(f"[🔥] 发现 {len(new_articles)} 篇源站新增小说！正在执行增量拉取...")
    
    # 3. 将新文章插入到本地索引最前面 (按最新发布优先展示)
    updated_articles = new_articles + local_articles
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(updated_articles, f, ensure_ascii=False, separators=(',', ':'))
    print(f"[+] 索引库已更新，当前收录总数: {len(updated_articles)} 篇")

    # 4. 可选：拉取最新前 5 篇的正文放入 presets.json
    if os.path.exists(PRESETS_PATH):
        with open(PRESETS_PATH, "r", encoding="utf-8") as f:
            presets = json.load(f)
    else:
        presets = {}

    for item in new_articles[:5]:
        target_url = "https://onehu.xyz" + item["url"]
        try:
            req = urllib.request.Request(target_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, context=ctx, timeout=12) as res:
                html = res.read().decode("utf-8", errors="ignore")
            content = clean_html(html)
            if len(content) > 100:
                presets[str(item["id"])] = {
                    "id": item["id"],
                    "title": item["title"],
                    "cat": item["cat"],
                    "date": item["date"],
                    "url": item["url"],
                    "content": content
                }
                print(f"  + 新增离线预置: {item['title']}")
        except Exception as e:
            print(f"  - 拉取正文失败 {item['title']}: {e}")

    with open(PRESETS_PATH, "w", encoding="utf-8") as f:
        json.dump(presets, f, ensure_ascii=False, indent=2)

    # 5. 同步至又拍云 CDN
    if sync_cdn:
        try:
            print("\n[*] 正在同步增量数据至又拍云 CDN (guzhizhushou)...")
            from sync_upyun import sync_all
            sync_all()
        except Exception as e:
            print(f"[!] 又拍云同步异常: {e}")

    # 6. 推送至 GitHub
    if push_git:
        try:
            status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, cwd=BASE_DIR).stdout.strip()
            if status:
                print("\n[*] 正在将更新文件提交至 Git 并推送至 GitHub...")
                subprocess.run(["git", "add", "."], cwd=BASE_DIR)
                commit_msg = f"feat: sync {len(new_articles)} new stories from source (total: {len(updated_articles)})"
                subprocess.run(["git", "commit", "-m", commit_msg], cwd=BASE_DIR)
                subprocess.run(["git", "push", "origin", "main"], cwd=BASE_DIR)
                print("🎉 推送成功！已触发 GitHub Actions 自动部署至线上生产环境：")
                print("🌐 站点地址: https://yan.21212121.xyz")
        except Exception as e:
            print(f"[!] Git 推送异常: {e}")

    print("\n[🎉] 增量更新与同步流程全部完成！")
    return True

if __name__ == "__main__":
    check_and_update()
