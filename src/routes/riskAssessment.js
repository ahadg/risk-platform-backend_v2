// src/routes/riskAssessment.js
const express = require('express');
const RiskAssessmentController = require('../controllers/riskAssessmentController');
const multer = require('multer');

const router = express.Router();

// Fix: Create instance properly
const controller = new RiskAssessmentController();

// Configure multer for file uploads
const upload = multer({
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

// Routes
router.post('/assess', upload.single('document'), (req, res) => 
  controller.assessDocument(req, res)
);

router.get('/categories', (req, res) => 
  controller.getRiskCategories(req, res)
);

router.get('/workflows', (req, res) => {
  res.json({
    success: true,
    workflows: [
      {
        id: 'risk_assessment',
        name: 'Document Risk Assessment',
        description: 'Complete risk assessment workflow for uploaded documents',
        steps: ['upload', 'process', 'analyze', 'report']
      }
    ]
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Risk Assessment API',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;