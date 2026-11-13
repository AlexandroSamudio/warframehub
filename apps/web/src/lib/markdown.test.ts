import { describe, expect, it } from 'vitest';
import { renderGuide } from './markdown.ts';

const html = (source: string) => renderGuide(source, '(opens in a new tab)');

describe('renderGuide', () => {
  it('makes headings, paragraphs and lists', () => {
    expect(
      html('## How to play\n\nCast 3 first.\nThen hold 4.\n\n- one\n- two\n\n1. a\n2. b'),
    ).toBe(
      '<h5>How to play</h5><p>Cast 3 first.<br>Then hold 4.</p><ul><li>one</li><li>two</li></ul><ol><li>a</li><li>b</li></ol>',
    );
    // ### is h6 only under an h5; on its own it's h5, so levels never skip.
    expect(html('## Big\n\n### Small')).toBe('<h5>Big</h5><h6>Small</h6>');
    expect(html('### Small')).toBe('<h5>Small</h5>');
  });

  it('marks bold, italic and code', () => {
    expect(html('Press **4**, then *wait* or _run_. Type `**not bold**`.')).toBe(
      '<p>Press <strong>4</strong>, then <em>wait</em> or <em>run</em>. Type <code>**not bold**</code>.</p>',
    );
  });

  it('leaves lone stars and snake_case words alone', () => {
    expect(html('2 * 3 * 4 and max_rank_bonus')).toBe('<p>2 * 3 * 4 and max_rank_bonus</p>');
  });

  it('escapes HTML, so a guide can never add markup', () => {
    expect(html('<img src=x onerror=alert(1)> & "q"')).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;</p>',
    );
    expect(html('**<b>x</b>**')).toBe('<p><strong>&lt;b&gt;x&lt;/b&gt;</strong></p>');
  });

  it('only links http(s), in a new tab', () => {
    expect(html('[video](https://youtu.be/abc)')).toBe(
      '<p><a href="https://youtu.be/abc" target="_blank" rel="noopener noreferrer">video<span class="sr-only"> (opens in a new tab)</span></a></p>',
    );
    expect(html('[x](javascript:alert(1))')).toBe('<p>[x](javascript:alert(1))</p>');
    // Marks never reach into the address; the link text can still be bold.
    expect(html('[**the** video](https://a.b/my_cool_page*x*)')).toBe(
      '<p><a href="https://a.b/my_cool_page*x*" target="_blank" rel="noopener noreferrer"><strong>the</strong> video<span class="sr-only"> (opens in a new tab)</span></a></p>',
    );
    expect(html('[x](https://a.b/"onmouseover="y)')).not.toContain('"onmouseover');
  });

  it('is empty for an empty guide', () => {
    expect(html('')).toBe('');
    expect(html('\n\n  \n')).toBe('');
  });
});
