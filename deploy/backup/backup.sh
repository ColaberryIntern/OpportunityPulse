#!/bin/bash
# Daily PostgreSQL backup script (runs inside op-backup container)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups
RETENTION_DAYS=30

echo "[$(date)] Starting backup..."
pg_dump -h postgres -U ${POSTGRES_USER} -d ${POSTGRES_DB} -F c -f ${BACKUP_DIR}/backup_${TIMESTAMP}.dump

if [ $? -eq 0 ]; then
  echo "[$(date)] Backup successful: backup_${TIMESTAMP}.dump"
  # Clean old backups
  find ${BACKUP_DIR} -name "backup_*.dump" -mtime +${RETENTION_DAYS} -delete
  echo "[$(date)] Cleaned backups older than ${RETENTION_DAYS} days"
else
  echo "[$(date)] Backup FAILED!" >&2
  exit 1
fi
