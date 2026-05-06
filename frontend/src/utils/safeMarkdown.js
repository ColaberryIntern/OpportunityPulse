// Tiny safe markdown -> HTML renderer.
//
// Handles the subset of markdown that gpt-4o-mini reliably produces in
// proposal/offer drafts: ATX headings (## / ###), bold (**), italic (*),
// inline code (`), unordered lists (-,*,+), ordered lists (1.), blank-line
// paragraph splits, and horizontal rules (---).
//
// Hard-escapes HTML before applying inline transforms so the output is
// safe to drop into dangerouslySetInnerHTML. No raw <script>, <iframe>, or
// arbitrary attributes survive.

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

function applyInline(s) {
  // Order matters: bold before italic, code first so its inner content
  // isn't subject to bold/italic. All inputs are already HTML-escaped.
  let out = s;
  // Inline code `...`
  out = out.replace(/`([^`]+?)`/g, '<code>$1</code>');
  // Bold **...**
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  // Italic *...*  (single-asterisk runs that aren't already consumed)
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  return out;
}

export function renderSafeMarkdown(src) {
  if (!src) return '';
  const escaped = escapeHtml(src);
  const lines = escaped.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      out.push('<hr />');
      i += 1;
      continue;
    }
    // Headings (## / ### / ####)
    const h = /^(#{2,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${applyInline(h[2])}</h${level}>`);
      i += 1;
      continue;
    }
    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push('<li>' + applyInline(lines[i].replace(/^[-*+]\s+/, '')) + '</li>');
        i += 1;
      }
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }
    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push('<li>' + applyInline(lines[i].replace(/^\d+\.\s+/, '')) + '</li>');
        i += 1;
      }
      out.push('<ol>' + items.join('') + '</ol>');
      continue;
    }
    // Blank line — paragraph break
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }
    // Paragraph: gather consecutive non-empty, non-special lines.
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^---+\s*$/.test(lines[i])
      && !/^(#{2,6})\s+/.test(lines[i])
      && !/^[-*+]\s+/.test(lines[i])
      && !/^\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) {
      out.push('<p>' + applyInline(para.join(' ')) + '</p>');
    }
  }
  return out.join('\n');
}

export default renderSafeMarkdown;
