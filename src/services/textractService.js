const { TextractClient, AnalyzeDocumentCommand } = require("@aws-sdk/client-textract");

class TextractService {
  constructor() {
    this.client = new TextractClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }

  /**
   * Run Textract AnalyzeDocument to get text + simple insights.
   * For more advanced use, you can add TABLES/FORMS and parse blocks.
   */
  async analyzePolicy(buffer) {
    const params = {
      Document: { Bytes: buffer },
      FeatureTypes: ["FORMS", "TABLES"], // can tweak depending on what you want
    };

    const command = new AnalyzeDocumentCommand(params);
    const response = await this.client.send(command);

    // --- Very simple parsing: collect all text blocks, and key-value style hints ---
    const blocks = response.Blocks || [];

    const allText = [];
    const keyValuePairs = [];

    for (const block of blocks) {
      if (block.BlockType === "LINE" && block.Text) {
        allText.push(block.Text);
      }
    }

    // (Optional) You can later add more advanced key-value/table parsing here

    return {
      rawText: allText.join("\n"),
      keyValuePairs,
      textractRaw: response, // keep if you want to store further
    };
  }
}

module.exports = TextractService;
