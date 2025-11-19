// src/services/riskAssessmentService.js
const { ChatOpenAI } = require("langchain/chat_models/openai");
const { LLMChain } = require("langchain/chains");
const { PromptTemplate } = require("langchain/prompts");

class RiskAssessmentService {
  constructor() {
    this.llm = new ChatOpenAI({ 
      temperature: 0, 
      modelName: "gpt-4",
      //maxTokens: 4000
    });
    
    this.initializeChains();
  }

  initializeChains() {
    // Enhanced Risk Assessment Chain for banking compliance documents
    this.riskAssessmentPrompt = new PromptTemplate({
      template: `
      You are a banking compliance and risk assessment expert. Analyze the following banking documents and generate a comprehensive risk assessment with key findings.

      DOCUMENTS TO ANALYZE:
      {document}

      Based on the SAMA regulations, internal controls self-assessment, and audit findings, generate:

      KEY FINDINGS SUMMARY:
      Create a table with the following columns:
      - NO. (numbering)
      - FINDING CATEGORY (e.g., OPERATION/COMPLIANCE, COMPLIANCE/IT, etc.)
      - RATING (MEDIUM, HIGH, LOW)

      Focus on identifying 6 key findings similar to the audit report structure, including:
      1. Compliance with SAMA regulations
      2. Internal controls effectiveness
      3. Operational efficiency
      4. Technology and automation gaps
      5. Training and competency
      6. Documentation and archiving

      For each finding, assess:
      - Severity based on banking compliance standards
      - Impact on regulatory requirements
      - Control effectiveness
      - Likelihood of occurrence

      Provide output in this exact JSON format:
      {{
        "keyFindingsSummary": [
          {{
            "no": 1,
            "findingCategory": "OPERATION/COMPLIANCE",
            "rating": "MEDIUM",
            "description": "Brief description of the finding",
            "severity": "HIGH|MEDIUM|LOW",
            "impact": "Financial|Regulatory|Operational|Reputational",
            "rootCause": "Primary cause of the issue",
            "affectedProcesses": ["Process1", "Process2"]
          }}
        ],
        "overallRiskRating": "HIGH|MEDIUM|LOW",
        "riskCategories": {{
          "complianceRisks": {{
            "level": "HIGH|MEDIUM|LOW",
            "issues": ["Issue 1", "Issue 2"]
          }},
          "operationalRisks": {{
            "level": "HIGH|MEDIUM|LOW", 
            "issues": ["Issue 1", "Issue 2"]
          }},
          "technologicalRisks": {{
            "level": "HIGH|MEDIUM|LOW",
            "issues": ["Issue 1", "Issue 2"]
          }}
        }},
        "recommendations": [
          {{
            "priority": "HIGH|MEDIUM|LOW",
            "description": "Specific recommendation",
            
            "responsibleParty": "Suggested owner"
          }}
        ],
        "complianceGaps": [
          {{
            "regulation": "SAMA Rule reference",
            "gapDescription": "Description of non-compliance",
            "severity": "HIGH|MEDIUM|LOW"
          }}
        ]
      }}

   
      `,
      inputVariables: ["document"]
    });

    this.riskAssessmentChain = new LLMChain({
      llm: this.llm,
      prompt: this.riskAssessmentPrompt
    });
  }

  // Focus particularly on:
  // - Money laundering risk assessment requirements
  // - SAMA account opening rules compliance
  // - High-risk customer acceptance procedures
  // - Documentation and archiving standards
  // - Training and competency requirements

  async assessRisks(combinedDocument) {
    try {
      console.log("Starting risk assessment for combined document...");
      
      const assessment = await this.riskAssessmentChain.call({
        document: this.prepareDocumentContent(combinedDocument)
      });

      return this.parseAssessment(assessment.text);
    } catch (error) {
      console.error("Risk assessment error:", error);
      throw new Error(`Risk assessment failed: ${error.message}`);
    }
  }

  prepareDocumentContent(combinedDocument) {
    // Extract and structure the document content for better analysis
    let content = "";
    
    if (combinedDocument.rawText) {
      content = combinedDocument.rawText;
    } else if (combinedDocument.content) {
      content = combinedDocument.content;
    } else if (typeof combinedDocument === 'string') {
      content = combinedDocument;
    }

    // Add document type identifiers for better context
    if (content.includes("SAMA") && content.includes("Rules for Bank Accounts")) {
      content = "SAMA REGULATIONS DOCUMENT:\n" + content;
    }
    
    if (content.includes("Control Self-Assessment") || content.includes("CSA")) {
      content += "\nCONTROL SELF-ASSESSMENT DOCUMENT:\n" + content;
    }

    if (content.includes("KEY FINDINGS") || content.includes("AUDIT")) {
      content += "\nAUDIT FINDINGS DOCUMENT:\n" + content;
    }

    return content.substring(0, 12000); // Limit length to avoid token limits
  }

  parseAssessment(assessmentText) {
    try {
      console.log("Raw assessment text:", assessmentText);
      
      // Clean the text and extract JSON
      const cleanedText = assessmentText.replace(/```json\n?|\n?```/g, '').trim();
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.validateAssessmentStructure(parsed);
      }
      
      throw new Error('No valid JSON found in assessment');
    } catch (error) {
      console.error("JSON parsing error:", error);
      return this.generateFallbackAssessment();
    }
  }

  validateAssessmentStructure(assessment) {
    // Ensure required fields exist
    const requiredFields = ['keyFindingsSummary', 'overallRiskRating', 'riskCategories', 'recommendations'];
    
    for (const field of requiredFields) {
      if (!assessment[field]) {
        assessment[field] = this.getDefaultField(field);
      }
    }

    // Ensure keyFindingsSummary has exactly 6 items as requested
    if (!assessment.keyFindingsSummary || assessment.keyFindingsSummary.length === 0) {
      assessment.keyFindingsSummary = this.generateDefaultFindings();
    }

    return assessment;
  }

  getDefaultField(fieldName) {
    const defaults = {
      keyFindingsSummary: this.generateDefaultFindings(),
      overallRiskRating: "MEDIUM",
      riskCategories: {
        complianceRisks: { level: "MEDIUM", issues: ["Assessment incomplete"] },
        operationalRisks: { level: "MEDIUM", issues: ["Assessment incomplete"] },
        technologicalRisks: { level: "MEDIUM", issues: ["Assessment incomplete"] }
      },
      recommendations: [
        {
          priority: "HIGH",
          description: "Complete comprehensive risk assessment",
          targetDate: "Immediate",
          responsibleParty: "Compliance Department"
        }
      ]
    };

    return defaults[fieldName] || [];
  }

  generateDefaultFindings() {
    return [
      {
        no: 1,
        findingCategory: "OPERATION/COMPLIANCE",
        rating: "MEDIUM",
        description: "Incomplete risk assessment - manual review required",
        severity: "MEDIUM",
        impact: "Regulatory",
        rootCause: "System processing error",
        affectedProcesses: ["Risk Assessment"]
      }
    ];
  }

  generateFallbackAssessment() {
    return {
      keyFindingsSummary: this.generateDefaultFindings(),
      overallRiskRating: "MEDIUM",
      riskCategories: {
        complianceRisks: { level: "MEDIUM", issues: ["Assessment parsing failed"] },
        operationalRisks: { level: "MEDIUM", issues: ["Assessment parsing failed"] },
        technologicalRisks: { level: "MEDIUM", issues: ["Assessment parsing failed"] }
      },
      recommendations: [
        {
          priority: "HIGH",
          description: "Manual review required - system assessment failed",
          targetDate: "Immediate",
          responsibleParty: "Compliance Team"
        }
      ],
      complianceGaps: [
        {
          regulation: "SAMA General",
          gapDescription: "Unable to complete automated assessment",
          severity: "MEDIUM"
        }
      ]
    };
  }
}

module.exports = RiskAssessmentService;