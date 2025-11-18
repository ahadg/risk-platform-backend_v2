// server.js
const RiskAssessmentApp = require('./src/app');

const app = new RiskAssessmentApp();
const PORT = process.env.PORT || 3000;

app.start(PORT);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  app.stop();
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  app.stop();
});