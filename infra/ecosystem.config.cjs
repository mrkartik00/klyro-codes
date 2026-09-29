// PM2 process definitions for the Klyro API. n8n runs via docker-compose
// (infra/docker-compose.n8n.yml) or its own PM2 apps if Docker is unavailable.
module.exports = {
  apps: [
    {
      name: 'klyro-api',
      cwd: '/var/www/klyro/server',
      script: 'src/server.js',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
      error_file: '/var/log/klyro/api.err.log',
      out_file: '/var/log/klyro/api.out.log',
      time: true,
    },
  ],
};
