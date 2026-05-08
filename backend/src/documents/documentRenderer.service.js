// Submission Readiness Engine v0.5 (a.k.a. master Phase 4) —
// markdown → PDF renderer.
//
// Pure-Node path: markdown-it parses to HTML tokens, then we walk a
// tiny subset of those tokens and emit pdfkit drawing commands. No
// Chromium / puppeteer — keeps the prod container small and the cold
// start reasonable.
//
// Supported markdown features (everything else falls back to plain text):
//   # / ## / ### headings
//   paragraphs (with bold + italic + inline code)
//   * / - bulleted lists, 1. ordered lists (single-level)
//   horizontal rules
//   fenced code blocks (mono font, indented)
//
// Output: a Buffer containing a single-page-flow letter-size PDF.

const MarkdownIt = require('markdown-it');
const PDFDocument = require('pdfkit');
const logger = require('../logging/logger');

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

// Page + font tuning — letter US, 1-inch margins, body 11pt.
const PAGE_OPTS = {
  size: 'LETTER',
  margins: { top: 72, bottom: 72, left: 72, right: 72 },
  bufferPages: true,
  info: { Producer: 'Opportunity Pulse v0.5 — Submission Package' },
};
const FONTS = {
  body:    'Helvetica',
  bold:    'Helvetica-Bold',
  italic:  'Helvetica-Oblique',
  mono:    'Courier',
};

// Render the inline children of a token (handles bold / italic / code / link / text).
// pdfkit has its own `text()` method with structured `continued` semantics — we
// rely on those so a single line can mix fonts without manual y-tracking.
function emitInline(doc, tokens, { baseFont = FONTS.body, baseSize = 11 } = {}) {
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const isLast = i === tokens.length - 1;
    if (t.type === 'text') {
      doc.font(baseFont).fontSize(baseSize).text(t.content, { continued: !isLast });
    } else if (t.type === 'softbreak' || t.type === 'hardbreak') {
      doc.text(' ', { continued: !isLast });
    } else if (t.type === 'strong_open') {
      // Run forward until strong_close, render bold.
      const closeIdx = tokens.findIndex((x, idx) => idx > i && x.type === 'strong_close');
      const inside = tokens.slice(i + 1, closeIdx);
      const txt = inside.map((x) => x.content || '').join('');
      doc.font(FONTS.bold).fontSize(baseSize).text(txt, { continued: !(isLast && closeIdx === tokens.length - 1) });
      i = closeIdx;
    } else if (t.type === 'em_open') {
      const closeIdx = tokens.findIndex((x, idx) => idx > i && x.type === 'em_close');
      const inside = tokens.slice(i + 1, closeIdx);
      const txt = inside.map((x) => x.content || '').join('');
      doc.font(FONTS.italic).fontSize(baseSize).text(txt, { continued: !(isLast && closeIdx === tokens.length - 1) });
      i = closeIdx;
    } else if (t.type === 'code_inline') {
      doc.font(FONTS.mono).fontSize(baseSize - 1).text(t.content, { continued: !isLast });
    } else if (t.type === 'link_open') {
      const closeIdx = tokens.findIndex((x, idx) => idx > i && x.type === 'link_close');
      const inside = tokens.slice(i + 1, closeIdx);
      const txt = inside.map((x) => x.content || '').join('');
      doc.font(baseFont).fontSize(baseSize).fillColor('#1e40af')
        .text(txt, { continued: !(isLast && closeIdx === tokens.length - 1), underline: true });
      doc.fillColor('black');
      i = closeIdx;
    }
  }
  // Flush the final continued segment with a newline.
  doc.text('', { continued: false });
}

function renderTokensToPdf(doc, tokens) {
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const level = Number(t.tag.slice(1)) || 1;
      const size = level === 1 ? 22 : level === 2 ? 16 : 13;
      doc.moveDown(0.5);
      const closeIdx = tokens.findIndex((x, idx) => idx > i && x.type === 'heading_close');
      const inline = tokens[i + 1];
      const text = (inline && inline.content) || '';
      doc.font(FONTS.bold).fontSize(size).fillColor('#1a365d').text(text);
      doc.fillColor('black').moveDown(0.4);
      i = closeIdx;
    } else if (t.type === 'paragraph_open') {
      const closeIdx = tokens.findIndex((x, idx) => idx > i && x.type === 'paragraph_close');
      const inline = tokens[i + 1];
      if (inline && inline.children) emitInline(doc, inline.children);
      doc.moveDown(0.5);
      i = closeIdx;
    } else if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const ordered = t.type === 'ordered_list_open';
      const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close';
      const closeIdx = tokens.findIndex((x, idx) => idx > i && x.type === closeType);
      let n = 0;
      for (let j = i + 1; j < closeIdx; j += 1) {
        const tok = tokens[j];
        if (tok.type === 'list_item_open') {
          n += 1;
          const itemCloseIdx = tokens.findIndex((x, idx) => idx > j && x.type === 'list_item_close');
          // Find the paragraph_open inside the item
          const itemInline = tokens.slice(j + 1, itemCloseIdx).find((x) => x.type === 'inline');
          const bullet = ordered ? `${n}.` : '•';
          doc.font(FONTS.body).fontSize(11);
          if (itemInline && itemInline.children) {
            doc.text(`${bullet}  `, { continued: true });
            emitInline(doc, itemInline.children);
          } else {
            doc.text(`${bullet}`);
          }
          j = itemCloseIdx;
        }
      }
      doc.moveDown(0.5);
      i = closeIdx;
    } else if (t.type === 'hr') {
      doc.moveDown(0.3);
      doc.strokeColor('#cbd5e1').lineWidth(0.5)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke()
        .strokeColor('black');
      doc.moveDown(0.5);
    } else if (t.type === 'fence' || t.type === 'code_block') {
      doc.font(FONTS.mono).fontSize(9.5).fillColor('#374151')
        .text(String(t.content || '').replace(/\n$/, ''), {
          indent: 12,
        });
      doc.fillColor('black').moveDown(0.5);
    }
  }
}

async function renderMarkdownToPdf(markdown, { title } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument(PAGE_OPTS);
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Cover banner — small title strip on page 1.
      if (title) {
        doc.fillColor('#1a365d').font(FONTS.bold).fontSize(10).text(String(title), { lean: true });
        doc.fillColor('black').moveDown(0.3);
        doc.strokeColor('#e5e7eb').lineWidth(0.5)
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .stroke()
          .strokeColor('black');
        doc.moveDown(0.5);
      }

      const tokens = md.parse(String(markdown || ''), {});
      renderTokensToPdf(doc, tokens);
      doc.end();
    } catch (e) {
      logger.error('documentRenderer: failed', { error: e.message });
      reject(e);
    }
  });
}

module.exports = {
  renderMarkdownToPdf,
};
