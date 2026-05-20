'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Plus,
  Search,
  Network,
  Users,
  Building2,
  User,
  Folder,
  Download,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────
type OrgNodeType = 'person' | 'department' | 'group';

interface OrgNodeData extends Record<string, unknown> {
  _id: string;
  name: string;
  type: OrgNodeType;
  title?: string;
  children?: OrgNodeData[];
  user?: {
    email?: string;
    phone?: string;
    department?: string;
    position?: string;
  } | null;
  label: string;
}

type FlowNode = Node<OrgNodeData>;
type FlowEdge = Edge;

// ─── Custom Node Component ────────────────────────────────────
function OrgNodeComponent({ data }: { data: OrgNodeData }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);

  const getNodeIcon = () => {
    switch (data.type) {
      case 'department':
        return <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case 'group':
        return <Folder className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
      default:
        return <User className="h-4 w-4 text-green-600 dark:text-green-400" />;
    }
  };

  const getNodeColor = () => {
    switch (data.type) {
      case 'department':
        return 'border-blue-500 bg-blue-50 text-gray-900 dark:bg-[#1a2744] dark:text-gray-50 dark:border-blue-400';
      case 'group':
        return 'border-purple-500 bg-purple-50 text-gray-900 dark:bg-[#2a1a3e] dark:text-gray-50 dark:border-purple-400';
      default:
        return 'border-green-500 bg-green-50 text-gray-900 dark:bg-[#1a2e24] dark:text-gray-50 dark:border-green-400';
    }
  };

  const getBadgeColor = () => {
    switch (data.type) {
      case 'department':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/80 dark:text-blue-100';
      case 'group':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/80 dark:text-purple-100';
      default:
        return 'bg-green-100 text-green-800 dark:bg-green-900/80 dark:text-green-100';
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
          <span className="font-semibold text-sm truncate max-w-32 text-gray-900 dark:text-gray-100">
            {data.name}
          </span>
        </div>
        {data.title && (
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{data.title}</p>
        )}
        <Badge className={`mt-2 text-xs ${getBadgeColor()}`}>{data.type}</Badge>

        {isExpanded && data.children && data.children.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-muted-foreground mb-1">
              {data.children.length} {t('orgChart.directReports', 'direct reports')}
            </p>
          </div>
        )}

        {isExpanded && data.user && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
            {data.user.email && (
              <p className="text-xs text-muted-foreground truncate">{data.user.email}</p>
            )}
            {data.user.phone && <p className="text-xs text-muted-foreground">{data.user.phone}</p>}
            {data.user.department && (
              <p className="text-xs text-muted-foreground">{data.user.department}</p>
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

  const onNodesChange = useCallback((changes: any) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: any) => {
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
          requesterId: user.id as Id<'users'>,
        }
      : 'skip',
  );

  const orgTree = useQuery(
    api.orgchart.getOrgChartTree,
    orgIdToQuery && user?.id
      ? {
          organizationId: orgIdToQuery as Id<'organizations'>,
          requesterId: user.id as Id<'users'>,
        }
      : 'skip',
  );

  // Mutations
  const generateOrgChart = useMutation(api.orgchart.generateOrgChartFromUsers);
  const createNode = useMutation(api.orgchart.createNode);
  const updateNode = useMutation(api.orgchart.updateNode);
  const deleteNode = useMutation(api.orgchart.deleteNode);
  const saveLayout = useMutation(api.orgchart.saveLayout);
  const fixDepartments = useMutation(api.orgchart.fixOrgChartDepartments);

  // Build React Flow nodes and edges from tree data with proper tree layout
  const buildFlowElements = useCallback(
    (treeData: unknown[]): { nodes: FlowNode[]; edges: FlowEdge[] } => {
      const NODE_WIDTH = 220;
      const NODE_GAP = 60;
      const LEVEL_HEIGHT = 220;

      // Calculate subtree leaf count for proper positioning
      const getLeafCount = (node: any): number => {
        if (!node.children || node.children.length === 0) return 1;
        return node.children.reduce((sum: number, child: any) => sum + getLeafCount(child), 0);
      };

      // Build layout: position each node based on its subtree
      const layoutNodes: { node: any; x: number; y: number }[] = [];
      const layoutEdges: FlowEdge[] = [];

      const layoutTree = (
        nodes: any[],
        startX: number,
        depth: number,
        parentId: string | null,
      ): number => {
        if (nodes.length === 0) return startX;

        // Calculate total width needed for all children
        const totalLeafCount = nodes.reduce((sum, n) => sum + getLeafCount(n), 0);
        const totalWidth = totalLeafCount * (NODE_WIDTH + NODE_GAP) - NODE_GAP;

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

      layoutTree(treeData, 0, 0, null);

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

  // Update flow elements when tree data changes
  useEffect(() => {
    if (orgTree && orgTree.length > 0) {
      const { nodes: flowNodes, edges: flowEdges } = buildFlowElements(orgTree);
      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [orgTree, buildFlowElements, setNodes, setEdges]);

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
        requesterId: user.id as Id<'users'>,
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
        requesterId: user.id as Id<'users'>,
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
        requesterId: user.id as Id<'users'>,
        name: nodeForm.name,
        title: nodeForm.title || undefined,
        parentId: nodeForm.parentId ? (nodeForm.parentId as Id<'orgChartNodes'>) : undefined,
        userId: nodeForm.userId ? (nodeForm.userId as Id<'users'>) : undefined,
      });

      toast.success(t('orgChart.updateSuccess', 'Node updated successfully'));
      setShowEditDialog(false);
      setSelectedNode(null);
      setNodeForm({ name: '', title: '', type: 'person', parentId: '', userId: '' });
    } catch {
      toast.error(t('orgChart.updateError', 'Failed to update node'));
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
        requesterId: user.id as Id<'users'>,
      });

      toast.success(t('orgChart.deleteSuccess', 'Node deleted successfully'));
    } catch {
      toast.error(t('orgChart.deleteError', 'Failed to delete node'));
    }
  };

  const handleNodeDrag = useCallback(
    (_event: any, node: Node) => {
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
        requesterId: user.id as Id<'users'>,
        layoutData: { nodes, edges },
        isDefault: true,
      });

      toast.success(t('orgChart.layoutSaved', 'Layout saved successfully'));
    } catch {
      toast.error(t('orgChart.layoutSaveError', 'Failed to save layout'));
    }
  };

  const handleFixDepartments = async () => {
    if (!orgIdToQuery || !user?.id) return;

    try {
      const result = await fixDepartments({
        organizationId: orgIdToQuery as Id<'organizations'>,
        requesterId: user.id as Id<'users'>,
      });

      if (result.fixedCount > 0) {
        toast.success(
          t('orgChart.fixDepartmentsSuccess', 'Fixed {{count}} departments', {
            count: result.fixedCount,
          }),
        );
      } else {
        toast.info(
          t('orgChart.fixDepartmentsNoChanges', 'No changes needed. Debug: {{debug}}', {
            debug: JSON.stringify(result.debug || []),
          }),
        );
      }
    } catch (e) {
      toast.error(t('orgChart.fixDepartmentsError', 'Failed to fix departments'));
      console.error('Fix departments error:', e);
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

                <Button variant="outline" size="sm" onClick={handleFixDepartments}>
                  <Users className="h-4 w-4 mr-2" />
                  {t('orgChart.fixDepartments', 'Fix Departments')}
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
