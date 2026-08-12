'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ReactFlow,
  Controls,
  Background,
  Node,
  Edge,
  Position,
  MarkerType,
  Panel,
  BackgroundVariant,
  Handle,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Search, Network, Users, Building2, Folder, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────
type OrgNodeType = 'person' | 'department' | 'group';

// Tree node shape returned by api.orgchart.getOrgChartTree
interface OrgTreeNode {
  _id: string;
  name: string;
  type: OrgNodeType;
  title?: string;
  avatarUrl?: string;
  user?: {
    email?: string;
    phone?: string;
    department?: string;
    position?: string;
    avatarUrl?: string;
  } | null;
  children?: OrgTreeNode[];
}

interface OrgNodeData extends Record<string, unknown> {
  _id: string;
  name: string;
  type: OrgNodeType;
  title?: string;
  children?: OrgTreeNode[];
  avatarUrl?: string;
  user?: {
    email?: string;
    phone?: string;
    department?: string;
    position?: string;
    avatarUrl?: string;
  } | null;
  label: string;
}

type FlowNode = Node<OrgNodeData>;
type FlowEdge = Edge;

// ─── Custom Node Component ────────────────────────────────────
function OrgNodeComponent({ data }: { data: OrgNodeData }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const avatarUrl = data.avatarUrl || data.user?.avatarUrl;

  const renderAvatar = () => {
    if (data.type !== 'person') return null;

    return (
      <Avatar className="h-6 w-6 flex-shrink-0">
        <AvatarImage src={avatarUrl} alt={data.name} />
        <AvatarFallback className="text-xs">{getInitials(data.name)}</AvatarFallback>
      </Avatar>
    );
  };

  const getNodeIcon = () => {
    switch (data.type) {
      case 'department':
        return <Building2 className="h-4 w-4 text-[var(--primary)]" />;
      case 'group':
        return <Folder className="h-4 w-4 text-[var(--badge-purple-text)]" />;
      default:
        return renderAvatar();
    }
  };

  const getNodeColor = () => {
    switch (data.type) {
      case 'department':
        return 'border-[var(--primary)]/50 bg-[var(--card)] text-[var(--text-primary)]';
      case 'group':
        return 'border-[var(--badge-purple-border)] bg-[var(--badge-purple-bg)] text-[var(--text-primary)]';
      default:
        return 'border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] text-[var(--text-primary)]';
    }
  };

  const getBadgeColor = () => {
    switch (data.type) {
      case 'department':
        return 'bg-[var(--badge-primary-bg)] text-[var(--badge-primary-text)]';
      case 'group':
        return 'bg-[var(--badge-purple-bg)] text-[var(--badge-purple-text)]';
      default:
        return 'bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]';
    }
  };

  return (
    <div
      className={`rounded-lg border-2 ${getNodeColor()} shadow-sm hover:shadow-md transition-shadow cursor-pointer min-w-48`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          {getNodeIcon()}
          <span className="font-semibold text-sm truncate max-w-32 text-[var(--text-primary)]">
            {data.name}
          </span>
        </div>
        {data.title && (
          <p className="text-xs text-[var(--text-secondary)] truncate">{data.title}</p>
        )}
        <Badge className={`mt-2 text-xs ${getBadgeColor()}`}>{data.type}</Badge>

        {isExpanded && data.children && data.children.length > 0 && (
          <div className="mt-2 pt-2 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text-muted)] mb-1">
              {data.children.length} {t('orgChart.directReports', 'direct reports')}
            </p>
          </div>
        )}

        {isExpanded && data.user && (
          <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1">
            {data.user.email && (
              <p className="text-xs text-[var(--text-muted)] truncate">{data.user.email}</p>
            )}
            {data.user.phone && (
              <p className="text-xs text-[var(--text-muted)]">{data.user.phone}</p>
            )}
            {data.user.department && (
              <p className="text-xs text-[var(--text-muted)]">{data.user.department}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Node Types Map ───────────────────────────────────────────
const nodeTypes = Object.freeze({
  orgNode: OrgNodeComponent,
});

// ─── Main Component ───────────────────────────────────────────
export default function OrgChartClient() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const orgIdToQuery = selectedOrgId || (user?.role === 'admin' ? user?.organizationId : null);

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Id<'orgChartNodes'> | null>(null);
  const [nodeForm, setNodeForm] = useState({
    name: '',
    title: '',
    type: 'person' as OrgNodeType,
    parentId: '',
    userId: '',
  });

  // Fetch data
  const orgNodes = useQuery(
    api.orgchart.getOrgChart,
    orgIdToQuery && user?.id
      ? {
          organizationId: orgIdToQuery as Id<'organizations'>,
        }
      : 'skip',
  );

  const orgTree = useQuery(
    api.orgchart.getOrgChartTree,
    orgIdToQuery && user?.id
      ? {
          organizationId: orgIdToQuery as Id<'organizations'>,
        }
      : 'skip',
  );

  // The declared root of the reporting line, and the people who are not attached
  // to it. Both are what makes the chart a tree instead of a forest.
  const orgHead = useQuery(
    api.reporting.getOrganizationHead,
    orgIdToQuery && user?.id ? { organizationId: orgIdToQuery as Id<'organizations'> } : 'skip',
  );

  const unassignedUsers = useQuery(
    api.reporting.getUnassignedUsers,
    orgIdToQuery && user?.id ? { organizationId: orgIdToQuery as Id<'organizations'> } : 'skip',
  );

  const headCandidates = useQuery(
    api.reporting.getPotentialManagers,
    orgIdToQuery && user?.id ? { organizationId: orgIdToQuery as Id<'organizations'> } : 'skip',
  );

  // Mutations
  const generateOrgChart = useMutation(api.orgchart.generateOrgChartFromUsers);
  const createNode = useMutation(api.orgchart.createNode);
  const updateNode = useMutation(api.orgchart.updateNode);
  const deleteNode = useMutation(api.orgchart.deleteNode);
  const saveLayout = useMutation(api.orgchart.saveLayout);
  const setOrganizationHead = useMutation(api.reporting.setOrganizationHead);

  // Build React Flow nodes and edges from tree data with proper tree layout
  const buildFlowElements = useCallback(
    (treeData: unknown[]): { nodes: FlowNode[]; edges: FlowEdge[] } => {
      const NODE_WIDTH = 220;
      const NODE_GAP = 60;
      const LEVEL_HEIGHT = 220;

      // Calculate subtree leaf count for proper positioning
      const getLeafCount = (node: OrgTreeNode): number => {
        if (!node.children || node.children.length === 0) return 1;
        return node.children.reduce((sum, child) => sum + getLeafCount(child), 0);
      };

      // Build layout: position each node based on its subtree

      const layoutNodes: { node: OrgTreeNode; x: number; y: number }[] = [];
      const layoutEdges: FlowEdge[] = [];

      const layoutTree = (
        nodes: OrgTreeNode[],
        startX: number,
        depth: number,
        parentId: string | null,
      ): number => {
        if (nodes.length === 0) return startX;

        // Calculate total width needed for all children
        const totalLeafCount = nodes.reduce((sum, n) => sum + getLeafCount(n), 0);
        const _totalWidth = totalLeafCount * (NODE_WIDTH + NODE_GAP) - NODE_GAP;

        let currentX = startX;
        const y = depth * LEVEL_HEIGHT;

        for (const node of nodes) {
          const leafCount = getLeafCount(node);
          const subtreeWidth = leafCount * (NODE_WIDTH + NODE_GAP) - NODE_GAP;
          const nodeX = currentX + subtreeWidth / 2;

          layoutNodes.push({ node, x: nodeX, y });

          if (parentId) {
            layoutEdges.push({
              id: `e-${parentId}-${node._id}`,
              source: parentId,
              target: node._id,
              sourceHandle: 'bottom',
              targetHandle: 'top',
              type: 'smoothstep',
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
              },
              style: {
                stroke: '#94a3b8',
                strokeWidth: 2,
              },
            });
          }

          if (node.children && node.children.length > 0) {
            layoutTree(node.children, currentX, depth + 1, node._id);
          }

          currentX += subtreeWidth + NODE_GAP;
        }

        return currentX;
      };

      layoutTree(treeData as OrgTreeNode[], 0, 0, null);

      const flowNodes: FlowNode[] = layoutNodes.map(({ node, x, y }) => ({
        id: node._id,
        type: 'orgNode',
        position: { x, y },
        data: {
          ...node,
          label: node.name,
          children: node.children || [],
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      }));

      return { nodes: flowNodes, edges: layoutEdges };
    },
    [],
  );

  // Sync flow elements whenever the tree query resolves.
  //
  // This used to be guarded by `orgTree.length > 0`, which stranded the previous
  // organization's chart on screen: switching to an org that has no org chart yet
  // resolves the query to `[]`, the guard skipped the update, and the stale nodes
  // kept rendering as if they belonged to the newly selected org. `undefined` is
  // the loading state and is still skipped — the loader covers that case.
  useEffect(() => {
    if (orgTree === undefined) return;
    const { nodes: flowNodes, edges: flowEdges } = buildFlowElements(orgTree);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync flow elements when the org tree query resolves
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [orgTree, buildFlowElements]);

  // Filter nodes based on search
  const filteredNodes = useMemo(() => {
    if (!searchQuery) return nodes;
    const lowerQuery = searchQuery.toLowerCase();
    return nodes.filter(
      (node) =>
        node.data.name?.toLowerCase().includes(lowerQuery) ||
        node.data.title?.toLowerCase().includes(lowerQuery) ||
        node.data.user?.email?.toLowerCase().includes(lowerQuery),
    );
  }, [nodes, searchQuery]);

  // Handlers
  const handleGenerateOrgChart = async () => {
    if (!orgIdToQuery || !user?.id) return;

    try {
      const result = await generateOrgChart({
        organizationId: orgIdToQuery as Id<'organizations'>,
      });

      toast.success(
        t('orgChart.generateSuccess', 'Org chart generated successfully') +
          ` (${result.nodesCreated} nodes)`,
      );
    } catch {
      toast.error(t('orgChart.generateError', 'Failed to generate org chart'));
    }
  };

  const handleAddNode = async () => {
    if (!orgIdToQuery || !user?.id) return;
    if (!nodeForm.name) {
      toast.error(t('errors.required', 'This field is required'));
      return;
    }

    try {
      await createNode({
        organizationId: orgIdToQuery as Id<'organizations'>,
        name: nodeForm.name,
        type: nodeForm.type,
        title: nodeForm.title || undefined,
        parentId: nodeForm.parentId ? (nodeForm.parentId as Id<'orgChartNodes'>) : undefined,
        userId: nodeForm.userId ? (nodeForm.userId as Id<'users'>) : undefined,
      });

      toast.success(t('orgChart.createSuccess', 'Node created successfully'));
      setShowAddDialog(false);
      setNodeForm({ name: '', title: '', type: 'person', parentId: '', userId: '' });
    } catch {
      toast.error(t('orgChart.createError', 'Failed to create node'));
    }
  };

  const handleUpdateNode = async () => {
    if (!selectedNode || !user?.id) return;
    if (!nodeForm.name) {
      toast.error(t('errors.required', 'This field is required'));
      return;
    }

    try {
      await updateNode({
        nodeId: selectedNode,
        name: nodeForm.name,
        title: nodeForm.title || undefined,
        parentId: nodeForm.parentId ? (nodeForm.parentId as Id<'orgChartNodes'>) : undefined,
        userId: nodeForm.userId ? (nodeForm.userId as Id<'users'>) : undefined,
      });

      toast.success(t('orgChart.updateSuccess', 'Node updated successfully'));
      setShowEditDialog(false);
      setSelectedNode(null);
      setNodeForm({ name: '', title: '', type: 'person', parentId: '', userId: '' });
    } catch (e) {
      // Re-parenting a person writes the reporting line, which refuses cycles,
      // inactive managers and cross-org moves. The reason is the useful part.
      toast.error(
        e instanceof Error ? e.message : t('orgChart.updateError', 'Failed to update node'),
      );
    }
  };

  const _handleDeleteNode = async (nodeId: Id<'orgChartNodes'>) => {
    if (!user?.id) return;

    if (
      !confirm(
        t(
          'orgChart.confirmDelete',
          'Are you sure you want to delete this node and all its children?',
        ),
      )
    ) {
      return;
    }

    try {
      await deleteNode({
        nodeId,
      });

      toast.success(t('orgChart.deleteSuccess', 'Node deleted successfully'));
    } catch {
      toast.error(t('orgChart.deleteError', 'Failed to delete node'));
    }
  };

  const handleNodeDrag = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!isAdmin) return;

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) {
            return {
              ...n,
              position: node.position,
            };
          }
          return n;
        }),
      );
    },
    [isAdmin, setNodes],
  );

  const handleSaveLayout = async () => {
    if (!orgIdToQuery || !user?.id) return;

    try {
      await saveLayout({
        organizationId: orgIdToQuery as Id<'organizations'>,
        layoutData: { nodes, edges },
        isDefault: true,
      });

      toast.success(t('orgChart.layoutSaved', 'Layout saved successfully'));
    } catch {
      toast.error(t('orgChart.layoutSaveError', 'Failed to save layout'));
    }
  };

  const handleSetHead = async (value: string) => {
    if (!orgIdToQuery) return;
    try {
      await setOrganizationHead({
        organizationId: orgIdToQuery as Id<'organizations'>,
        ...(value === '__none__' ? {} : { userId: value as Id<'users'> }),
      });
      toast.success(t('orgChart.headSaved', 'Head of the organization updated'));
    } catch (e) {
      // The mutation refuses a head who reports to someone, is inactive, belongs
      // to another organization, or is the platform superadmin — show which.
      toast.error(e instanceof Error ? e.message : t('orgChart.headSaveError', 'Failed to save'));
      logger.error('Set organization head error:', e);
    }
  };

  const handleExportSVG = () => {
    const svgElement = document.querySelector('.react-flow');
    if (svgElement) {
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'org-chart.svg';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // No organization selected — show empty state
  if (!orgIdToQuery) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center p-8">
        <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2 text-foreground">
          {t('orgChart.noOrgSelected', 'No organization selected')}
        </h3>
        <p className="text-muted-foreground">
          {t(
            'orgChart.selectOrgToView',
            'Please select an organization to view or create its org chart.',
          )}
        </p>
      </div>
    );
  }

  // Loading state — only when org is selected but data is still fetching
  if (orgNodes === undefined || orgTree === undefined) {
    return (
      <div className="flex items-center justify-center h-96">
        <ShieldLoader message={t('orgChart.loading', 'Loading org chart...')} />
      </div>
    );
  }

  return (
    <div className="mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              {t('orgChart.title', 'Organization Chart')}
            </h2>
            <p className="text-(--text-muted) text-sm mt-1">
              {t('orgChart.subtitle', 'Visual hierarchy of your team')}
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportSVG}>
              <Download className="h-4 w-4 mr-2" />
              {t('common.exportSVG', 'Export SVG')}
            </Button>

            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('orgChart.addNode', 'Add Node')}
                </Button>

                <Button variant="outline" size="sm" onClick={handleGenerateOrgChart}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('orgChart.generateFromUsers', 'Generate from Employee Data')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Head of the organization + people outside the hierarchy */}
      {isAdmin && (
        <Card className="mb-6 bg-card text-card-foreground">
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              <div className="lg:w-80">
                <label className="text-sm font-medium text-(--text-primary)">
                  {t('orgChart.head', 'Head of the organization')}
                </label>
                <p className="text-xs text-(--text-muted) mt-0.5 mb-2">
                  {t(
                    'orgChart.headHint',
                    'The root of the chart and the last step of every approval chain. They must not report to anyone.',
                  )}
                </p>
                <Select value={orgHead?._id ?? '__none__'} onValueChange={handleSetHead}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.none', 'None')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('common.none', 'None')}</SelectItem>
                    {headCandidates?.map((candidate) => (
                      <SelectItem key={candidate._id} value={candidate._id}>
                        {candidate.name}
                        {candidate.position ? ` — ${candidate.position}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <p className="text-sm font-medium text-(--text-primary)">
                  {t('orgChart.unassigned', 'Not placed in the hierarchy')}
                </p>
                {unassignedUsers === undefined ? (
                  <p className="text-xs text-(--text-muted) mt-1">{t('commonUI.loading')}...</p>
                ) : unassignedUsers.length === 0 ? (
                  <p className="text-xs text-(--text-muted) mt-1">
                    {t('orgChart.unassignedNone', 'Everyone reports to someone.')}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-(--text-muted) mt-0.5 mb-2">
                      {t(
                        'orgChart.unassignedHint',
                        'These people have no manager, so they render as separate roots. Assign a manager to place them.',
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {unassignedUsers.map((u) => (
                        <Badge
                          key={u._id}
                          variant="outline"
                          className="flex items-center gap-1 text-foreground"
                        >
                          {u.name}
                          {u.position ? (
                            <span className="text-(--text-muted)">· {u.position}</span>
                          ) : null}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card className="mb-6 bg-card text-card-foreground">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('orgChart.searchOrgChart', 'Search org chart...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1 text-foreground">
                <Users className="h-3 w-3" />
                {nodes.length} {t('common.nodes', 'nodes')}
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1 text-foreground">
                <Network className="h-3 w-3" />
                {edges.length} {t('common.edges', 'edges')}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Org Chart Canvas */}
      <Card className="h-[calc(100vh-16rem)] bg-card text-card-foreground">
        <CardContent className="p-0 h-full">
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Network className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2 text-foreground">
                {t('orgChart.noData', 'No organization chart data yet')}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t(
                  'orgChart.noDataDesc',
                  'Generate an org chart from employee data or add nodes manually.',
                )}
              </p>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button onClick={handleGenerateOrgChart}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('orgChart.generateFromUsers', 'Generate from Employee Data')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('orgChart.addNode', 'Add Node')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ReactFlow
              key={edges
                .map((e) => `${e.source}-${e.target}`)
                .sort()
                .join('|')}
              nodes={filteredNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDrag={handleNodeDrag}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-right"
              className="bg-background"
            >
              <Controls className="bg-card text-foreground border-border" />
              <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#94a3b8" />
              <Panel
                position="top-right"
                className="bg-card/80 backdrop-blur-sm rounded-lg p-2 border border-border"
              >
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Button variant="ghost" size="icon" onClick={handleSaveLayout}>
                      <Download className="h-4 w-4 text-foreground" />
                    </Button>
                  )}
                </div>
              </Panel>
            </ReactFlow>
          )}
        </CardContent>
      </Card>

      {/* Add Node Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orgChart.addNode', 'Add Node')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('orgChart.nodeName', 'Name')} *</label>
              <Input
                value={nodeForm.name}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('placeholders.enterFullName', 'Enter full name')}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('orgChart.nodeTitle', 'Title')}</label>
              <Input
                value={nodeForm.title}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={t('placeholders.position', 'Position')}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('orgChart.nodeType', 'Type')}</label>
              <Select
                value={nodeForm.type}
                onValueChange={(value) =>
                  setNodeForm((prev) => ({ ...prev, type: value as OrgNodeType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">{t('orgChart.person', 'Person')}</SelectItem>
                  <SelectItem value="department">
                    {t('orgChart.department', 'Department')}
                  </SelectItem>
                  <SelectItem value="group">{t('orgChart.group', 'Group')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('orgChart.parent', 'Parent')}</label>
              <Select
                value={nodeForm.parentId || '__none__'}
                onValueChange={(value) =>
                  setNodeForm((prev) => ({ ...prev, parentId: value === '__none__' ? '' : value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('placeholders.selectOrg', 'Select organization')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('common.none', 'None')}</SelectItem>
                  {orgNodes?.map((node) => (
                    <SelectItem key={node._id} value={node._id}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleAddNode}>{t('common.save', 'Save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Node Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orgChart.editNode', 'Edit Node')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('orgChart.nodeName', 'Name')} *</label>
              <Input
                value={nodeForm.name}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('placeholders.enterFullName', 'Enter full name')}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('orgChart.nodeTitle', 'Title')}</label>
              <Input
                value={nodeForm.title}
                onChange={(e) => setNodeForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={t('placeholders.position', 'Position')}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('orgChart.nodeType', 'Type')}</label>
              <Select
                value={nodeForm.type}
                onValueChange={(value) =>
                  setNodeForm((prev) => ({ ...prev, type: value as OrgNodeType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">{t('orgChart.person', 'Person')}</SelectItem>
                  <SelectItem value="department">
                    {t('orgChart.department', 'Department')}
                  </SelectItem>
                  <SelectItem value="group">{t('orgChart.group', 'Group')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('orgChart.parent', 'Parent')}</label>
              <p className="text-xs text-(--text-muted) mt-0.5 mb-1.5">
                {t(
                  'orgChart.parentIsManager',
                  'For a person this is their manager: saving it changes the reporting line, not just the chart.',
                )}
              </p>
              <Select
                value={nodeForm.parentId || '__none__'}
                onValueChange={(value) =>
                  setNodeForm((prev) => ({ ...prev, parentId: value === '__none__' ? '' : value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('placeholders.selectOrg', 'Select organization')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('common.none', 'None')}</SelectItem>
                  {orgNodes
                    ?.filter((node) => node._id !== selectedNode)
                    .map((node) => (
                      <SelectItem key={node._id} value={node._id}>
                        {node.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleUpdateNode}>{t('common.save', 'Save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
