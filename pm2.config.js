module.exports = {
  apps: [
    {
      name: 'buildtrack-api',
      script: './dist/server.js',
      cwd: '/root/buildtrack-api',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 5,
      min_uptime: '10s',
      watch: false,
      log_file: '/root/.pm2/logs/buildtrack-api.log',
      out_file: '/root/.pm2/logs/buildtrack-api-out.log',
      error_file: '/root/.pm2/logs/buildtrack-api-error.log',
      merge_logs: true,
      time: true,
      // Health check
      wait_ready: false,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
