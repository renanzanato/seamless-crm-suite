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
import { PageErrorState } from '@/components/states/PageState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StepNode } from '@/components/sequence-builder/StepNode';
import { StepPalette } from '@/components/sequence-builder/StepPalette';
import { StepConfigPanel } from '@/components/sequence-builder/StepConfigPanel';
import { SequenceStats } from '@/components/sequence-builder/SequenceStats';
import { findInvalidTemplateVariables } from '@/lib/templateRenderer';
import {
  getSequenceFlow,
  upsertSequenceFlow,
  upsertSequenceV2,
  STEP_TYPE_LABELS,
} from '@/services/sequencesV2Service';
import type { StepEdgeV2, StepType, StepV2 } from '@/services/sequencesV2Service';
import { getSequence } from '@/services/sequencesService';

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------
const nodeTypes = { stepNode: StepNode };

const DEFAULT_EDGE = {
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { stroke: 'hsl(var(--muted-foreground))' },
};

const TRUE_EDGE = {
  label: 'Sim',
  style: { stroke: '#22c55e' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
};

const FALSE_EDGE = {
  label: 'Nao',
  style: { stroke: '#ef4444' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function edgePresentation(sourceHandle: string | null | undefined) {
  if (sourceHandle === 'true') return TRUE_EDGE;
  if (sourceHandle === 'false') return FALSE_EDGE;
  return DEFAULT_EDGE;
}

function decorateEdge(edge: Edge): Edge {
  return {
    ...edge,
    ...edgePresentation(edge.sourceHandle),
  };
}

function stepPosition(step: StepV2, index: number) {
  const raw = step.flow_position;
  if (
    raw
    && typeof raw.x === 'number'
    && Number.isFinite(raw.x)
    && typeof raw.y === 'number'
    && Number.isFinite(raw.y)
  ) {
    return raw;
  }
  return { x: 250, y: index * 140 };
}

function savedEdgesToFlow(edges: StepEdgeV2[], steps: StepV2[]): Edge[] {
  const stepIds = new Set(steps.map((step) => step.id));
  return edges
    .filter((edge) => stepIds.has(edge.source_step_id) && stepIds.has(edge.target_step_id))
    .map((edge) => decorateEdge({
      id: edge.id ?? `${edge.source_step_id}-${edge.source_handle ?? 'out'}-${edge.target_step_id}`,
      source: edge.source_step_id,
      target: edge.target_step_id,
      sourceHandle: edge.source_handle,
      targetHandle: edge.target_handle,
      label: edge.label ?? undefined,
      type: edge.edge_type === 'default' ? undefined : edge.edge_type,
    }));
}

function generatedLinearEdges(steps: StepV2[]): Edge[] {
  const generated: Edge[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const from = steps[i];
    const to = steps[i + 1];
    generated.push(decorateEdge({
      id: `${from.id}-${from.step_type === 'condition' ? 'true-' : ''}${to.id}`,
      source: from.id,
      target: to.id,
      sourceHandle: from.step_type === 'condition' ? 'true' : null,
    }));
  }
  return generated;
}

function stepsToFlow(steps: StepV2[], savedEdges: StepEdgeV2[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = steps.map((s, i) => ({
    id: s.id,
    type: 'stepNode',
    position: stepPosition(s, i),
    data: {
      stepType: s.step_type,
      position: s.position,
      config: s.config,
      label: STEP_TYPE_LABELS[s.step_type as StepType],
    },
  }));

  const edges = savedEdges.length > 0
    ? savedEdgesToFlow(savedEdges, steps)
    : generatedLinearEdges(steps);

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
    flow_position: {
      x: n.position.x,
      y: n.position.y,
    },
  }));
}

function flowToStepEdges(edges: Edge[]): Omit<StepEdgeV2, 'id' | 'created_at' | 'sequence_id'>[] {
  return edges
    .filter((edge) => edge.source && edge.target && edge.source !== edge.target)
    .map((edge) => ({
      source_step_id: edge.source,
      target_step_id: edge.target,
      source_handle: edge.sourceHandle ?? null,
      target_handle: edge.targetHandle ?? null,
      label: typeof edge.label === 'string' ? edge.label : null,
      edge_type: edge.type ?? 'default',
    }));
}

function invalidTemplateVariables(config: Record<string, unknown>) {
  return [
    ...findInvalidTemplateVariables(String(config.subject_template ?? '')),
    ...findInvalidTemplateVariables(String(config.body_template ?? '')),
  ];
}

function validateFlow(nodes: Node[], edges: Edge[]) {
  const errors: string[] = [];
  if (nodes.length === 0) return ['Adicione pelo menos um step antes de salvar.'];

  const nodeIds = new Set(nodes.map((node) => node.id));
  const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  if (validEdges.length !== edges.length) {
    errors.push('Existe uma conexao apontando para um step removido.');
  }

  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, 0]));
  validEdges.forEach((edge) => {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
  });

  if (nodes.length > 1) {
    const startNodes = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
    const endNodes = nodes.filter((node) => (outgoing.get(node.id) ?? 0) === 0);
    if (startNodes.length !== 1) errors.push('O fluxo precisa ter exatamente um node inicial.');
    if (endNodes.length < 1) errors.push('O fluxo precisa ter pelo menos um node final.');
    const isolated = nodes.filter((node) =>
      (incoming.get(node.id) ?? 0) === 0
      && (outgoing.get(node.id) ?? 0) === 0,
    );
    if (isolated.length > 0) errors.push('Existe node solto sem conexao.');
  }

  nodes.forEach((node) => {
    const stepType = node.data.stepType as StepType;
    const config = node.data.config as Record<string, unknown>;
    const invalidVars = invalidTemplateVariables(config);
    if (invalidVars.length > 0) {
      errors.push(`${STEP_TYPE_LABELS[stepType]} usa variavel invalida: {{${invalidVars[0]}}}.`);
    }
    if (['email_auto', 'email_manual', 'whatsapp_task'].includes(stepType)) {
      const body = typeof config.body_template === 'string' ? config.body_template.trim() : '';
      if (!body) errors.push(`${STEP_TYPE_LABELS[stepType]} precisa de template de mensagem.`);
    }
    if (stepType === 'condition') {
      const handles = new Set(validEdges.filter((edge) => edge.source === node.id).map((edge) => edge.sourceHandle));
      if (!handles.has('true') || !handles.has('false')) {
        errors.push('Toda condicao precisa ter saida Sim e Nao.');
      }
    }
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const graph = new Map<string, string[]>();
  validEdges.forEach((edge) => {
    graph.set(edge.source, [...(graph.get(edge.source) ?? []), edge.target]);
  });

  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    const hasLoop = (graph.get(nodeId) ?? []).some(visit);
    visiting.delete(nodeId);
    visited.add(nodeId);
    return hasLoop;
  }

  if (nodes.some((node) => visit(node.id))) {
    errors.push('O fluxo tem loop. Remova o ciclo antes de salvar.');
  }

  return Array.from(new Set(errors));
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
  const {
    data: existingSequence,
    isLoading: loadingSequence,
    isError: sequenceError,
    error: sequenceLoadError,
    refetch: refetchSequence,
  } = useQuery({
    queryKey: ['sequence', id],
    queryFn: () => getSequence(id!),
    enabled: !isNew,
  });

  const {
    data: existingFlow,
    isLoading: loadingFlow,
    isError: flowError,
    error: flowLoadError,
    refetch: refetchFlow,
  } = useQuery({
    queryKey: ['sequence-flow-v2', id],
    queryFn: () => getSequenceFlow(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (existingSequence) {
      setSeqName(existingSequence.name);
      setSeqChannel(existingSequence.channel ?? 'both');
    }
  }, [existingSequence]);

  useEffect(() => {
    if (existingFlow && existingFlow.steps.length > 0) {
      const { nodes: n, edges: e } = stepsToFlow(existingFlow.steps, existingFlow.edges);
      setNodes(n);
      setEdges(e);
    }
  }, [existingFlow, setNodes, setEdges]);

  // Add step from palette
  const handleAddStep = useCallback(
    (type: StepType) => {
      const newId = crypto.randomUUID();
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
          ...DEFAULT_EDGE,
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
      if (!connection.source || !connection.target) return;
      setEdges((eds) =>
        addEdge(
          decorateEdge({
            id: `${connection.source}-${connection.sourceHandle ?? 'out'}-${connection.target}`,
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
          }),
          eds,
        ),
      );
    },
    [setEdges],
  );

  // Save
  const saveMutation = useMutation({
    mutationFn: async () => {
      const validationErrors = validateFlow(nodes, edges);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      // Upsert sequence
      const seq = await upsertSequenceV2({
        id: isNew ? undefined : id,
        name: seqName,
        channel: seqChannel,
      });

      // Upsert steps
      const steps = flowToSteps(nodes);
      await upsertSequenceFlow(
        seq.id,
        steps.map((s) => ({ ...s, sequence_id: seq.id })),
        flowToStepEdges(edges),
      );

      return seq;
    },
    onSuccess: (seq) => {
      toast.success('Sequência salva!');
      qc.invalidateQueries({ queryKey: ['sequences'] });
      qc.invalidateQueries({ queryKey: ['sequence-flow-v2', seq.id] });
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

  const loadError = sequenceError ? sequenceLoadError : flowError ? flowLoadError : null;

  if (!isNew && loadError) {
    return (
      <DashboardLayout>
        <PageErrorState
          title="Nao foi possivel abrir a sequencia"
          description={(loadError as Error).message}
          onRetry={() => {
            void refetchSequence();
            void refetchFlow();
          }}
        />
      </DashboardLayout>
    );
  }

  if (!isNew && (loadingSequence || loadingFlow)) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando sequencia...
        </div>
      </DashboardLayout>
    );
  }

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
