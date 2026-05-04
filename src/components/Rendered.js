'use client';

export default function Rendered({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let inCode = false;
  let codeBuf = [];
  let codeLang = '';

  const inlineFormat = (str) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code class="il-code">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBuf = [];
      } else {
        inCode = false;
        elements.push(
          <pre key={`code-${i}`} className="code-block">
            {codeLang && <span className="code-lang">{codeLang}</span>}
            <code>{codeBuf.join('\n')}</code>
          </pre>
        );
      }
      return;
    }
    if (inCode) {
      codeBuf.push(line);
      return;
    }
    if (line.startsWith('### '))
      elements.push(<h4 key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(4)) }} />);
    else if (line.startsWith('## '))
      elements.push(<h3 key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(3)) }} />);
    else if (line.startsWith('# '))
      elements.push(<h2 key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />);
    else if (/^[-*] /.test(line))
      elements.push(<li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />);
    else if (/^\d+\. /.test(line))
      elements.push(<li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(line.replace(/^\d+\.\s/, '')) }} />);
    else if (line.trim() === '') elements.push(<br key={i} />);
    else elements.push(<p key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
  });

  return <div className="rendered-md">{elements}</div>;
}
