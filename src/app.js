// src/app.js
const express = require('express');
const multer = require('multer');
require('dotenv').config();


const riskAssessmentRoutes = require('./routes/riskAssessment');

class RiskAssessmentApp {
  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Multer configuration for file uploads
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only PDF files are allowed'), false);
        }
      }
    });
  }

  setupRoutes() {
    this.app.use('/api/risk-assessment', riskAssessmentRoutes);
    
    this.app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });
  }

  setupErrorHandling() {
    this.app.use((error, req, res, next) => {
      console.error('Application error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    });
  }

  start(port = 3000) {
    this.server = this.app.listen(port, () => {
      console.log(`Risk Assessment API running on port ${port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = RiskAssessmentApp;