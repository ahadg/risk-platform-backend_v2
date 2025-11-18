// src/controllers/riskAssessmentController.js
const DocumentProcessor = require('../services/documentProcessor');
const RiskAssessmentService = require('../services/riskAssessmentService');
const WorkflowService = require('../services/workflowService');

class RiskAssessmentController {
  constructor() {
    this.documentProcessor = new DocumentProcessor();
    this.riskService = new RiskAssessmentService();
    this.workflowService = new WorkflowService();
  }

  async assessDocument(req, res) {
    try {
      console.log('File received:', req.file);
      
      if (!req.file) {
        return res.status(400).json({ 
          success: false,
          error: 'No file uploaded' 
        });
      }

      // Process document
      const processedDoc = await this.documentProcessor.processDocument(req.file.buffer);
      console.log('Document processed successfully');

      // Analyze risks
      const assessment = await this.riskService.assessRisks(processedDoc);
      console.log('Risk assessment completed');

      res.json({
        success: true,
        data: {
          assessment: assessment,
          workflowId: this.generateWorkflowId(),
          timestamp: new Date().toISOString(),
          fileName: req.file.originalname
        }
      });

    } catch (error) {
      console.error('Risk assessment error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Risk assessment failed', 
        details: error.message 
      });
    }
  }

  async getRiskCategories(req, res) {
    const categories = [
      {
        id: 'compliance',
        name: 'Compliance Risks',
        description: 'Risks related to regulatory compliance and sanctions screening',
        examples: ['Sanctions screening failures', 'AML violations', 'Regulatory non-compliance']
      },
      {
        id: 'operational',
        name: 'Operational Risks',
        description: 'Risks in business processes and internal controls',
        examples: ['Process inefficiencies', 'Manual workarounds', 'SLA breaches']
      },
      {
        id: 'technological',
        name: 'Technological Risks',
        description: 'Risks associated with systems and technology infrastructure',
        examples: ['System failures', 'Network issues', 'IT support delays']
      },
      {
        id: 'reputational',
        name: 'Reputational Risks',
        description: 'Risks to organizational reputation and brand',
        examples: ['Customer complaints', 'Service failures', 'Public incidents']
      },
      {
        id: 'financial',
        name: 'Financial Risks',
        description: 'Risks with financial impact and monetary losses',
        examples: ['Financial losses', 'Penalties', 'Revenue impacts']
      }
    ];

    res.json({ 
      success: true,
      categories 
    });
  }

  generateWorkflowId() {
    return `WF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Fix: Export the class properly
module.exports = RiskAssessmentController;