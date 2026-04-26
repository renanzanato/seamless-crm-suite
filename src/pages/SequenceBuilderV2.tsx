import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import type { Connection, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { ArrowLeft, Loader2, Save, BarChart3, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StepNode } from '@/components/sequence-builder/StepNode';
import { StepPalette } from '@/components/sequence-builder/StepPalette';
import { StepConfigPanel } from '@/components/sequence-builder/StepConfigPanel';
import { SequenceStats } from '@/components/sequence-builder/SequenceStats';
import {
  getStepsV2,
  upsertStepsV2,
  upsertSequenceV2,
  STEP_TYPE_LABELS,
} from '@/services/sequencesV2Service';
import type { StepType, StepV2 } from '@/services/sequencesV2Service';
import { getSequence } from '@/services/sequencesService';

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------
const nodeTypes = { stepNode: StepNode };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function stepsToFlow(steps: StepV2[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = steps.map((s, i) => ({
    id: s.id,
    type: 'stepNode',
    position: { x: 250, y: i * 140 },
    data: {
      stepType: s.step_type,
      position: s.position,
      config: s.config,
      label: STEP_TYPE_LABELS[s.step_type as StepType],
    },
  }));

  const edges: Edge[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const from = steps[i];
    const to = steps[i + 1];
    if (from.step_type === 'condition') {
      // Condition: true edge goes to next, false could go elsewhere
      edges.push({
        id: `${from.id}-true-${to.id}`,
        source: from.id,
        target: to.id,
        sourceHandle: 'true',
        label: 'Sim',
        style: { stroke: '#22c55e' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
      });
    } else {
      edges.push({
        id: `${from.id}-${to.id}`,
        source: from.id,
        target: to.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: 'hsl(var(--muted-foreground))' },
      });
    }
  }

  return { nodes, edges };
}

function flowToSteps(nodes: Node[]): Omit<StepV2, 'created_at'>[] {
  // Sort by Y position to determine order
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
  return sorted.map((n, i) => ({
    id: n.id,
    sequence_id: '', // will be set by service
    position: i,
    step_type: n.data.stepType as StepType,
    config: n.data.config as Record<string, unknown>,
  }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SequenceBuilderV2() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = !id || id === 'nova';

  const [seqName, setSeqName] = useState('Nova Sequência');
  const [seqChannel, setSeqChannel] = useState<'whatsapp' | 'email' | 'both'>('both');
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('builder');

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Load existing sequence
  const { data: existingSequence } = useQuery({
    queryKey: ['sequence', id],
    queryFn: () => getSequence(id!),
    enabled: !isNew,
  });

  const { data: existingSteps } = useQuery({
    queryKey: ['sequence-steps-v2', id],
    queryFn: () => getStepsV2(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (existingSequence) {
      setSeqName(existingSequence.name);
      setSeqChannel(existingSequence.channel ?? 'both');
    }
  }, [existingSequence]);

  useEffect(() => {
    if (existingSteps && existingSteps.length > 0) {
      const { nodes: n, edges: e } = stepsToFlow(existingSteps);
      setNodes(n);
      setEdges(e);
    }
  }, [existingSteps, setNodes, setEdges]);

  // Add step from palette
  const handleAddStep = useCallback(
    (type: StepType) => {
      const newId = `new-${crypto.randomUUID()}`;
      const maxY = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.y)) : -140;
      const newNode: Node = {
        id: newId,
        type: 'stepNode',
        position: { x: 250, y: maxY + 140 },
        data: {
          stepType: type,
          position: nodes.length,
          config: type === 'wait' ? { days: 1, business_hours_only: true } : {},
          label: STEP_TYPE_LABELS[type],
        },
      };
      setNodes((nds) => [...nds, newNode]);

      // Auto-connect to last node
      if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        const newEdge: Edge = {
          id: `${lastNode.id}-${newId}`,
          source: lastNode.id,
          target: newId,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: 'hsl(var(--muted-foreground))' },
        };
        setEdges((eds) => [...eds, newEdge]);
      }
    },
    [nodes, setNodes, setEdges],
  );

  // Select node
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedStepId(node.id);
  }, []);

  // Update config
  const handleConfigChange = useCallback(
    (stepId: string, config: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === stepId ? { ...n, data: { ...n.data, config } } : n,
        ),
      );
    },
    [setNodes],
  );

  // Delete step
  const handleDeleteStep = useCallback(
    (stepId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== stepId));
      setEdges((eds) => eds.filter((e) => e.source !== stepId && e.target !== stepId));
      if (selectedStepId === stepId) setSelectedStepId(null);
    },
    [setNodes, setEdges, selectedStepId],
  );

  // Connect nodes
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: 'hsl(var(--muted-foreground))' },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  // Save
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Upsert sequence
      const seq = await upsertSequenceV2({
        id: isNew ? undefined : id,
        name: seqName,
        channel: seqChannel,
      });

      // Upsert steps
      const steps = flowToSteps(nodes);
      await upsertStepsV2(
        seq.id,
        steps.map((s) => ({ ...s, sequence_id: seq.id })),
      );

      return seq;
    },
    onSuccess: (seq) => {
      toast.success('Sequência salva!');
      qc.invalidateQueries({ queryKey: ['sequences'] });
      if (isNew) navigate(`/sequencias-v2/${seq.id}`, { replace: true });
    },
    onError: (err) => {
      toast.error('Erro ao salvar: ' + (err as Error).message);
    },
  });

  // Selected node data
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedStepId),
    [nodes, selectedStepId],
  );

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sequencias')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={seqName}
            onChange={(e) => setSeqName(e.target.value)}
            className="text-lg font-bold border-none shadow-none h-9 w-64 px-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="builder" className="gap-1.5">
                <Workflow className="h-3.5 w-3.5" /> Builder
              </TabsTrigger>
              <TabsTrigger value="stats" className="gap-1.5" disabled={isNew}>
                <BarChart3 className="h-3.5 w-3.5" /> Stats
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'stats' && id ? (
        <SequenceStats sequenceId={id} />
      ) : (
        <div className="flex border border-border rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
          {/* Palette */}
          <StepPalette onAddStep={handleAddStep} />

          {/* Canvas */}
          <div className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} />
              <Controls />
              <MiniMap
                nodeStrokeWidth={2}
                className="!bg-muted/50"
                maskColor="rgba(0,0,0,0.1)"
              />
            </ReactFlow>
          </div>

          {/* Config panel */}
          {selectedNode && (
            <StepConfigPanel
              stepId={selectedNode.id}
              stepType={selectedNode.data.stepType as StepType}
              config={selectedNode.data.config as Record<string, unknown>}
              onConfigChange={handleConfigChange}
              onClose={() => setSelectedStepId(null)}
              onDelete={handleDeleteStep}
            />
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
