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
    // Risk Categorization Chain
    this.riskCategorizationPrompt = new PromptTemplate({
      template: `
      Analyze the following banking control self-assessment document and categorize risks:
      
      DOCUMENT:
      {document}
      
      Based on the banking regulations and internal controls described, categorize the identified risks into:
      1. Compliance Risks
      2. Operational Risks
      3. Technological Risks
      4. Reputational Risks
      5. Financial Risks
      
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
                "controlEffectiveness": "EFFECTIVE|PARTIAL|INEFFECTIVE"
              }}
            ]
          }}
        ],
        "overallRiskRating": "HIGH|MEDIUM|LOW",
        "keyFindings": ["string"]
      }}
      `,
      inputVariables: ["document"]
    });

    this.riskCategorizationChain = new LLMChain({
      llm: this.llm,
      prompt: this.riskCategorizationPrompt
    });
  }

  async assessRisks(processedDocument) {
    try {
      const assessment = await this.riskCategorizationChain.call({
        document: processedDocument.rawText
      });

      return this.parseAssessment(assessment.text);
    } catch (error) {
      throw new Error(`Risk assessment failed: ${error.message}`);
    }
  }

  parseAssessment(assessmentText) {
    try {
      // Extract JSON from LLM response
      const jsonMatch = assessmentText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Invalid assessment format');
    } catch (error) {
      // Fallback parsing logic
      return this.fallbackParsing(assessmentText);
    }
  }

  fallbackParsing(text) {
    // Implement robust fallback parsing logic
    return {
      riskCategories: [],
      overallRiskRating: "MEDIUM",
      keyFindings: ["Assessment parsing requires manual review"]
    };
  }
}


module.exports = RiskAssessmentService;
