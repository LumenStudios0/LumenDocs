export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em' | 'strike'; children: InlineNode[] }
  | { type: 'link'; url: string; children: InlineNode[] }
  | { type: 'color'; color: 'purple' | 'red' | 'green' | 'blue' | 'orange' | 'pink'; children: InlineNode[] }
export type RichBlock =
  | { type: 'break' }
  | { type: 'pre'; text: string }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'heading'; level: number; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
export function safeUrl(value: unknown, image?: boolean): string
export function parseInline(text: string, depth?: number): InlineNode[]
export function parseRichText(value: string): RichBlock[]
