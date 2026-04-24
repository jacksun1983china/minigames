-- ============================================================
-- MySQL 5.7 Database Initialization for NOVAPLAY Minigame Hub
-- Run as MySQL root: mysql -u root -p < init-db.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS minigame_hub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'minigame_user'@'localhost'
  IDENTIFIED BY 'CHANGE_THIS_PASSWORD';

GRANT ALL PRIVILEGES ON minigame_hub.* TO 'minigame_user'@'localhost';

FLUSH PRIVILEGES;

SELECT 'Database and user created successfully.' AS status;
