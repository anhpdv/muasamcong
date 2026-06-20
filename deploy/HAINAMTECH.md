# Deploy lên bid.hainamtech.vn

## Repo Git (gửi cho dev)

Sau khi push lên remote, dev clone:

```bash
git clone <GIT_URL> /var/www/bid-muasamcong
```

## Lần đầu trên server

Server AI hiện tại: `admin1@117.3.64.120` — Open WebUI đang bind `127.0.0.1:3000`.

App mua sắm công chạy **port 3001** (trong `ecosystem.config.cjs`).

```bash
bash deploy/setup-server.sh <GIT_URL>
sudo cp deploy/nginx-bid.conf /etc/nginx/sites-available/bid.hainamtech.vn
sudo ln -sf /etc/nginx/sites-available/bid.hainamtech.vn /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bid.hainamtech.vn
```

## Cập nhật code

```bash
cd /var/www/bid-muasamcong
bash deploy/deploy.sh
```

## Kiểm tra

- `pm2 logs bid-muasamcong` — có dòng lịch quét 08:00, 12:00, 17:00
- Mở https://bid.hainamtech.vn
- Bấm **Quét ngay** hoặc `npm run schedule:now`

## Lưu ý

- Thư mục `data/` **không** có trên Git — tạo khi chạy trên server
- Backup định kỳ: `data/tenders.jsonl`, `data/state.json`, `data/tender-statuses.json`
