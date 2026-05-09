// Tiny helper that hides the pdf-parse v1 → v2 API change.
//
// pdf-parse v1 exported a callable function: `pdfParse(buf) → { text, ... }`.
// pdf-parse v2 exports an object with a `PDFParse` class: `new PDFParse({ data: buf }).getText()`.
//
// We have v2 installed in production, so the old `pdfParse(buf)` calls were
// silently throwing "TypeError: pdfParse is not a function" inside try/catch
// blocks — which meant every PDF upload landed with parsedText: null and the
// downstream AI tailoring saw NOTHING from the agency's RFP. This is why a
// real SLCC RFP that explicitly lists 6 required submission files was being
// classified as "no additional document requirements beyond the standard baseline."
//
// Use this helper everywhere instead of calling pdf-parse directly.

async function extractPdfText(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return '';
  // eslint-disable-next-line global-require
  const mod = require('pdf-parse');
  // v2 path
  if (mod && typeof mod.PDFParse === 'function') {
    const parser = new mod.PDFParse({ data: buffer });
    const out = await parser.getText();
    return String(out?.text || '').trim();
  }
  // v1 path (back-compat — if anyone downgrades)
  if (typeof mod === 'function') {
    const out = await mod(buffer);
    return String(out?.text || '').trim();
  }
  throw new Error('pdf-parse module shape unrecognized — neither callable nor PDFParse class');
}

module.exports = { extractPdfText };
