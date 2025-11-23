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
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Updated route to handle multiple files with enhanced processing
router.post('/assess', upload.array('documents', 10), (req, res) =>
  controller.assessDocumentsEnhanced(req, res)
);

// Keep existing routes for backward compatibility
router.post('/assess-single', upload.single('document'), (req, res) =>
  controller.assessDocument(req, res)
);

router.get('/categories', (req, res) =>
  controller.getRiskCategories(req, res)
);

// New route for intelligent single file assessment
router.post('/assess-file', upload.single('file'), (req, res) =>
  controller.assessSingleFileIntelligently(req, res)
);

// New route to get all saved results
router.get('/results', (req, res) =>
  controller.getAllResults(req, res)
);

router.get('/workflows', (req, res) => {
  res.json({
    success: true,
    workflows: [
      {
        id: 'enhanced_risk_assessment',
        name: 'Enhanced Risk Assessment',
        description: 'Multi-document risk assessment with policy-questionnaire mapping',
        steps: ['upload', 'classify', 'extract', 'parse', 'map', 'assess', 'report']
      }
    ]
  });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Enhanced Risk Assessment API',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;