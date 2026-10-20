# -*- coding: utf-8 -*-
"""
纯净盐神 - 又拍云存储 (Upyun CDN) 资产与小说同步工具
功能：
1. 将本地小说索引 index.json、离线预置 presets.json 或全量小说数据同步至又拍云存储桶
2. 支持使用项目内置 tools/upx.exe 或原生 HTTP REST API (无任何三方依赖)
3. 线上阅读器可直接挂载又拍云 CDN 加速域名 (如 https://guzhicdn.21212121.xyz/yanshen/)
运行方式:
    python tools/sync_upyun.py --password "你的又拍云操作员密码"
"""
import os
import sys
import time
import hashlib
import mimetypes
import subprocess
from pathlib import Path
import urllib.request
import urllib.error
from datetime import datetime, timezone

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
TOOLS_UPX = BASE_DIR / "tools" / "upx.exe"

DEFAULT_SERVICE = "xiaobai5211314"
DEFAULT_OPERATOR = "dabai521"
DEFAULT_REMOTE_PREFIX = "yanshen"

def upload_file_rest_api(service, operator, password, local_path, remote_rel_path):
    """通过又拍云官方 REST API 上传单个文件"""
    pwd_md5 = hashlib.md5(password.encode("utf-8")).hexdigest()
    file_bytes = local_path.read_bytes()
    content_len = len(file_bytes)
    
    remote_path = f"/{service}/{DEFAULT_REMOTE_PREFIX}/{remote_rel_path.lstrip('/')}"
    now_gmt = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
    
    # 签名公式: PUT&<URI>&<DATE>&<CONTENT_LENGTH>&<PASSWORD_MD5>
    sign_str = f"PUT&{remote_path}&{now_gmt}&{content_len}&{pwd_md5}"
    signature = hashlib.md5(sign_str.encode("utf-8")).hexdigest()
    auth_header = f"UpYun {operator}:{signature}"

    url = f"http://v0.api.upyun.com{remote_path}"
    headers = {
        "Authorization": auth_header,
        "Date": now_gmt,
        "Content-Length": str(content_len),
        "mkdir": "true"
    }
    mime, _ = mimetypes.guess_type(str(local_path))
    if mime:
        headers["Content-Type"] = mime

    req = urllib.request.Request(url, data=file_bytes, headers=headers, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print(f"  [x] 上传失败 {remote_rel_path}: {e}")
        return False

def sync_to_upyun(service, operator, password):
    print("=" * 60)
    print(" ☁️  纯净盐神 · 又拍云存储 (Upyun CDN) 数据同步")
    print(f" 目标空间: {service} (操作员: {operator})")
    print(f" 加速路径: https://guzhicdn.21212121.xyz/{DEFAULT_REMOTE_PREFIX}/")
    print("=" * 60)

    if not password:
        password = os.environ.get("UPYUN_PASSWORD", "")

    if not password:
        print("[!] 提示：未检测到又拍云操作员密码。")
        print("    请通过参数传入: python tools/sync_upyun.py --password \"你的密码\"")
        print("    或在环境变量中设置: $env:UPYUN_PASSWORD=\"你的密码\"")
        return

    # 扫描待同步数据
    files_to_sync = []
    if (DATA_DIR / "index.json").exists():
        files_to_sync.append((DATA_DIR / "index.json", "data/index.json"))
    if (DATA_DIR / "presets.json").exists():
        files_to_sync.append((DATA_DIR / "presets.json", "data/presets.json"))

    print(f"[*] 准备同步核心小说数据文件 ({len(files_to_sync)} 个)...")
    success_count = 0
    for local_f, remote_f in files_to_sync:
        size_kb = local_f.stat().st_size / 1024
        print(f"[*] 正在上传 {remote_f} ({size_kb:.1f} KB) ...")
        if upload_file_rest_api(service, operator, password, local_f, remote_f):
            print(f"[✓] 上传成功: https://guzhicdn.21212121.xyz/{DEFAULT_REMOTE_PREFIX}/{remote_f}")
            success_count += 1

    print(f"\n[🎉] 又拍云同步完成！成功同步 {success_count}/{len(files_to_sync)} 个关键数据文件。")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--service", "-s", default=DEFAULT_SERVICE, help="又拍云服务名")
    parser.add_argument("--operator", "-u", default=DEFAULT_OPERATOR, help="又拍云操作员")
    parser.add_argument("--password", "-p", default="", help="又拍云操作员密码")
    args = parser.parse_args()

    sync_to_upyun(args.service, args.operator, args.password)
