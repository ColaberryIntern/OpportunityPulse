# Database Restore Procedure

## List available backups

```bash
docker exec op-backup ls -la /backups/
```

## Restore from a specific backup

```bash
docker exec -i op-postgres pg_restore \
  -U opportunity_pulse \
  -d opportunity_pulse_dev \
  --clean --if-exists \
  < backup_file.dump
```

## Or copy backup out first

```bash
docker cp op-backup:/backups/backup_20260218_020000.dump ./backup.dump

pg_restore \
  -h localhost \
  -U opportunity_pulse \
  -d opportunity_pulse_dev \
  --clean --if-exists \
  backup.dump
```
