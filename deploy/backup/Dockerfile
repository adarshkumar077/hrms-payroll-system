# EITF HRMS: backup job image (pg_dump + age + rclone).
# Default command runs the daily scheduler: backup.sh loop
# One-off backup:  docker compose exec db-backup /bin/sh /usr/local/bin/backup.sh once
FROM postgres:16-alpine

RUN apk add --no-cache age rclone

COPY backup.sh restore.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh

ENTRYPOINT ["/bin/sh", "/usr/local/bin/backup.sh"]
CMD ["loop"]
