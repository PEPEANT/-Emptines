module.exports = {
  apps: [
    {
      name: "reclaim-fps-chat",
      script: "server.js",
      cwd: __dirname,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      env: {
        NODE_ENV: "production",
        PORT: "3001"
      },
      env_production: {
        NODE_ENV: "production",
        PORT: "3001"
      }
    }
  ]
};
