import { Fragment, type ReactNode } from 'react';

/**
 * Renders the subset of Telegram HTML our posts use (b/strong, i/em, a[href]) as React
 * elements. Everything else becomes plain text, so no markup is ever injected.
 */
function toReact(node: Node, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;
  const children = Array.from(node.childNodes).map((child, index) => toReact(child, index));
  switch (node.tagName.toLowerCase()) {
    case 'b':
    case 'strong':
      return <strong key={key}>{children}</strong>;
    case 'i':
    case 'em':
      return <em key={key}>{children}</em>;
    case 'a': {
      const href = node.getAttribute('href') ?? '';
      return /^https?:\/\//i.test(href) ? (
        <a key={key} href={href} target="_blank" rel="noreferrer" className="text-accent underline">
          {children}
        </a>
      ) : (
        <Fragment key={key}>{children}</Fragment>
      );
    }
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

export function TelegramHtml({ html }: { html: string }) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {Array.from(doc.body.childNodes).map((node, index) => toReact(node, index))}
    </div>
  );
}
