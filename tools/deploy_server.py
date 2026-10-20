# -*- coding: utf-8 -*-
"""
纯净盐神 - 自动化生产服务器部署脚本
功能：打包本地静态文件与数据，通过 SFTP/SSH 上传至腾讯云服务器，自动配置 Nginx 站点 (含 SSL)
运行方式: python tools/deploy_server.py
"""
import os
import io
import time
import tarfile
import paramiko

SERVER_HOST = "150.158.159.111"
SERVER_PORT = 22
SERVER_USER = "root"
SERVER_PASS = "Dabai521@"

REMOTE_DIR = "/www/wwwroot/yan.21212121.xyz"
CERT_DIR = "/www/server/panel/vhost/cert/yan.21212121.xyz"
NGINX_CONF_PATH = "/www/server/panel/vhost/nginx/yan.21212121.xyz.conf"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NGINX_CONF_CONTENT = """# ==========================================================
# 纯净盐神 (yan.21212121.xyz) Nginx 站点配置 (含 SSL)
# ==========================================================
server
{
    listen 80;
    listen 443 ssl;
    http2 on;
    server_name yan.21212121.xyz yanshen.21212121.xyz;
    index index.html index.htm;
    root /www/wwwroot/yan.21212121.xyz;

    # SSL 证书配置 (泛域名 *.21212121.xyz)
    ssl_certificate /www/server/panel/vhost/cert/yan.21212121.xyz/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/yan.21212121.xyz/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HTTP 自动跳转 HTTPS
    if ($server_port = 80) {
        rewrite ^(/.*)$ https://$host$1 permanent;
    }

    # Gzip 压缩支持
    gzip on;
    gzip_min_length 1k;
    gzip_buffers 4 16k;
    gzip_http_version 1.1;
    gzip_comp_level 5;
    gzip_types text/plain application/javascript application/x-javascript text/javascript text/css application/xml application/json image/svg+xml;
    gzip_vary on;

    # 静态资源缓存 (30天)
    location ~* \\.(jpg|jpeg|gif|png|css|js|ico|svg|woff2|woff)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # 数据文件缓存策略 (5分钟)
    location ~* \\.(json|xml)$ {
        expires 5m;
        add_header Cache-Control "public, max-age=300";
    }

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    access_log /www/wwwlogs/yan.21212121.xyz.log;
    error_log /www/wwwlogs/yan.21212121.xyz.error.log;
}
"""

def main():
    print("=" * 60)
    print("       纯净盐神 (yan.21212121.xyz) 云端自动化部署工具       ")
    print("=" * 60)

    # 1. 连接 SSH
    print(f"[*] 正在连接生产服务器 {SERVER_HOST}:{SERVER_PORT} ...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    connected = False
    for attempt in range(3):
        try:
            ssh.connect(SERVER_HOST, port=SERVER_PORT, username=SERVER_USER, password=SERVER_PASS, timeout=12, banner_timeout=30)
            connected = True
            break
        except Exception as e:
            print(f"[!] 连接重试 ({attempt+1}/3): {e}")
            time.sleep(2)
            
    if not connected:
        print("[x] 无法连接到服务器，请检查网络！")
        return

    print("[✓] SSH 连接成功！")
    sftp = ssh.open_sftp()

    # 2. 本地打包需要上传的文件
    print("[*] 正在打包本地静态文件与数据...")
    files_to_upload = [
        "index.html",
        "icon.svg",
        "CNAME",
        "README.md",
        "AGENTS.md",
        "css/style.css",
        "js/app.js",
        "data/index.json",
        "data/presets.json",
        "tools/auto_update.py",
        "tools/sync_articles.py",
        "tools/sync_upyun.py"
    ]

    tar_buf = io.BytesIO()
    with tarfile.open(fileobj=tar_buf, mode="w:gz") as tar:
        for rel_path in files_to_upload:
            full_path = os.path.join(BASE_DIR, rel_path)
            if os.path.exists(full_path):
                tar.add(full_path, arcname=rel_path)
                print(f"  + 打包: {rel_path} ({os.path.getsize(full_path):,} 字节)")
            else:
                print(f"  - 跳过: {rel_path}")

    tar_buf.seek(0)
    tar_size = len(tar_buf.getvalue())
    print(f"[*] 压缩包总大小: {tar_size / 1024 / 1024:.2f} MB")

    # 3. 确保证书与目录存在
    ssh.exec_command(f"mkdir -p {REMOTE_DIR}/tools {REMOTE_DIR}/css {REMOTE_DIR}/js {REMOTE_DIR}/data {CERT_DIR}")
    time.sleep(1)

    # 检查并同步泛域名证书
    cmd_cert = f"""
    if [ ! -f "{CERT_DIR}/fullchain.pem" ]; then
        cp -f /www/server/panel/vhost/cert/renqing.21212121.xyz/fullchain.pem {CERT_DIR}/
        cp -f /www/server/panel/vhost/cert/renqing.21212121.xyz/privkey.pem {CERT_DIR}/
    fi
    """
    ssh.exec_command(cmd_cert)

    # 4. 上传并解压
    remote_tar = f"/tmp/yanshen_deploy_{int(time.time())}.tar.gz"
    print(f"[*] 正在上传压缩包至 {remote_tar} ...")
    sftp.putfo(tar_buf, remote_tar)
    print("[✓] 上传完毕，正在解压并更新站点文件...")

    cmd_extract = f"tar -zxf {remote_tar} -C {REMOTE_DIR} && rm -f {remote_tar} && chown -R www:www {REMOTE_DIR}"
    stdin, stdout, stderr = ssh.exec_command(cmd_extract)
    stdout.channel.recv_exit_status()

    # 5. 配置并检查 Nginx
    print("[*] 检查并更新 Nginx 站点配置文件...")
    conf_file = sftp.file(NGINX_CONF_PATH, "w")
    conf_file.write(NGINX_CONF_CONTENT)
    conf_file.close()

    print("[*] 测试 Nginx 配置并平滑重载...")
    stdin, stdout, stderr = ssh.exec_command("nginx -t && nginx -s reload")
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print("Nginx 测试输出:", out)
    if err:
        print("Nginx 提示:", err)

    sftp.close()
    ssh.close()

    print("\n" + "=" * 60)
    print("🎉 恭喜！纯净盐神 (含 SSL 安全加密) 已成功同步到您的云服务器！")
    print(f"🌐 站点访问地址: https://yan.21212121.xyz")
    print(f"📁 服务器根目录: {REMOTE_DIR}")
    print("=" * 60)

if __name__ == "__main__":
    main()
