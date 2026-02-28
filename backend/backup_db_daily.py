#!/usr/bin/env python3.9
import os
import shutil
import glob
from datetime import datetime

# Configuration
DB_PATH = '/home/arjanshaw/PigStyleMusic/backend/data/records.db'
BACKUP_DIR = '/home/arjanshaw/PigStyleMusic/backend/backups/'
DAYS_TO_KEEP = 30  # Keep a month of daily backups

# Create backup directory if it doesn't exist
os.makedirs(BACKUP_DIR, exist_ok=True)

def create_daily_backup():
    """Create a daily timestamped backup"""
    timestamp = datetime.now().strftime('%Y-%m-%d')
    backup_filename = f'records_backup_{timestamp}.db'
    backup_path = os.path.join(BACKUP_DIR, backup_filename)
    
    if os.path.exists(DB_PATH):
        shutil.copyfile(DB_PATH, backup_path)
        print(f"[✓] Daily backup created: {backup_filename}")
    else:
        print(f"[✗] Database not found at {DB_PATH}")

def cleanup_old_backups():
    """Remove backups older than DAYS_TO_KEEP"""
    all_backups = glob.glob(os.path.join(BACKUP_DIR, 'records_backup_*.db'))
    
    for backup_path in all_backups:
        # Extract date from filename (format: records_backup_YYYY-MM-DD.db)
        filename = os.path.basename(backup_path)
        try:
            date_str = filename.replace('records_backup_', '').replace('.db', '')
            backup_date = datetime.strptime(date_str, '%Y-%m-%d')
            days_old = (datetime.now() - backup_date).days
            
            if days_old > DAYS_TO_KEEP:
                os.remove(backup_path)
                print(f"[ ] Removed old backup: {filename} ({days_old} days old)")
        except ValueError:
            # If filename doesn't match expected format, skip
            continue

if __name__ == "__main__":
    print(f"[*] Starting daily backup at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    create_daily_backup()
    cleanup_old_backups()
    print("[*] Backup complete")