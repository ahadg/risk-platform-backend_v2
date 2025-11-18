// src/services/documentProcessor.js
const fs = require("fs");
const path = require("path");
const os = require("os");

const { PDFLoader } = require("langchain/document_loaders/fs/pdf");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { ChatOpenAI } = require("langchain/chat_models/openai");
const { LLMChain } = require("langchain/chains");
const { PromptTemplate } = require("langchain/prompts");
const {sammurizeText} = require("./sammurizeText")
class DocumentProcessor {
  constructor() {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    this.embeddings = new OpenAIEmbeddings();
    this.llm = new ChatOpenAI({ 
      temperature: 0, 
      modelName: "gpt-4" 
    });
    
    this.initializeSummaryChain();
  }

  initializeSummaryChain() {
    this.summaryPrompt = new PromptTemplate({
      template: `
      Analyze the following policy/standard document and provide a comprehensive summary.
      
      DOCUMENT:
      {document}
      
      Please provide:
      1. A concise executive summary (2-3 paragraphs)
      2. Key policy points or standards (bullet points)
      3. Scope and applicability
      4. Main requirements or guidelines
      
      Format the output as JSON:
      {{
        "summary": "executive summary text",
        "keyPoints": ["point1", "point2", "point3"],
        "scope": "scope description",
        "requirements": ["req1", "req2", "req3"]
      }}
      `,
      inputVariables: ["document"]
    });

    this.summaryChain = new LLMChain({
      llm: this.llm,
      prompt: this.summaryPrompt
    });
  }

  async processDocument(fileBuffer) {
    try {
      const { rawText, chunks, vectorStore } = await this.loadAndProcessPDF(fileBuffer);
      
      return {
        rawText,
        chunks,
        vectorStore,
      };
    } catch (error) {
      throw new Error(`Document processing failed: ${error.message}`);
    }
  }

  async processAndSummarizeDocument(fileBuffer) {
    try {
      // const { rawText, chunks, vectorStore } = await this.loadAndProcessPDF(fileBuffer);
      
      // // Generate summary using LLM
      // const summaryResult = await this.summaryChain.call({
      //   document: rawText
      // });
      console.log("sammurizeText",sammurizeText)
      const summaryData = sammurizeText
      //this.parseSummary(summaryResult.text);
      
      return {
        rawText : sammurizeText,
        summary: sammurizeText,
        chunks : [],
        vectorStore : [],
        //...summaryData
      };
    } catch (error) {
      throw new Error(`Document summarization failed: ${error.message}`);
    }
  }

  async loadAndProcessPDF(fileBuffer) {
    // Write buffer to temp file
    const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}.pdf`);
    fs.writeFileSync(tempFilePath, fileBuffer);

    // Load PDF using file path
    const loader = new PDFLoader(tempFilePath);
    const docs = await loader.load();

    // Cleanup temp file
    fs.unlinkSync(tempFilePath);

    // Split PDF text
    const splitDocs = await this.textSplitter.splitDocuments(docs);

    // Build semantic vector store
    const vectorStore = await MemoryVectorStore.fromDocuments(
      splitDocs,
      this.embeddings
    );

    return {
      rawText: docs.map(d => d.pageContent).join("\n"),
      chunks: splitDocs,
      vectorStore,
    };
  }

  parseSummary(summaryText) {
    try {
      const jsonMatch = summaryText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      // Fallback if JSON parsing fails
      return {
        summary: summaryText,
        keyPoints: [],
        scope: "Not specified",
        requirements: []
      };
    } catch (error) {
      return {
        summary: summaryText,
        keyPoints: [],
        scope: "Not specified",
        requirements: []
      };
    }
  }
}

module.exports = DocumentProcessor;