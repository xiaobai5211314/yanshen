# -*- coding: utf-8 -*-
"""
纯净盐神 - 又拍云存储 (Upyun CDN) 资产与小说同步工具
支持：
1. S3 协议高速上传 (AK/SK 免密码模式，已适配云服务器标准凭据)
2. 官方 REST API 与 upx.exe 操作员模式
3. 一键将 index.json、presets.json 或小说全文推送至 guzhizhushou 或 xiaobai5211314 存储桶
加速域名:
- https://guzhicdn.21212121.xyz/yanshen/
- https://tc1.21212121.xyz/yanshen/
"""
import os
import sys
import hmac
import hashlib
import datetime
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# 又拍云云端凭据 (来自服务器 /root/.upyun_creds)
UPYUN_S3_AK = "82681bd0ccb348a39b0635e03242538e"
UPYUN_S3_SK = "65d63c9d5e38ab751062ebdaec817f83"
UPYUN_S3_HOST = "s3.api.upyun.com"
UPYUN_S3_REGION = "us-east-1"

DEFAULT_BUCKET = "guzhizhushou"
REMOTE_PREFIX = "yanshen"

def sign_s3(method, uri, query="", payload=b""):
    payload_hash = hashlib.sha256(payload).hexdigest()
    amz_date = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    date_stamp = amz_date[:8]
    canonical_headers = f"host:{UPYUN_S3_HOST}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join([method, uri, query, canonical_headers, signed_headers, payload_hash])
    scope = f"{date_stamp}/{UPYUN_S3_REGION}/s3/aws4_request"
    string_to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()])
    k_date = hmac.new(("AWS4" + UPYUN_S3_SK).encode(), date_stamp.encode(), hashlib.sha256).digest()
    k_region = hmac.new(k_date, UPYUN_S3_REGION.encode(), hashlib.sha256).digest()
    k_service = hmac.new(k_region, b"s3", hashlib.sha256).digest()
    k_signing = hmac.new(k_service, b"aws4_request", hashlib.sha256).digest()
    sig = hmac.new(k_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()
    auth = f"AWS4-HMAC-SHA256 Credential={UPYUN_S3_AK}/{scope}, SignedHeaders={signed_headers}, Signature={sig}"
    return amz_date, payload_hash, auth

def put_file_s3(bucket, remote_path, local_file_path, content_type="application/json"):
    data = Path(local_file_path).read_bytes()
    uri = f"/{bucket}/{remote_path.lstrip('/')}"
    amz_date, ph, auth = sign_s3("PUT", uri, "", data)
    url = f"https://{UPYUN_S3_HOST}{uri}"
    
    req = urllib.request.Request(url, data=data, method="PUT")
    req.add_header("Host", UPYUN_S3_HOST)
    req.add_header("x-amz-date", amz_date)
    req.add_header("x-amz-content-sha256", ph)
    req.add_header("Authorization", auth)
    req.add_header("Content-Type", content_type)
    
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status in (200, 204)
    except urllib.error.HTTPError as e:
        print(f"  [x] HTTP {e.code}: {e.read()[:200].decode(errors='replace')}")
        return False
    except Exception as e:
        print(f"  [x] 异常: {e}")
        return False

def sync_all(bucket=DEFAULT_BUCKET):
    print("=" * 60)
    print(" ☁️  纯净盐神 · 又拍云存储 (S3 极速同步)")
    print(f" 目标存储桶: {bucket}")
    print(f" 加速访问路径: https://guzhicdn.21212121.xyz/{REMOTE_PREFIX}/")
    print("=" * 60)

    files_to_sync = [
        ("data/index.json", "data/index.json", "application/json"),
        ("data/presets.json", "data/presets.json", "application/json")
    ]

    for rel_path, remote_sub, ctype in files_to_sync:
        local_p = BASE_DIR / rel_path
        if not local_p.exists():
            continue
        remote_full = f"{REMOTE_PREFIX}/{remote_sub}"
        size_kb = local_p.stat().st_size / 1024
        print(f"[*] 正在推送 {rel_path} ({size_kb:.1f} KB) -> 又拍云...")
        ok = put_file_s3(bucket, remote_full, local_p, ctype)
        if ok:
            print(f"[✓] 推送成功: https://guzhicdn.21212121.xyz/{remote_full}")
        else:
            print(f"[!] 推送失败: {rel_path}")

    print("\n[🎉] 又拍云同步流程完成！")

if __name__ == "__main__":
    b = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BUCKET
    sync_all(b)
