import { load } from 'cheerio';

/** Zero-width, bidi-control and other invisible characters that can hide text from readers. */
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Unicode-normalize and collapse whitespace. Safe for any untrusted string. */
export function cleanText(input: string | null | undefined): string {
    if (!input) return '';
    return input
        .normalize('NFKC')
        .replace(INVISIBLE, '')
        .replace(CONTROL, ' ')
        .replace(/ /g, ' ')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

/** Single-line version of cleanText. */
export function cleanLine(input: string | null | undefined): string {
    return cleanText(input).replace(/\n/g, ' ').trim();
}

export function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Greenhouse returns `content` HTML-escaped (`&lt;p&gt;...`). Decode one level of entities so the
 * result can be parsed as HTML. Idempotent for strings that are already raw HTML.
 */
export function decodeEntities(input: string): string {
    if (!/&(lt|gt|amp|quot|#\d+|#x[0-9a-f]+);/i.test(input)) return input;
    return load(`<textarea>${input.replace(/<\/textarea/gi, '&lt;/textarea')}</textarea>`)('textarea').text();
}

export type BlockType = 'heading' | 'item' | 'para';
export interface TextBlock {
    type: BlockType;
    text: string;
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Convert description HTML into an ordered list of text blocks. Scripts, styles, iframes and
 * other active content are dropped; only visible text survives. The output is plain text and is
 * never re-rendered as HTML downstream.
 */
export function htmlToBlocks(html: string | null | undefined): TextBlock[] {
    if (!html) return [];
    const $ = load(decodeEntities(html));
    $('script, style, noscript, iframe, object, embed, svg, form, input, button, template').remove();

    const blocks: TextBlock[] = [];
    const push = (type: BlockType, raw: string) => {
        const text = cleanLine(raw);
        if (text) blocks.push({ type, text });
    };

    const walk = (nodes: ReturnType<typeof $>) => {
        nodes.each((_, el) => {
            if (el.type !== 'tag') {
                if (el.type === 'text') push('para', $(el).text());
                return;
            }
            const tag = el.tagName.toLowerCase();
            const $el = $(el);
            if (HEADING_TAGS.has(tag)) {
                push('heading', $el.text());
            } else if (tag === 'li') {
                push('item', $el.text());
            } else if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'span') {
                const hasBlockChildren = $el.children('p, div, ul, ol, h1, h2, h3, h4, h5, h6, section, table').length > 0;
                if (hasBlockChildren) {
                    walk($el.contents());
                    return;
                }
                const text = cleanLine($el.text());
                // A paragraph that is only bold text is used as a heading by many job boards.
                const strongText = cleanLine($el.children('strong, b').text());
                const isPseudoHeading =
                    text.length > 0 && text.length <= 80 && strongText === text && !/[.!?]$/.test(text);
                push(isPseudoHeading ? 'heading' : 'para', text);
            } else if (tag === 'br') {
                // ignore
            } else if (tag === 'strong' || tag === 'b') {
                const text = cleanLine($el.text());
                push(text.length <= 80 && !/[.!?]$/.test(text) ? 'heading' : 'para', text);
            } else {
                walk($el.contents());
            }
        });
    };

    const root = $('body').length ? $('body').contents() : $.root().contents();
    walk(root);
    return blocks;
}

/** Plain text from blocks, one block per line. */
export function blocksToText(blocks: TextBlock[]): string {
    return blocks.map((b) => (b.type === 'item' ? `- ${b.text}` : b.text)).join('\n');
}
