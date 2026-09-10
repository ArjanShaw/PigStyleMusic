#!/usr/bin/env python3.9
import os
import shutil
from datetime import datetime

# Configuration
DB_PATH = '/home/arjanshaw/PigStyleMusic/backend/data/records.db'
BACKUP_DIR = '/home/arjanshaw/PigStyleMusic/backend/backups/'

DAILY_BACKUP  = os.path.join(BACKUP_DIR, 'records_backup_daily.db')
WEEKLY_BACKUP = os.path.join(BACKUP_DIR, 'records_backup_weekly.db')

# Day of week to refresh the weekly backup (0 = Monday, 6 = Sunday)
WEEKLY_REFRESH_DAY = 6  # Sunday

os.makedirs(BACKUP_DIR, exist_ok=True)

def create_backups():
    if not os.path.exists(DB_PATH):
        print(f"[✗] Database not found at {DB_PATH}")
        return

    # Daily — always overwrite
    shutil.copyfile(DB_PATH, DAILY_BACKUP)
    print(f"[✓] Daily backup refreshed: {os.path.basename(DAILY_BACKUP)}")

    # Weekly — only refresh on the configured day
    if datetime.now().weekday() == WEEKLY_REFRESH_DAY:
        shutil.copyfile(DB_PATH, WEEKLY_BACKUP)
        print(f"[✓] Weekly backup refreshed: {os.path.basename(WEEKLY_BACKUP)}")
    else:
        print(f"[ ] Weekly backup left as-is (refreshes on weekday {WEEKLY_REFRESH_DAY})")

if __name__ == "__main__":
    print(f"[*] Starting backup at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    create_backups()
    print("[*] Backup complete")