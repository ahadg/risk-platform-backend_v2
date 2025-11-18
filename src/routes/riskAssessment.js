// src/routes/riskAssessment.js
const express = require('express');
const RiskAssessmentController = require('../controllers/riskAssessmentController');
const multer = require('multer');

const router = express.Router();
const controller = new RiskAssessmentController();

// Configure multer for multiple file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Updated route to handle multiple files
router.post('/assess', upload.array('documents', 5), (req, res) => 
  controller.assessDocuments(req, res)
);

// ... rest of the routes remain the same
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

router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Risk Assessment API',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;