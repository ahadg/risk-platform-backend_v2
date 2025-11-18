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

  async assessDocuments(req, res) {
    try {
      console.log('Files received:', req.files?.length);
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'No files uploaded' 
        });
      }

      // Process all documents with different strategies
      const processedDocs = await this.processMultipleDocuments(req.files);
      console.log('All documents processed successfully');

      // Combine content for risk assessment
      const combinedContent = this.combineDocumentContents(processedDocs);

      // Analyze risks on combined content
      const assessment = await this.riskService.assessRisks(combinedContent);
      console.log('Risk assessment completed');

      res.json({
        success: true,
        data: {
          assessment: assessment,
          processedDocuments: processedDocs.map(doc => ({
            fileName: doc?.fileName,
            processingType: doc?.processingType,
            contentLength: doc?.content?.length
          })),
          workflowId: this.generateWorkflowId(),
          timestamp: new Date().toISOString(),
          totalFiles: req?.files?.length
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

  async processMultipleDocuments(files) {
    const processedDocs = [];
    
    for (const file of files) {
      try {
        console.log(`Processing file: ${file.originalname}`);
        
        let processedDoc;
        if (this.isPolicyOrStandard(file.originalname)) {
          // Summarize policy/standard documents
          processedDoc = await this.documentProcessor.processAndSummarizeDocument(file.buffer);
          //console.log("processedDoc",processedDoc)
          processedDoc.processingType = 'SUMMARIZED';
        } else {
          // Extract full content for other documents
          processedDoc = await this.documentProcessor.processDocument(file.buffer);
          processedDoc.processingType = 'EXTRACTED';
        }
        
        processedDoc.fileName = file.originalname;
        processedDocs.push(processedDoc);
        
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        throw new Error(`Failed to process ${file.originalname}: ${error.message}`);
      }
    }
    
    return processedDocs;
  }

  isPolicyOrStandard(filename) {
    const policyKeywords = ['policy', 'policies', 'standard', 'standards', 'guideline', 'guidelines'];
    const lowerFilename = filename.toLowerCase();
    
    return policyKeywords.some(keyword => 
      lowerFilename.includes(keyword)
    );
  }

  combineDocumentContents(processedDocs) {
    let combinedContent = {
      rawText: '',
      summaries: [],
      fullContent: [],
      processingTypes: {}
    };

    processedDocs.forEach(doc => {
      combinedContent.processingTypes[doc.fileName] = doc.processingType;
      
      if (doc.processingType === 'SUMMARIZED') {
        combinedContent.summaries.push({
          fileName: doc.fileName,
          summary: doc.summary,
          keyPoints: doc.keyPoints
        });
        combinedContent.rawText += `POLICY/STANDARD DOCUMENT: ${doc.fileName}\n`;
        combinedContent.rawText += `SUMMARY: ${doc.summary}\n`;
        combinedContent.rawText += `KEY POINTS: ${doc.keyPoints?.join(', ') || 'N/A'}\n\n`;
      } else {
        combinedContent.fullContent.push({
          fileName: doc.fileName,
          content: doc.rawText
        });
        combinedContent.rawText += `DOCUMENT: ${doc.fileName}\n`;
        combinedContent.rawText += `CONTENT: ${doc.rawText}\n\n`;
      }
    });

    return combinedContent;
  }

  // Keep the original single file method for backward compatibility
  async assessDocument(req, res) {
    try {
      console.log('File received:', req.file);
      
      if (!req.file) {
        return res.status(400).json({ 
          success: false,
          error: 'No file uploaded' 
        });
      }

      // Process as single document
      const files = [req.file];
      const processedDocs = await this.processMultipleDocuments(files);
      const combinedContent = this.combineDocumentContents(processedDocs);

      // Analyze risks
      const assessment = await this.riskService.assessRisks(combinedContent);
      console.log('Risk assessment completed');

      res.json({
        success: true,
        data: {
          assessment: assessment,
          workflowId: this.generateWorkflowId(),
          timestamp: new Date().toISOString(),
          fileName: req.file.originalname,
          processingType: processedDocs[0].processingType
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
    // ... existing code remains the same
    const categories = [
      // ... existing categories
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