/**
 * A small Markdown subset for build guides (SPEC §14.1), with no dependency:
 * `#`/`##`/`###` headings, paragraphs (single line breaks kept), `-`/`*` and `1.` lists,
 * `**bold**`, `*italic*`/`_italic_`, `` `code` `` and `[text](https://…)` links.
 *
 * Everything is HTML-escaped first, so the guide can never inject markup; only the tags
 * made here are real. Links must be http(s) and open in a new tab.
 */

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline marks on already-escaped text. */
function inline(escaped: string, newTabLabel: string): string {
  // Code and link addresses are set aside first, so bold/italic marks never touch them.
  // A private-use character marks their places (never typed in a guide).
  const kept: string[] = [];
  const keep = (html: string) => `${kept.push(html) - 1}`;
  let out = escaped.replace(/`([^`]+)`/g, (_m, code: string) => keep(`<code>${code}</code>`));
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
    (_m, text: string, url: string) =>
      keep(`<a href="${url}" target="_blank" rel="noopener noreferrer">`) +
      text +
      keep(`<span class="sr-only"> ${newTabLabel}</span></a>`),
  );
  out = out.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*(?=\S)(.+?)(?<=\S)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>');
  return out.replace(/(\d+)/g, (_m, i: string) => kept[Number(i)]!);
}

type Block =
  | { kind: 'h5' | 'h6'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'p'; lines: string[] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d{1,3}[.)]\s+(.*)$/;

/** The guide as HTML. `newTabLabel` is read after each link ("(opens in a new tab)"). */
export function renderGuide(source: string, newTabLabel: string): string {
  const blocks: Block[] = [];
  const last = () => blocks[blocks.length - 1];
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '') {
      blocks.push({ kind: 'p', lines: [] }); // ends the open block
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (heading) {
      // The guide sits under the page's h3 (Builds) and h4 (How to play).
      blocks.push({ kind: heading[1]!.length === 3 ? 'h6' : 'h5', text: heading[2]! });
    } else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      const item = (bullet ?? numbered)![1]!;
      const open = last();
      if (open?.kind === kind) open.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else {
      const open = last();
      if (open?.kind === 'p') open.lines.push(line);
      else blocks.push({ kind: 'p', lines: [line] });
    }
  }
  const md = (text: string) => inline(escape(text), escape(newTabLabel));
  return blocks
    .map((b) => {
      switch (b.kind) {
        case 'h5':
        case 'h6':
          return `<${b.kind}>${md(b.text)}</${b.kind}>`;
        case 'ul':
        case 'ol':
          return `<${b.kind}>${b.items.map((i) => `<li>${md(i)}</li>`).join('')}</${b.kind}>`;
        case 'p':
          return b.lines.length > 0 ? `<p>${b.lines.map(md).join('<br>')}</p>` : '';
      }
    })
    .join('');
}
