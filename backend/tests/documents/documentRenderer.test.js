// v0.5 — markdown→PDF renderer smoke test. Asserts the renderer produces
// a non-empty PDF buffer with the PDF magic header and that markdown
// constructs (headings, bullets, bold) don't throw.

const renderer = require('../../src/documents/documentRenderer.service');

describe('documentRenderer.renderMarkdownToPdf', () => {
  it('produces a non-empty Buffer with a valid PDF header', async () => {
    const buf = await renderer.renderMarkdownToPdf('# Hello\n\nA paragraph with **bold** and *italic*.', { title: 'Test Title' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(800);
    // PDF files start with `%PDF-`.
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('handles bullet + ordered lists + horizontal rules + code blocks without throwing', async () => {
    const md = `# Heading 1

## Heading 2

A paragraph here.

- Bullet one
- Bullet two with **bold**

1. First
2. Second

---

\`\`\`
const x = 1;
\`\`\`

End paragraph.`;
    const buf = await renderer.renderMarkdownToPdf(md);
    expect(buf.length).toBeGreaterThan(1200);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('handles empty markdown gracefully', async () => {
    const buf = await renderer.renderMarkdownToPdf('');
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });
});
