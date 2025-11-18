const fs = require("fs");
const path = require("path");
const os = require("os");

const { PDFLoader } = require("langchain/document_loaders/fs/pdf");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");

class DocumentProcessor {
  constructor() {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    this.embeddings = new OpenAIEmbeddings();
  }

  async processDocument(fileBuffer) {
    try {
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
    } catch (error) {
      throw new Error(`Document processing failed: ${error.message}`);
    }
  }
}

module.exports = DocumentProcessor;
