/**
 * Tests for the org chart SVG export.
 *
 * The export used to serialize the `.react-flow` div and label it
 * `image/svg+xml`: the file opened as bare serif text with no cards, no
 * connectors, the canvas dot pattern, the React Flow attribution link and a
 * toolbar icon. These tests pin the properties that made it unusable —
 * self-contained SVG, real shapes, no HTML — plus the layout rule that makes an
 * org chart readable: a parent sits centred over its children.
 */
import { describe, it, expect } from '@jest/globals';
import {
  buildOrgChartSvg,
  escapeXml,
  estimateTextWidth,
  fitText,
  type OrgChartExportNode,
  type OrgChartExportEdge,
} from '@/lib/orgchart/exportSvg';

const labels = {
  title: 'Organization Chart',
  nodes: 'nodes',
  levels: 'levels',
  directReports: 'direct reports',
  person: 'Person',
  department: 'Department',
  group: 'Group',
  generated: 'Generated',
  empty: 'No organization chart data yet',
};

const CARD_W = 248;

/** Profix as the screenshots show it: a CEO, a manager, and the manager's team. */
function chart(): { nodes: OrgChartExportNode[]; edges: OrgChartExportEdge[] } {
  const nodes: OrgChartExportNode[] = [
    { id: 'ceo', name: 'Tigran Gasparyan', title: 'CEO', type: 'person' },
    { id: 'mgr', name: 'Anahit Papyan', title: 'Manager', type: 'person' },
    { id: 'sa1', name: 'Ani Zakaryan', title: 'Senior Accountant', type: 'person' },
    { id: 'ja', name: 'Narek Gabrielyan', title: 'Junior Accountant', type: 'person' },
    { id: 'acc', name: 'Razmik Hovhannisyan', title: 'Accountant', type: 'person' },
  ];
  const edges: OrgChartExportEdge[] = [
    { source: 'ceo', target: 'mgr' },
    { source: 'mgr', target: 'sa1' },
    { source: 'mgr', target: 'ja' },
    { source: 'mgr', target: 'acc' },
  ];
  return { nodes, edges };
}

/** `translate(x y)` of every card, keyed by the name rendered inside it. */
function cardPositions(svg: string): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const groups = svg.split('<g transform="translate(').slice(1);
  for (const group of groups) {
    const coords = /^([\d.-]+) ([\d.-]+)\)/.exec(group);
    const name = /font-size="14.5" font-weight="600"[^>]*>([^<]+)</.exec(group);
    if (coords && name) {
      out.set(name[1]!, { x: Number(coords[1]), y: Number(coords[2]) });
    }
  }
  return out;
}

describe('buildOrgChartSvg — document shape', () => {
  it('emits a standalone SVG document, not a serialized div', () => {
    const { nodes, edges } = chart();
    const svg = buildOrgChartSvg({ nodes, edges, labels, generatedAt: new Date('2026-08-12') });

    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    // The old output leaked HTML and app chrome into the file.
    expect(svg).not.toContain('foreignObject');
    expect(svg).not.toContain('<div');
    expect(svg).not.toContain('react-flow');
    expect(svg).not.toContain('class=');
  });

  it('carries its own typography so it does not fall back to serif', () => {
    const { nodes, edges } = chart();
    const svg = buildOrgChartSvg({ nodes, edges, labels });
    expect(svg).toContain('font-family="Inter');
    // Armenian names must not render as boxes in a viewer without Inter.
    expect(svg).toContain('Noto Sans Armenian');
  });

  it('draws one card per node with its name, title and report count', () => {
    const { nodes, edges } = chart();
    const svg = buildOrgChartSvg({ nodes, edges, labels });

    for (const node of nodes) {
      expect(svg).toContain(`>${node.name}<`);
      expect(svg).toContain(`>${node.title}<`);
    }
    expect(svg).toContain('>3 direct reports<');
    // Five cards, each a rounded rect of the card width.
    expect(svg.match(new RegExp(`<rect width="${CARD_W}"`, 'g'))).toHaveLength(5);
  });

  it('draws connectors as elbowed paths between the levels', () => {
    const { nodes, edges } = chart();
    const svg = buildOrgChartSvg({ nodes, edges, labels });
    const path = /<path d="(M [^"]+)" \/>/.exec(svg);
    expect(path).not.toBeNull();
    // Vertical stems and one horizontal bus per parent.
    expect(path![1]).toMatch(/V /);
    expect(path![1]).toMatch(/H /);
  });

  it('renders a header with the counts and a footer legend', () => {
    const { nodes, edges } = chart();
    const svg = buildOrgChartSvg({
      nodes,
      edges,
      labels: { ...labels, subtitle: 'Profix LLC' },
      generatedAt: new Date('2026-08-12T18:30:00Z'),
      locale: 'en-GB',
    });

    expect(svg).toContain('Organization Chart');
    expect(svg).toContain('5 nodes');
    expect(svg).toContain('3 levels');
    expect(svg).toContain('Profix LLC');
    expect(svg).toContain('>Person<');
    expect(svg).toContain('>Department<');
    expect(svg).toContain('>Group<');
    expect(svg).toContain('Generated');
  });

  it('leaves the depth out of the summary when the chart is flat', () => {
    const svg = buildOrgChartSvg({
      nodes: [
        { id: 'a', name: 'Anna', type: 'person' },
        { id: 'b', name: 'Boris', type: 'person' },
      ],
      edges: [],
      labels,
    });
    expect(svg).toContain('2 nodes');
    expect(svg).not.toContain('1 levels');
  });
});

describe('buildOrgChartSvg — layout', () => {
  it('centres a parent over the span of its children', () => {
    const { nodes, edges } = chart();
    const positions = cardPositions(buildOrgChartSvg({ nodes, edges, labels }));

    const mgr = positions.get('Anahit Papyan')!;
    const first = positions.get('Ani Zakaryan')!;
    const last = positions.get('Razmik Hovhannisyan')!;

    const mgrCentre = mgr.x + CARD_W / 2;
    const childSpanCentre = (first.x + CARD_W / 2 + (last.x + CARD_W / 2)) / 2;
    expect(mgrCentre).toBeCloseTo(childSpanCentre, 5);
  });

  it('puts each generation on its own row and never overlaps siblings', () => {
    const { nodes, edges } = chart();
    const positions = cardPositions(buildOrgChartSvg({ nodes, edges, labels }));

    const ceo = positions.get('Tigran Gasparyan')!;
    const mgr = positions.get('Anahit Papyan')!;
    const first = positions.get('Ani Zakaryan')!;
    const mid = positions.get('Narek Gabrielyan')!;

    expect(ceo.y).toBeLessThan(mgr.y);
    expect(mgr.y).toBeLessThan(first.y);
    expect(first.y).toBe(mid.y);
    expect(mid.x - first.x).toBeGreaterThanOrEqual(CARD_W);
  });

  it('is deterministic for the same data', () => {
    const { nodes, edges } = chart();
    const at = new Date('2026-08-12T10:00:00Z');
    expect(buildOrgChartSvg({ nodes, edges, labels, generatedAt: at, locale: 'en-GB' })).toBe(
      buildOrgChartSvg({ nodes, edges, labels, generatedAt: at, locale: 'en-GB' }),
    );
  });

  it('keeps people whose manager is missing instead of dropping them', () => {
    const svg = buildOrgChartSvg({
      nodes: [
        { id: 'a', name: 'Anna', type: 'person' },
        { id: 'orphan', name: 'Orphan Olga', type: 'person' },
      ],
      // The edge points at a node that is not in the export.
      edges: [{ source: 'ghost', target: 'orphan' }],
      labels,
    });

    expect(svg).toContain('>Anna<');
    expect(svg).toContain('>Orphan Olga<');
  });

  it('survives a cycle in the data', () => {
    const svg = buildOrgChartSvg({
      nodes: [
        { id: 'a', name: 'A one', type: 'person' },
        { id: 'b', name: 'B two', type: 'person' },
      ],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
      labels,
    });

    expect(svg).toContain('>A one<');
    expect(svg).toContain('>B two<');
  });

  it('renders an empty state instead of an empty canvas', () => {
    const svg = buildOrgChartSvg({ nodes: [], edges: [], labels });
    expect(svg).toContain('No organization chart data yet');
    expect(svg).toMatch(/viewBox="0 0 720 320"/);
  });

  it('falls back to an ISO timestamp when the locale tag is invalid', () => {
    const svg = buildOrgChartSvg({
      nodes: [{ id: 'a', name: 'Anna', type: 'person' }],
      edges: [],
      labels,
      generatedAt: new Date('2026-08-12T09:05:00Z'),
      locale: 'not a locale',
    });
    expect(svg).toContain('2026-08-12 09:05');
  });
});

describe('text helpers', () => {
  it('builds initials from letters only, ignoring punctuation', () => {
    const svg = buildOrgChartSvg({
      nodes: [
        { id: 'a', name: 'Smith & <Sons> Ltd', type: 'department' },
        { id: 'b', name: 'Տիգրան Գասպարյան', type: 'person' },
        { id: 'c', name: '???', type: 'group' },
      ],
      edges: [],
      labels,
    });

    expect(svg).toContain('>SS<');
    expect(svg).toContain('>ՏԳ<');
    expect(svg).toContain('>?<');
  });

  it('escapes XML so a name with & or < cannot break the document', () => {
    const svg = buildOrgChartSvg({
      nodes: [{ id: 'a', name: 'Smith & <Sons>', title: '"Chief" & Co', type: 'department' }],
      edges: [],
      labels,
    });

    expect(svg).toContain('Smith &amp; &lt;Sons&gt;');
    expect(svg).not.toContain('<Sons>');
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('measures wide and narrow glyphs differently', () => {
    expect(estimateTextWidth('MMMM', 14)).toBeGreaterThan(estimateTextWidth('iiii', 14));
    expect(estimateTextWidth('', 14)).toBe(0);
  });

  it('cuts long text with an ellipsis and leaves short text alone', () => {
    expect(fitText('Short', 200, 14)).toBe('Short');
    const cut = fitText('Razmik Hovhannisyan-Grigoryan the Third', 90, 14.5, true);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan('Razmik Hovhannisyan-Grigoryan the Third'.length);
    expect(fitText('', 100, 14)).toBe('');
  });

  it('truncates a name that cannot fit the card', () => {
    const svg = buildOrgChartSvg({
      nodes: [
        {
          id: 'a',
          name: 'Konstantin Aleksandrovich Bartholomew-Winterbottom',
          type: 'person',
        },
      ],
      edges: [],
      labels,
    });
    expect(svg).toContain('…');
  });
});
