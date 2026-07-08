import { useMemo } from 'react';

// Minimal, safe markdown → HTML for coach messages. Escapes HTML first, then
// applies a small subset: headings, bold, italic, inline code, fenced code,
// links, and unordered/ordered lists. Rendered with the `.md-body` styles.

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMarkdown(md: string): string {
  const escaped = escapeHtml(md);
  const lines = escaped.split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  const codeBuffer: string[] = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.trim().startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
        codeBuffer.length = 0;
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Horizontal rule: a line of only ---, ***, or ___ (3+).
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      closeList();
      html.push('<hr>');
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      // Clamp to h6 (regex already caps at 6) so we never emit invalid tags.
      const level = heading[1].length;
      html.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
      continue;
    }

    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const unordered = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ordered) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${inlineFormat(ordered[1])}</li>`);
      continue;
    }
    if (unordered) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${inlineFormat(unordered[1])}</li>`);
      continue;
    }

    if (line.trim() === '') {
      closeList();
      continue;
    }

    closeList();
    html.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inCode && codeBuffer.length) {
    html.push(`<pre><code>${codeBuffer.join('\n')}</code></pre>`);
  }
  closeList();

  return html.join('');
}

interface ChatMarkdownProps {
  content: string;
  streaming?: boolean;
}

export default function ChatMarkdown({ content, streaming }: ChatMarkdownProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div className={`md-body text-[14px] ${streaming ? 'stream-caret' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
