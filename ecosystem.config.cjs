module.exports = {
  apps: [
    {
      name: "minigame-hub",
      script: "./dist/index.js",
      cwd: "/var/www/minigame-hub",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      error_file: "/var/log/pm2/minigame-hub-error.log",
      out_file: "/var/log/pm2/minigame-hub-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      restart_delay: 3000,
      max_restarts: 10,
      watch: false,
    },
  ],
};
