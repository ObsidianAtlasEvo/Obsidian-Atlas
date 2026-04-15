/**
 * PM2 Ecosystem Config — Obsidian Atlas
 * Place at: /var/www/obsidian-atlas-src/ecosystem.config.cjs
 *
 * Start:   pm2 start ecosystem.config.cjs --env production
 * Reload:  pm2 reload atlas-api --update-env
 * Save:    pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'atlas-api',
      script: 'atlas-backend/dist/index.js',
      cwd: '/var/www/obsidian-atlas-src',
      interpreter: 'node',
      node_args: '--max-old-space-size=512',
      // Load .env file from atlas-backend directory
      // (Node 20.6+ supports --env-file natively)
      interpreter_args: '--env-file=atlas-backend/.env',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '450M',
      env_production: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      // Restart policy
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      out_file: '/home/ubuntu/.pm2/logs/atlas-api-out.log',
      error_file: '/home/ubuntu/.pm2/logs/atlas-api-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
