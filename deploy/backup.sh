#!/bin/bash
set -euo pipefail

# ============================================================
# Opportunity Pulse — PostgreSQL Backup Script
# Run via cron: 0 2 * * * /opt/opportunity-pulse/deploy/backup.sh
# ============================================================

BACKUP_DIR="/opt/backups/opportunity-pulse"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/op_backup_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Dump database from the running postgres container, compress with gzip
docker exec op-postgres pg_dump -U opportunity_pulse -d opportunity_pulse --no-owner --no-acl \
  | gzip > "$BACKUP_FILE"

# Check if backup was created and has content
if [ -s "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[$(date)] Backup created: $BACKUP_FILE ($SIZE)"
else
  echo "[$(date)] ERROR: Backup file is empty or was not created."
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Remove backups older than retention period
DELETED=$(find "$BACKUP_DIR" -name "op_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Cleaned up $DELETED old backup(s) (older than ${RETENTION_DAYS} days)."
fi

echo "[$(date)] Backup complete."

# ============================================================
# RESTORE INSTRUCTIONS:
#
# 1. Stop the backend: docker stop op-backend
# 2. Drop and recreate DB:
#    docker exec op-postgres psql -U opportunity_pulse -c "DROP DATABASE IF EXISTS opportunity_pulse;"
#    docker exec op-postgres psql -U opportunity_pulse -c "CREATE DATABASE opportunity_pulse;"
# 3. Restore:
#    gunzip -c /opt/backups/opportunity-pulse/op_backup_YYYYMMDD_HHMMSS.sql.gz | \
#      docker exec -i op-postgres psql -U opportunity_pulse -d opportunity_pulse
# 4. Restart backend: docker start op-backend
# ============================================================
