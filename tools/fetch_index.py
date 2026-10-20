# -*- coding: utf-8 -*-
"""
生成知乎盐选小说全量索引 (data/index.json)
数据来源：onehu.xyz /local-search.xml
"""
import os
import re
import json
import ssl
import urllib.request
import xml.etree.ElementTree as ET

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_PATH = os.path.join(DATA_DIR, "index.json")

def fetch_and_generate_index():
    print("[*] 正在从源站获取最新全量索引 local-search.xml ...")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    url = "https://onehu.xyz/local-search.xml"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    
    with urllib.request.urlopen(req, context=ctx, timeout=30) as res:
        xml_content = res.read()
    
    print(f"[*] 下载成功，XML 体积: {len(xml_content):,} 字节。正在解析...")
    root = ET.fromstring(xml_content)
    
    articles = []
    idx = 0
    for entry in root.findall("entry"):
        title = (entry.findtext("title") or "").strip()
        art_url = (entry.findtext("url") or "").strip()
        cats = [c.text.strip() for c in entry.findall(".//category") if c.text]
        tags = [t.text.strip() for t in entry.findall(".//tag") if t.text]
        
        if not title or not art_url:
            continue
        
        m = re.search(r"/(\d{4}/\d{2}/\d{2})/", art_url)
        date_str = m.group(1).replace("/", "-") if m else ""
        
        # 归一化分类
        cat_str = cats[0] if cats else "其它"
        if cat_str.lower() == "zhihu":
            cat_str = "知乎精选"
        elif cat_str == "回答":
            cat_str = "高赞回答"
            
        articles.append({
            "id": idx,
            "title": title,
            "url": art_url,
            "cat": cat_str,
            "date": date_str
        })
        idx += 1

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, separators=(',', ':'))

    print(f"[✓] 索引生成完成！共收录 {len(articles)} 篇小说/专栏。")
    print(f"[✓] 保存路径: {OUTPUT_PATH} (体积: {os.path.getsize(OUTPUT_PATH):,} 字节)")

if __name__ == "__main__":
    fetch_and_generate_index()
