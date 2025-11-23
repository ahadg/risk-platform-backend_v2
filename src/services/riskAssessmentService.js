// src/services/riskAssessmentService.js
require("dotenv").config();

const { ChatOpenAI } = require("langchain/chat_models/openai");
const { LLMChain } = require("langchain/chains");
const { PromptTemplate } = require("langchain/prompts");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { Document } = require("langchain/document");

class RiskAssessmentService {
  constructor() {
    this.llm = new ChatOpenAI({
      temperature: 0,
      modelName: "gpt-4", // or "gpt-4o", "gpt-3.5-turbo"
    });

    this.embeddings = new OpenAIEmbeddings();
    this.vectorStore = null;

    this._initChains();
  }

  _initChains() {
    // 1) Questionnaire parsing chain
    const questionnaireParsingPrompt = new PromptTemplate({
      inputVariables: ["questionnaire_text"],
      template: `
  You are a parser. The following text is a COMPLETED risk assessment questionnaire in PDF text form.
  
  Extract:
  - respondent info (name, role, department, date) if present
  - sections (use headings or logical grouping)
  - for each question:
    - questionId (Q1, Q2... if not present, create stable IDs)
    - questionText
    - answerText (full free-text answer)
    - answerScale (if there is a numeric score; otherwise null)
    - answerScaleMax (if scale is visible e.g. 1-5; otherwise null)
    - comments (any extra notes if present)
  
  Return ONLY valid JSON in this exact schema:
  
  {{
    "respondent": {{
      "name": "string | null",
      "role": "string | null",
      "department": "string | null",
      "date": "string | null"
    }},
    "sections": [
      {{
        "name": "string",
        "questions": [
          {{
            "questionId": "string",
            "questionText": "string",
            "answerText": "string",
            "answerScale": number | null,
            "answerScaleMax": number | null,
            "comments": "string | null"
          }}
        ]
      }}
    ]
  }}
  
  TEXT:
  {questionnaire_text}
      `.trim(),
    });

    this.questionnaireParsingChain = new LLMChain({
      llm: this.llm,
      prompt: questionnaireParsingPrompt,
    });

    // 2) Risk evaluation chain
    const riskEvalPrompt = new PromptTemplate({
      inputVariables: [
        "section_name",
        "question_text",
        "answer_text",
        "policy_chunks_text",
      ],
      template: `
  You are a banking/enterprise risk expert.
  
  You receive:
  1) A policy extract (possibly multiple paragraphs)
  2) A completed questionnaire answer
  
  Your tasks:
  - Identify if the answer COMPLIES with the policy.
  - If not, describe the risk clearly.
  - Classify the risk into categories: Compliance, Operational, IT, Financial, Reputational, Strategic, Other.
  - Rate Impact: Low / Medium / High / Severe
  - Rate Probability: Rare / Possible / Expected / Likely
  - Derive Overall Rating: Low / Medium / High / Very High
  - Suggest 2-5 concrete recommended actions.
  - Give a confidence score between 0 and 1.
  
  Return ONLY JSON in this schema:
  
  {{
    "hasRisk": boolean,
    "category": "string | null",
    "description": "string | null",
    "policyReference": "string | null",
    "evidence": {{
      "section": "string",
      "question": "string",
      "answer": "string",
      "policyExtract": "string"
    }},
    "impact": "Low | Medium | High | Severe | null",
    "probability": "Rare | Possible | Expected | Likely | null",
    "overallRating": "Low | Medium | High | Very High | null",
    "recommendedActions": ["string"],
    "confidence": number
  }}
  
  QUESTION SECTION:
  {section_name}
  
  QUESTION:
  {question_text}
  
  ANSWER:
  {answer_text}
  
  POLICY EXTRACTS:
  {policy_chunks_text}
      `.trim(),
    });

    this.riskEvalChain = new LLMChain({
      llm: this.llm,
      prompt: riskEvalPrompt,
    });
  }


  // File type detection
  isPolicyLike(filename) {
    return /policy|policies|sop|rules|manual|procedure|standard|guideline/i.test(filename || "");
  }

  isQuestionnaireLike(filename) {
    return /questionnaire|assessment|survey|self-assessment|risk-assessment|checklist/i.test(
      filename || ""
    );
  }

  // Index policies
  async indexPolicies(policyTexts) {
    if (!Array.isArray(policyTexts) || policyTexts.length === 0) {
      throw new Error("policyTexts must be a non-empty array of strings");
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1200,
      chunkOverlap: 200,
    });

    const docs = [];
    let policyCounter = 1;

    for (const text of policyTexts) {
      const baseId = `policy_${policyCounter++}`;
      const chunks = await splitter.splitText(text);

      chunks.forEach((chunk, idx) => {
        const doc = new Document({
          pageContent: chunk,
          metadata: {
            policyId: baseId,
            chunkId: `${baseId}_chunk_${idx + 1}`,
          },
        });
        docs.push(doc);
      });
    }

    this.vectorStore = await MemoryVectorStore.fromDocuments(docs, this.embeddings);
    console.log(`Indexed ${docs.length} policy chunks from ${policyTexts.length} policies`);
  }

  // Parse questionnaire
  async parseQuestionnaireWithLLM(questionnaireText) {
    if (!questionnaireText || questionnaireText.trim().length < 50) {
      throw new Error("Questionnaire text is too short or empty");
    }

    const raw = await this.questionnaireParsingChain.call({
      questionnaire_text: questionnaireText,
    });

    let parsed;
    try {
      const responseText = raw.text || raw.output || raw;
      //console.log("responseText",responseText)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(responseText);
      }
    } catch (err) {
      console.error("Failed to parse questionnaire JSON:", err, raw);
      throw new Error("Questionnaire parsing failed – invalid JSON from LLM");
    }

    // Validate basic structure
    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      throw new Error("Invalid questionnaire structure: missing sections array");
    }

    return parsed;
  }

  // Assess risks from structured questionnaire
  async assessRisksFromQuestionnaire(structuredQuestionnaire) {
    if (!this.vectorStore) {
      throw new Error("Policy vector store is not initialized. Call indexPolicies() first.");
    }

    const risks = [];
    const sections = structuredQuestionnaire.sections || [];
    //console.log("total sections:",sections.length)
    for (const section of sections) {

      //console.log("section:",sections.name)
      const sectionName = section.name || "Unnamed Section";
      const questions = section.questions || [];

      for (const q of questions) {
        //console.log("questionText:",q.questionText)
        const questionText = q.questionText || "";
        const answerText = q.answerText || "";

        // Skip empty questions or answers
        if (!questionText.trim() || !answerText.trim()) continue;

        try {
          const query = `
          Section: ${sectionName}
          Question: ${questionText}
          Answer: ${answerText}
          `.trim();

          const matches = await this.vectorStore.similaritySearch(query, 5);

          if (matches.length === 0) {
            // No relevant policies found
            continue;
          }

          const policyChunksText = matches
            .map(
              (m, idx) =>
                `# Match ${idx + 1} (policyId=${m.metadata.policyId}, chunkId=${m.metadata.chunkId})\n${m.pageContent}`
            )
            .join("\n\n");

          const raw = await this.riskEvalChain.call({
            section_name: sectionName,
            question_text: questionText,
            answer_text: answerText,
            policy_chunks_text: policyChunksText,
          });

          let riskResult;
          try {
            const responseText = raw.text || raw.output || raw;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              riskResult = JSON.parse(jsonMatch[0]);
            } else {
              riskResult = JSON.parse(responseText);
            }
          } catch (err) {
            console.error("Failed to parse risk evaluation JSON:", err, raw);
            continue;
          }

          if (riskResult && riskResult.hasRisk) {
            risks.push({
              ...riskResult,
              questionId: q.questionId || null,
              sectionName,
              fileName: structuredQuestionnaire.fileName // Track source
            });
          }
        } catch (error) {
          console.error(`Error processing question ${q.questionId}:`, error);
          continue;
        }
      }
    }

    // Build summary
    const summary = this._buildSummary(structuredQuestionnaire, risks);

    return {
      assessmentId: `assess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      respondent: structuredQuestionnaire.respondent || null,
      overallSummary: summary,
      risks,
      totalQuestionsProcessed: sections.reduce((acc, section) => acc + (section.questions || []).length, 0),
      risksIdentified: risks.length
    };
  }

  _buildSummary(structuredQuestionnaire, risks) {
    if (!risks.length) {
      return {
        overallRating: "Low",
        topCategories: [],
        keyFindings: ["No material risks identified based on the provided answers and policies."],
        complianceLevel: "High"
      };
    }

    const ratingToScore = {
      'Low': 1,
      'Medium': 2,
      'High': 3,
      'Very High': 4
    };

    let totalScore = 0;
    const categoryCounts = {};
    const keyFindings = [];

    for (const r of risks) {
      const rating = r.overallRating || "Medium";
      const score = ratingToScore[rating] || 2;
      totalScore += score;

      const cat = r.category || "Other";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      if (r.description) {
        keyFindings.push(r.description);
      }
    }

    const avgScore = totalScore / Math.max(risks.length, 1);
    let overallRating = "Medium";
    if (avgScore < 1.5) overallRating = "Low";
    else if (avgScore < 2.5) overallRating = "Medium";
    else if (avgScore < 3.5) overallRating = "High";
    else overallRating = "Very High";

    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    return {
      overallRating,
      topCategories,
      keyFindings: keyFindings.slice(0, 10),
      complianceLevel: overallRating === "Low" ? "High" : overallRating === "Medium" ? "Moderate" : "Low",
      totalRisks: risks.length
    };
  }

  // Direct text-based risk assessment (no questionnaire parsing)
  async assessDirectFromText(documentText, fileName = 'document.pdf') {
    if (!documentText || documentText.trim().length < 50) {
      throw new Error("Document text is too short or empty");
    }

    // Create a direct assessment prompt
    const directAssessmentPrompt = new PromptTemplate({
      inputVariables: ["document_text"],
      template: `
You are an expert risk analyst specializing in banking, compliance, and enterprise risk management.

Analyze the following document text and identify ALL potential risks, issues, gaps, or concerns.

For each risk identified, provide:
1. A clear description of the risk
2. Category (Compliance, Operational, Technological, Financial, Reputational, Strategic, or Other)
3. Impact rating (Low, Medium, High, Very High)
4. Likelihood rating (Low, Medium, High, Very High)
5. Evidence from the document supporting this risk
6. Specific recommended actions to mitigate the risk

Look for:
- Non-compliance with regulations or policies
- Operational inefficiencies or gaps
- Control weaknesses
- Technology or system issues
- Process failures or manual workarounds
- Missing documentation or procedures
- Inadequate monitoring or oversight
- Resource constraints
- Training gaps
- Any other risks or concerns

Return ONLY valid JSON in this exact schema:

{{
  "risks": [
    {{
      "description": "string",
      "category": "Compliance | Operational | Technological | Financial | Reputational | Strategic | Other",
      "impact": "Low | Medium | High | Very High",
      "likelihood": "Low | Medium | High | Very High",
      "evidence": "string - specific quote or reference from the document",
      "recommendedActions": ["string", "string", ...],
      "confidence": number (0-1)
    }}
  ],
  "summary": {{
    "totalRisks": number,
    "highPriorityCount": number,
    "topCategories": ["string"],
    "overallAssessment": "string - brief overall assessment"
  }}
}}

DOCUMENT TEXT:
{document_text}
      `.trim(),
    });

    const directAssessmentChain = new LLMChain({
      llm: this.llm,
      prompt: directAssessmentPrompt,
    });

    try {
      const raw = await directAssessmentChain.call({
        document_text: documentText.substring(0, 15000), // Limit to avoid token limits
      });

      let assessment;
      try {
        const responseText = raw.text || raw.output || raw;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          assessment = JSON.parse(jsonMatch[0]);
        } else {
          assessment = JSON.parse(responseText);
        }
      } catch (err) {
        console.error("Failed to parse direct assessment JSON:", err, raw);
        throw new Error("Risk assessment failed – invalid JSON from LLM");
      }

      // Validate and enhance the assessment
      if (!assessment.risks || !Array.isArray(assessment.risks)) {
        throw new Error("Invalid assessment structure: missing risks array");
      }

      // Add metadata to each risk
      assessment.risks = assessment.risks.map((risk, index) => ({
        ...risk,
        riskId: `RISK-${Date.now()}-${String(index + 1).padStart(3, '0')}`,
        fileName: fileName,
        overallRating: this.calculateOverallRating(risk.impact, risk.likelihood),
      }));

      return {
        assessmentId: `assess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fileName: fileName,
        risks: assessment.risks,
        summary: assessment.summary || this.generateSummary(assessment.risks),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error("Direct text assessment error:", error);
      throw error;
    }
  }

  // Calculate overall rating from impact and likelihood
  calculateOverallRating(impact, likelihood) {
    const ratingMap = { 'Low': 1, 'Medium': 2, 'High': 3, 'Very High': 4 };
    const impactScore = ratingMap[impact] || 2;
    const likelihoodScore = ratingMap[likelihood] || 2;
    const totalScore = impactScore * likelihoodScore;

    if (totalScore >= 12) return 'Very High';
    if (totalScore >= 6) return 'High';
    if (totalScore >= 3) return 'Medium';
    return 'Low';
  }

  // Generate summary if not provided by LLM
  generateSummary(risks) {
    const categoryCounts = {};
    let highPriorityCount = 0;

    risks.forEach(risk => {
      const category = risk.category || 'Other';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      if (risk.overallRating === 'High' || risk.overallRating === 'Very High') {
        highPriorityCount++;
      }
    });

    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    return {
      totalRisks: risks.length,
      highPriorityCount: highPriorityCount,
      topCategories: topCategories,
      overallAssessment: `Identified ${risks.length} risk(s), with ${highPriorityCount} high priority item(s).`
    };
  }

  // Original method for backward compatibility
  async assessRisks(processedDocument) {
    // Fallback to original behavior if needed
    return {
      riskCategories: [],
      overallRiskRating: "MEDIUM",
      keyFindings: ["Used fallback assessment method"]
    };
  }
}

module.exports = RiskAssessmentService;