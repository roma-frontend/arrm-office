/**
 * Org chart → standalone SVG.
 *
 * WHY THIS EXISTS
 *   The export used to be `new XMLSerializer().serializeToString(document
 *   .querySelector('.react-flow'))` — it serialized a *div* and labelled the
 *   result `image/svg+xml`. Everything that made the chart readable lived
 *   outside that string: the node cards are HTML, their styling comes from
 *   Tailwind classes in a stylesheet that is not part of the file, and the edges
 *   are drawn by React Flow's own SVG layer with CSS classes. Opened as SVG the
 *   file therefore showed bare serif text, no cards, no connectors, the dotted
 *   canvas background, the React Flow attribution link and whatever toolbar
 *   icons happened to sit inside the container.
 *
 *   So the file is built from the chart *data* instead of from the DOM: real
 *   SVG shapes, self-contained styling, no `foreignObject`, nothing that
 *   depends on the app's CSS being present. It renders the same in a browser,
 *   Illustrator, Figma, Word or a PDF pipeline.
 *
 * LAYOUT
 *   A tidy tree: every parent is centred over the span of its children. The
 *   positions are computed here instead of being read from the canvas, so the
 *   export is deterministic — panning, zooming, a saved drag or a search filter
 *   cannot distort it, and the file is identical for the same data.
 */

export type OrgChartExportNodeType = 'person' | 'department' | 'group';

export interface OrgChartExportNode {
  id: string;
  name: string;
  type: OrgChartExportNodeType;
  /** Job title / position. Never the role — roles are permissions, not jobs. */
  title?: string;
  department?: string;
  email?: string;
}

export interface OrgChartExportEdge {
  source: string;
  target: string;
}

export interface OrgChartExportLabels {
  /** Document heading, e.g. "Organization Chart". */
  title: string;
  /** Optional line under the heading — usually the organization name. */
  subtitle?: string;
  /** Plural noun for the node count, e.g. "people". */
  nodes: string;
  /** Plural noun for the depth count, e.g. "levels". */
  levels: string;
  /** Suffix for a child count, e.g. "direct reports". */
  directReports: string;
  person: string;
  department: string;
  group: string;
  /** Prefix for the timestamp in the footer, e.g. "Generated". */
  generated: string;
  /** Shown instead of a tree when there is nothing to draw. */
  empty: string;
}

export interface BuildOrgChartSvgOptions {
  nodes: OrgChartExportNode[];
  edges: OrgChartExportEdge[];
  labels: OrgChartExportLabels;
  /** Injectable for tests; defaults to now. */
  generatedAt?: Date;
  /** Injectable for tests; defaults to the runtime locale. */
  locale?: string;
}

// ── Geometry ────────────────────────────────────────────────────────────────
const CARD_W = 248;
const CARD_H = 96;
const CARD_RADIUS = 14;
/** Gap between sibling cards. */
const H_GAP = 28;
/** Vertical gap between levels — the connector bus sits in the middle of it. */
const V_GAP = 78;
const PAGE_PAD = 44;
const HEADER_H = 96;
const FOOTER_H = 64;
/** A cycle in the data must not hang the export. */
const MAX_DEPTH = 40;

// ── Palette ─────────────────────────────────────────────────────────────────
// Slate/blue tones that print well and survive greyscale. The accent per type
// matches the semantics used on screen: people green, departments blue,
// groups violet.
const INK = '#0f172a';
const INK_SOFT = '#475569';
const INK_MUTED = '#64748b';
const HAIRLINE = '#e2e8f0';
const CONNECTOR = '#cbd5e1';
const PAPER = '#ffffff';

interface TypeStyle {
  accent: string;
  tint: string;
}

const TYPE_STYLES: Record<OrgChartExportNodeType, TypeStyle> = {
  person: { accent: '#059669', tint: '#ecfdf5' },
  department: { accent: '#2563eb', tint: '#eff6ff' },
  group: { accent: '#7c3aed', tint: '#f5f3ff' },
};

const styleFor = (type: OrgChartExportNodeType): TypeStyle =>
  TYPE_STYLES[type] ?? TYPE_STYLES.person;

// ── Text helpers ────────────────────────────────────────────────────────────

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const NARROW = new Set([...`iíjlItf.,:;'"|!()[]{}\``]);
const WIDE = new Set([...'MWmw@%']);

/**
 * Approximate rendered width. SVG has no text wrapping or ellipsis, so a name
 * that is too long has to be cut before it is written — and it must be cut
 * against a width estimate rather than a character count, or "Իլյա" and
 * "Wilhelmina" would get the same budget.
 */
export function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (const char of text) {
    if (NARROW.has(char)) units += 0.32;
    else if (WIDE.has(char)) units += 0.9;
    else if (char === ' ') units += 0.28;
    else if (char >= '0' && char <= '9') units += 0.56;
    else if (char === char.toUpperCase() && char !== char.toLowerCase()) units += 0.66;
    else units += 0.54;
  }
  return units * fontSize * (bold ? 1.05 : 1);
}

/** Cut `text` to `maxWidth`, ending with an ellipsis when something was lost. */
export function fitText(text: string, maxWidth: number, fontSize: number, bold = false): string {
  if (!text) return '';
  if (estimateTextWidth(text, fontSize, bold) <= maxWidth) return text;

  const chars = [...text];
  let out = '';
  for (const char of chars) {
    if (estimateTextWidth(out + char + '…', fontSize, bold) > maxWidth) break;
    out += char;
  }
  return `${out.trimEnd()}…`;
}

function initialsOf(name: string): string {
  // Punctuation must not become an initial: "Smith & <Sons> Ltd" reads as "SL",
  // not "S&".
  const words = name
    .split(/[\s\-–—]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.slice(0, 2).map((word) => [...word][0] ?? '');
  return letters.join('').toUpperCase();
}

// ── Layout ──────────────────────────────────────────────────────────────────

interface PlacedNode {
  node: OrgChartExportNode;
  /** Left edge. */
  x: number;
  /** Top edge. */
  y: number;
  depth: number;
  childIds: string[];
  isRoot: boolean;
}

interface Layout {
  placed: PlacedNode[];
  byId: Map<string, PlacedNode>;
  width: number;
  height: number;
  depth: number;
}

function layoutTree(nodes: OrgChartExportNode[], edges: OrgChartExportEdge[]): Layout {
  const byId = new Map<string, OrgChartExportNode>(nodes.map((n) => [n.id, n]));
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();

  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    // First parent wins: the chart is a tree, and a second incoming edge would
    // otherwise place one card in two columns.
    if (parentOf.has(edge.target)) continue;
    parentOf.set(edge.target, edge.source);
    childrenOf.set(edge.source, [...(childrenOf.get(edge.source) ?? []), edge.target]);
  }

  // Input order is the order the tree was walked in, which already carries the
  // sibling ordering (position rank), so it is preserved rather than sorted.
  const roots = nodes.filter((n) => !parentOf.has(n.id));

  const placed: PlacedNode[] = [];
  const placedById = new Map<string, PlacedNode>();
  const visited = new Set<string>();
  let cursor = 0;
  let maxDepth = 0;

  /** @returns the centre-x of the placed subtree. */
  const place = (id: string, depth: number): number => {
    const node = byId.get(id);
    if (!node || visited.has(id) || depth > MAX_DEPTH) return cursor;
    visited.add(id);
    maxDepth = Math.max(maxDepth, depth);

    const childIds = (childrenOf.get(id) ?? []).filter((childId) => !visited.has(childId));
    const y = depth * (CARD_H + V_GAP);

    let centerX: number;
    if (childIds.length === 0) {
      centerX = cursor + CARD_W / 2;
      cursor += CARD_W + H_GAP;
    } else {
      const centers = childIds.map((childId) => place(childId, depth + 1));
      const first = centers[0] ?? cursor;
      const last = centers[centers.length - 1] ?? first;
      centerX = (first + last) / 2;
    }

    const entry: PlacedNode = {
      node,
      x: centerX - CARD_W / 2,
      y,
      depth,
      childIds,
      isRoot: depth === 0,
    };
    placed.push(entry);
    placedById.set(id, entry);
    return centerX;
  };

  for (const root of roots) place(root.id, 0);
  // Anything left over sits in a cycle or in a subtree whose parent is missing:
  // drop it into its own root column rather than losing it from the export.
  for (const node of nodes) {
    if (!visited.has(node.id)) place(node.id, 0);
  }

  const minX = placed.length > 0 ? Math.min(...placed.map((p) => p.x)) : 0;
  const shift = PAGE_PAD - minX;
  for (const entry of placed) entry.x += shift;

  const contentRight = placed.length > 0 ? Math.max(...placed.map((p) => p.x + CARD_W)) : CARD_W;
  const contentBottom = placed.length > 0 ? Math.max(...placed.map((p) => p.y + CARD_H)) : 0;

  return {
    placed,
    byId: placedById,
    width: Math.round(contentRight + PAGE_PAD),
    height: Math.round(HEADER_H + contentBottom + FOOTER_H),
    depth: placed.length > 0 ? maxDepth + 1 : 0,
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────

function renderConnectors(layout: Layout): string {
  const paths: string[] = [];

  for (const parent of layout.placed) {
    if (parent.childIds.length === 0) continue;

    const parentCx = parent.x + CARD_W / 2;
    const parentBottom = parent.y + CARD_H;
    const busY = parentBottom + V_GAP / 2;
    const children = parent.childIds
      .map((id) => layout.byId.get(id))
      .filter((child): child is PlacedNode => Boolean(child));
    if (children.length === 0) continue;

    const centers = children.map((child) => child.x + CARD_W / 2);
    const left = Math.min(...centers, parentCx);
    const right = Math.max(...centers, parentCx);

    // Stem down from the parent, one horizontal bus, then a drop into each
    // child. Elbows rather than curves: it is what an org chart reads as, and
    // pure horizontal/vertical strokes stay crisp at any zoom.
    paths.push(`M ${parentCx} ${parentBottom} V ${busY}`);
    if (children.length > 1 || centers[0] !== parentCx) {
      paths.push(`M ${left} ${busY} H ${right}`);
    }
    for (const child of children) {
      paths.push(`M ${child.x + CARD_W / 2} ${busY} V ${child.y}`);
    }
  }

  if (paths.length === 0) return '';
  return `  <g fill="none" stroke="${CONNECTOR}" stroke-width="1.5" stroke-linecap="round">
    <path d="${paths.join(' ')}" />
  </g>`;
}

function renderCard(entry: PlacedNode, labels: OrgChartExportLabels): string {
  const { node, childIds, isRoot } = entry;
  const { accent, tint } = styleFor(node.type);

  const textX = 62;
  const textMax = CARD_W - textX - 18;
  const name = fitText(node.name, textMax, 14.5, true);
  const title = node.title ? fitText(node.title, textMax, 11.5) : '';

  const reports =
    childIds.length > 0 ? `${childIds.length} ${labels.directReports}` : node.department || '';
  const meta = reports ? fitText(reports, textMax, 10.5) : '';

  // The top strip is a path rather than a rect so it follows the card's rounded
  // corners instead of poking out of them.
  const strip = `M 0 ${CARD_RADIUS} A ${CARD_RADIUS} ${CARD_RADIUS} 0 0 1 ${CARD_RADIUS} 0 H ${CARD_W - CARD_RADIUS} A ${CARD_RADIUS} ${CARD_RADIUS} 0 0 1 ${CARD_W} ${CARD_RADIUS} V ${isRoot ? 6 : 4} H 0 Z`;

  return `  <g transform="translate(${entry.x} ${entry.y})">
    <rect width="${CARD_W}" height="${CARD_H}" rx="${CARD_RADIUS}" fill="${PAPER}" stroke="${isRoot ? accent : HAIRLINE}" stroke-width="${isRoot ? 1.5 : 1}" filter="url(#cardShadow)" />
    <path d="${strip}" fill="${accent}" />
    <circle cx="34" cy="52" r="18" fill="${tint}" />
    <text x="34" y="52" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="600" fill="${accent}">${escapeXml(initialsOf(node.name))}</text>
    <text x="${textX}" y="44" font-size="14.5" font-weight="600" fill="${INK}">${escapeXml(name)}</text>
${title ? `    <text x="${textX}" y="63" font-size="11.5" fill="${INK_SOFT}">${escapeXml(title)}</text>\n` : ''}${meta ? `    <text x="${textX}" y="81" font-size="10.5" fill="${INK_MUTED}">${escapeXml(meta)}</text>\n` : ''}  </g>`;
}

function renderHeader(
  labels: OrgChartExportLabels,
  width: number,
  nodeCount: number,
  depth: number,
): string {
  const summary = [
    `${nodeCount} ${labels.nodes}`,
    // Skipped at one level: "1 levels" needs plural rules the export has no
    // business carrying, and a flat chart has no depth worth reporting.
    depth > 1 ? `${depth} ${labels.levels}` : '',
    labels.subtitle ?? '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  return `  <g>
    <text x="${PAGE_PAD}" y="46" font-size="21" font-weight="700" fill="${INK}">${escapeXml(labels.title)}</text>
    <text x="${PAGE_PAD}" y="67" font-size="12" fill="${INK_MUTED}">${escapeXml(summary)}</text>
    <line x1="${PAGE_PAD}" y1="80" x2="${width - PAGE_PAD}" y2="80" stroke="${HAIRLINE}" stroke-width="1" />
  </g>`;
}

function renderFooter(
  labels: OrgChartExportLabels,
  width: number,
  height: number,
  stamp: string,
): string {
  const y = height - 26;
  const swatches: OrgChartExportNodeType[] = ['person', 'department', 'group'];
  let x = PAGE_PAD;
  const items: string[] = [];

  for (const type of swatches) {
    const { accent } = styleFor(type);
    const label = labels[type];
    items.push(
      `    <circle cx="${x + 4}" cy="${y - 4}" r="4" fill="${accent}" />
    <text x="${x + 15}" y="${y}" font-size="11" fill="${INK_MUTED}">${escapeXml(label)}</text>`,
    );
    x += 15 + estimateTextWidth(label, 11) + 22;
  }

  return `  <g>
    <line x1="${PAGE_PAD}" y1="${height - 48}" x2="${width - PAGE_PAD}" y2="${height - 48}" stroke="${HAIRLINE}" stroke-width="1" />
${items.join('\n')}
    <text x="${width - PAGE_PAD}" y="${y}" text-anchor="end" font-size="11" fill="#94a3b8">${escapeXml(stamp)}</text>
  </g>`;
}

/**
 * Build a self-contained SVG document for the chart.
 *
 * Pure: no DOM, no CSS, no network. That is what makes it testable and what
 * makes the output render identically outside the app.
 */
export function buildOrgChartSvg({
  nodes,
  edges,
  labels,
  generatedAt = new Date(),
  locale,
}: BuildOrgChartSvgOptions): string {
  const layout = layoutTree(nodes, edges);
  const width = Math.max(layout.width, 720);
  const height = Math.max(layout.height, 320);

  let stamp = generatedAt.toISOString().slice(0, 16).replace('T', ' ');
  try {
    stamp = generatedAt.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    // Invalid locale tag — keep the ISO fallback rather than failing the export.
  }

  const body =
    layout.placed.length === 0
      ? `  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="14" fill="${INK_MUTED}">${escapeXml(labels.empty)}</text>`
      : [renderConnectors(layout), ...layout.placed.map((entry) => renderCard(entry, labels))]
          .filter(Boolean)
          .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans Armenian', sans-serif" text-rendering="geometricPrecision">
  <title>${escapeXml(labels.title)}</title>
  <defs>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="${INK}" flood-opacity="0.08" />
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="${PAPER}" />
${renderHeader(labels, width, layout.placed.length, layout.depth)}
  <g transform="translate(0 ${HEADER_H})">
${body}
  </g>
${renderFooter(labels, width, height, `${labels.generated} ${stamp}`)}
</svg>
`;
}
