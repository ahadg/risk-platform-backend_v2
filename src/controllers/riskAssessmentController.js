// src/controllers/riskAssessmentController.js
const DocumentProcessor = require('../services/documentProcessor');
const RiskAssessmentService = require('../services/riskAssessmentService');
const WorkflowService = require('../services/workflowService');
const pdfParse = require('pdf-parse');

class RiskAssessmentController {
  constructor() {
    this.documentProcessor = new DocumentProcessor();
    this.riskService = new RiskAssessmentService();
    this.workflowService = new WorkflowService();
  }

  // Enhanced multi-document assessment
  async assessDocumentsEnhanced(req, res) {
    try {
      console.log('Enhanced assessment - Files received:', req.files?.length);
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'No files uploaded' 
        });
      }

      // Classify files
      const policyFiles = req.files.filter(f => this.riskService.isPolicyLike(f.originalname));
      const questionnaireFiles = req.files.filter(f => this.riskService.isQuestionnaireLike(f.originalname));
      
      console.log(`Classification - Policies: ${policyFiles.length}, Questionnaires: ${questionnaireFiles.length}`);

      if (policyFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No policy documents found. Please upload at least one policy/SOP/rules document.'
        });
      }

      if (questionnaireFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No questionnaire documents found. Please upload at least one risk assessment questionnaire.'
        });
      }

      // 1. Extract text from all PDFs
      const policyTexts = await Promise.all(
        policyFiles.map(async (file) => {
          const text = await this.extractTextFromPdf(file.buffer);
          return {
            fileName: file.originalname,
            text: text
          };
        })
      );

      const questionnaireTexts = await Promise.all(
        questionnaireFiles.map(async (file) => {
          const text = await this.extractTextFromPdf(file.buffer);
          return {
            fileName: file.originalname,
            text: text
          };
        })
      );

      // 2. Index policies
      console.log('Indexing policies...');
      await this.riskService.indexPolicies(policyTexts.map(p => p.text));

      // 3. Parse questionnaires
      console.log('Parsing questionnaires...');
      const structuredQuestionnaires = await Promise.all(
        questionnaireTexts.map(async (q) => {
          const structured = await this.riskService.parseQuestionnaireWithLLM(q.text);
          return {
            fileName: q.fileName,
            structured: structured
          };
        })
      );

      // 4. Assess risks for each questionnaire
      console.log('Assessing risks...');
      const assessments = await Promise.all(
        structuredQuestionnaires.map(async (q) => {
          console.log("Q:",q.structured)
          const assessment = await this.riskService.assessRisksFromQuestionnaire(q.structured);
          return {
            fileName: q.fileName,
            assessment: assessment
          };
        })
      );

      // 5. Generate combined report
      const combinedReport = this.generateCombinedReport(assessments, policyTexts);

      res.json({
        success: true,
        data: {
          fileClassification: {
            policyFiles: policyFiles.map(f => f.originalname),
            questionnaireFiles: questionnaireFiles.map(f => f.originalname)
          },
          assessments: assessments,
          combinedReport: combinedReport,
          workflowId: this.generateWorkflowId(),
          timestamp: new Date().toISOString(),
          totalFiles: req.files.length
        }
      });

    } catch (error) {
      console.error('Enhanced risk assessment error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Enhanced risk assessment failed', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // PDF text extraction
  async extractTextFromPdf(buffer) {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      throw new Error(`PDF text extraction failed: ${error.message}`);
    }
  }

  // Generate combined report across all assessments
  generateCombinedReport(assessments, policyTexts) {
    const allRisks = assessments.flatMap(a => a.assessment.risks || []);
    
    // Aggregate risks by category
    const risksByCategory = {};
    allRisks.forEach(risk => {
      const category = risk.category || 'Other';
      if (!risksByCategory[category]) {
        risksByCategory[category] = [];
      }
      risksByCategory[category].push(risk);
    });

    // Calculate overall metrics
    const riskCount = allRisks.length;
    const highRisks = allRisks.filter(r => r.overallRating === 'High' || r.overallRating === 'Very High');
    const mediumRisks = allRisks.filter(r => r.overallRating === 'Medium');

    return {
      summary: {
        totalAssessments: assessments.length,
        totalRisksIdentified: riskCount,
        highPriorityRisks: highRisks.length,
        mediumPriorityRisks: mediumRisks.length,
        riskDistribution: risksByCategory
      },
      topRisks: allRisks
        .sort((a, b) => {
          const ratingOrder = { 'Very High': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
          return (ratingOrder[b.overallRating] || 0) - (ratingOrder[a.overallRating] || 0);
        })
        .slice(0, 10),
      recommendations: this.generateOverallRecommendations(allRisks)
    };
  }

  generateOverallRecommendations(risks) {
    const recommendations = new Set();
    
    risks.forEach(risk => {
      if (risk.recommendedActions) {
        risk.recommendedActions.forEach(action => recommendations.add(action));
      }
    });

    return Array.from(recommendations).slice(0, 15);
  }

  // Original single file method (for backward compatibility)
  async assessDocument(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false,
          error: 'No file uploaded' 
        });
      }

      // Use enhanced service for single file
      const text = await this.extractTextFromPdf(req.file.buffer);
      
      let assessment;
      if (this.riskService.isPolicyLike(req.file.originalname)) {
        // For single policy file, do basic analysis
        await this.riskService.indexPolicies([text]);
        assessment = {
          fileName: req.file.originalname,
          type: 'policy',
          message: 'Policy indexed. Please upload questionnaires for risk assessment.'
        };
      } else if (this.riskService.isQuestionnaireLike(req.file.originalname)) {
        // For single questionnaire, need policies - return error
        return res.status(400).json({
          success: false,
          error: 'Questionnaire uploaded but no policies found. Please upload policy documents for risk assessment.'
        });
      } else {
        // Fallback to original behavior
        const processedDoc = await this.documentProcessor.processDocument(req.file.buffer);
        assessment = await this.riskService.assessRisks(processedDoc);
      }

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
      },
      {
        id: 'strategic',
        name: 'Strategic Risks',
        description: 'Risks affecting long-term business strategy',
        examples: ['Market changes', 'Competitive pressures', 'Strategic misalignment']
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

module.exports = RiskAssessmentController;