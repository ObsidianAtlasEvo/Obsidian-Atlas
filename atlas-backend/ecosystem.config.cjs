module.exports = {
  apps: [
    {
      name: 'atlas-backend',
      script: 'dist/index.js',
      cwd: '/var/www/obsidian-atlas/atlas-backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/atlas-err.log',
      out_file: './logs/atlas-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
