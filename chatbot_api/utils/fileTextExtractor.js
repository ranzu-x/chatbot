/**
 * Extracts plain text from a PDF/DOCX/TXT file's bytes. Shared by the
 * Knowledge Base file-upload source (routes/aiKnowledge.js) and the AI
 * Reply engine's "customer sent a document in chat" handling
 * (utils/aiReplyEngine.js) — one implementation instead of two.
 */
import path from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

/**
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} originalname - used to infer the extension when mimetype is generic/missing
 */
export async function extractTextFromFile(buffer, mimetype, originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  if (ext === ".pdf" || mimetype === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (ext === ".docx" || mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  // .doc (legacy binary Word) and anything else fall back to a plain-text read.
  return buffer.toString("utf8");
}
