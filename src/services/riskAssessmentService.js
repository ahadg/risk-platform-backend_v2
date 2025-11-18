// src/services/riskAssessmentService.js
const { ChatOpenAI } = require("langchain/chat_models/openai");
const { LLMChain } = require("langchain/chains");
const { PromptTemplate } = require("langchain/prompts");

class RiskAssessmentService {
  constructor() {
    this.llm = new ChatOpenAI({ 
      temperature: 0, 
      modelName: "gpt-4" 
    });
    
    this.initializeChains();
  }

  initializeChains() {
    // Updated Risk Categorization Chain for combined documents
    this.riskCategorizationPrompt = new PromptTemplate({
      template: `
      Analyze the following combined banking documents and perform a comprehensive risk assessment.
      
      DOCUMENT CONTENT:
      {document}
      
      Based on the combined analysis of policy documents (summarized) and other documents (full content),
      categorize the identified risks into:
      1. Compliance Risks
      2. Operational Risks
      3. Technological Risks
      4. Reputational Risks
      5. Financial Risks
      
      Consider how policies interact with operational documents to identify potential gaps or conflicts.
      
      Provide output in JSON format:
      {{
        "riskCategories": [
          {{
            "category": "string",
            "risks": [
              {{
                "description": "string",
                "severity": "HIGH|MEDIUM|LOW",
                "impact": "string",
                "likelihood": "HIGH|MEDIUM|LOW",
                "controlEffectiveness": "EFFECTIVE|PARTIAL|INEFFECTIVE",
                "relatedDocuments": ["filename1", "filename2"]
              }}
            ]
          }}
        ],
        "overallRiskRating": "HIGH|MEDIUM|LOW",
        "keyFindings": ["string"],
        "policyGaps": ["string"],
        "recommendations": ["string"]
      }}
      `,
      inputVariables: ["document"]
    });

    this.riskCategorizationChain = new LLMChain({
      llm: this.llm,
      prompt: this.riskCategorizationPrompt
    });
  }

  async assessRisks(combinedDocument) {
    console.log("combinedDocument",combinedDocument)
    try {
      const assessment = await this.riskCategorizationChain.call({
        document: combinedDocument.rawText
      });

      return this.parseAssessment(assessment.text);
    } catch (error) {
      throw new Error(`Risk assessment failed: ${error.message}`);
    }
  }

  parseAssessment(assessmentText) {
    try {
      const jsonMatch = assessmentText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Invalid assessment format');
    } catch (error) {
      return this.fallbackParsing(assessmentText);
    }
  }

  fallbackParsing(text) {
    return {
      riskCategories: [],
      overallRiskRating: "MEDIUM",
      keyFindings: ["Assessment parsing requires manual review"],
      policyGaps: [],
      recommendations: []
    };
  }
}

module.exports = RiskAssessmentService;