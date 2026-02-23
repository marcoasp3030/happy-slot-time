import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Plus, Save, ArrowLeft, Trash2, MousePointer, MessageSquare, ListOrdered, Clock,
  Send, Tag, Calendar, ArrowRightLeft, Zap, Activity, Eye, GitBranch,
} from 'lucide-react';
import { automationNodeTypes, nodeLabels, nodeIcons } from '@/components/automation/AutomationNodeTypes';
import NodeConfigPanel from '@/components/automation/NodeConfigPanel';

const triggerPalette = [
  { type: 'trigger_button', label: 'Clique em Botão', icon: MousePointer },
  { type: 'trigger_text', label: 'Resposta por Texto', icon: MessageSquare },
  { type: 'trigger_menu', label: 'Seleção em Menu', icon: ListOrdered },
  { type: 'trigger_timeout', label: 'Tempo sem Resposta', icon: Clock },
];

const actionPalette = [
  { type: 'action_send_message', label: 'Enviar Mensagem', icon: Send },
  { type: 'action_tag', label: 'Adicionar Tag', icon: Tag },
  { type: 'action_schedule', label: 'Agendar', icon: Calendar },
  { type: 'action_move_campaign', label: 'Mover p/ Campanha', icon: ArrowRightLeft },
  { type: 'action_wait', label: 'Aguardar', icon: Clock },
];

const conditionPalette = [
  { type: 'condition', label: 'Condição', icon: GitBranch },
];

let nodeIdCounter = 0;

export default function Automations() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();
  const [editingFlow, setEditingFlow] = useState<any | null>(null);
  const [flowName, setFlowName] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Fetch flows
  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['automation-flows', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from('automation_flows')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!companyId,
  });

  // Fetch campaigns for action config
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns-list', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from('mass_campaigns')
        .select('id, name')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!companyId,
  });

  // Fetch automation logs
  const { data: logs = [] } = useQuery({
    queryKey: ['automation-logs', showLogs],
    queryFn: async () => {
      if (!showLogs) return [];
      const { data } = await supabase
        .from('automation_logs')
        .select('*')
        .eq('flow_id', showLogs)
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!showLogs,
  });

  // Save flow
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('Sem empresa');
      const flowData = {
        company_id: companyId,
        name: flowName || 'Automação sem nome',
        nodes: nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
      };

      if (editingFlow?.id) {
        const { error } = await supabase
          .from('automation_flows')
          .update(flowData)
          .eq('id', editingFlow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('automation_flows')
          .insert(flowData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Automação salva!');
      queryClient.invalidateQueries({ queryKey: ['automation-flows'] });
      setEditingFlow(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('automation_flows')
        .update({ active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-flows'] });
      toast.success('Status atualizado');
    },
  });

  // Delete flow
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automation_flows').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-flows'] });
      toast.success('Automação removida');
    },
  });

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: { stroke: 'hsl(var(--primary))' } }, eds)
      ),
    [setEdges]
  );

  const addNode = (nodeType: string) => {
    const id = `node_${Date.now()}_${nodeIdCounter++}`;
    const newNode: Node = {
      id,
      type: 'automationNode',
      position: { x: 250 + Math.random() * 200, y: 100 + nodes.length * 120 },
      data: {
        label: nodeLabels[nodeType],
        nodeType,
        config: {},
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const updateNodeConfig = (nodeId: string, config: Record<string, any>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const label = config.__label || n.data.label;
        const { __label, ...rest } = config;
        return { ...n, data: { ...n.data, label, config: rest } };
      })
    );
  };

  const openEditor = (flow?: any) => {
    if (flow) {
      setEditingFlow(flow);
      setFlowName(flow.name);
      const savedNodes = (flow.nodes || []).map((n: any) => ({
        ...n,
        type: 'automationNode',
      }));
      const savedEdges = (flow.edges || []).map((e: any) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: true,
        style: { stroke: 'hsl(var(--primary))' },
      }));
      setNodes(savedNodes);
      setEdges(savedEdges);
    } else {
      setEditingFlow({});
      setFlowName('');
      setNodes([]);
      setEdges([]);
    }
    setSelectedNode(null);
  };

  const deleteSelectedNodes = () => {
    const selectedIds = nodes.filter(n => n.selected).map(n => n.id);
    if (selectedIds.length === 0) return;
    setNodes(nds => nds.filter(n => !selectedIds.includes(n.id)));
    setEdges(eds => eds.filter(e => !selectedIds.includes(e.source) && !selectedIds.includes(e.target)));
    setSelectedNode(null);
  };

  // Editor view
  if (editingFlow) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-8rem)] flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setEditingFlow(null)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              placeholder="Nome da automação"
              className="max-w-xs h-9"
            />
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
            <Button variant="destructive" size="sm" onClick={deleteSelectedNodes}>
              <Trash2 className="h-4 w-4 mr-1" /> Remover selecionado
            </Button>
          </div>

          <div className="flex-1 relative border rounded-xl overflow-hidden bg-muted/30" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={automationNodeTypes}
              onNodeClick={(_, node) => setSelectedNode(node)}
              onPaneClick={() => setSelectedNode(null)}
              fitView
              deleteKeyCode="Delete"
              snapToGrid
              snapGrid={[15, 15]}
            >
              <Controls />
              <MiniMap
                nodeColor={() => 'hsl(var(--primary))'}
                className="!bg-background !border-border"
              />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />

              {/* Node palette */}
              <Panel position="top-left" className="!m-2">
                <div className="bg-background/95 backdrop-blur border rounded-xl p-3 shadow-lg max-w-[200px] space-y-3">
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">Gatilhos</p>
                  <div className="space-y-1">
                    {triggerPalette.map((item) => (
                      <button
                        key={item.type}
                        onClick={() => addNode(item.type)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-50 hover:text-amber-700 transition-colors text-left"
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">Ações</p>
                  <div className="space-y-1">
                    {actionPalette.map((item) => (
                      <button
                        key={item.type}
                        onClick={() => addNode(item.type)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-50 hover:text-blue-700 transition-colors text-left"
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">Lógica</p>
                  <div className="space-y-1">
                    {conditionPalette.map((item) => (
                      <button
                        key={item.type}
                        onClick={() => addNode(item.type)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left"
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Panel>
            </ReactFlow>

            {/* Config panel */}
            {selectedNode && (
              <NodeConfigPanel
                node={selectedNode}
                onUpdate={updateNodeConfig}
                onClose={() => setSelectedNode(null)}
                campaigns={campaigns}
              />
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // List view
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Automações</h1>
            <p className="text-sm text-muted-foreground">
              Crie fluxos automáticos com gatilhos e ações visuais
            </p>
          </div>
          <Button onClick={() => openEditor()}>
            <Plus className="h-4 w-4 mr-2" /> Nova Automação
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : flows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Nenhuma automação criada ainda</p>
              <Button className="mt-4" onClick={() => openEditor()}>
                <Plus className="h-4 w-4 mr-2" /> Criar primeira automação
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {flows.map((flow: any) => (
              <Card key={flow.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4 flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{flow.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={flow.active ? 'default' : 'secondary'} className="text-[10px]">
                        {flow.active ? 'Ativa' : 'Inativa'}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {(flow.nodes || []).length} nós · {(flow.edges || []).length} conexões
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={flow.active}
                      onCheckedChange={(active) => toggleMutation.mutate({ id: flow.id, active })}
                    />
                    <Button variant="outline" size="sm" onClick={() => setShowLogs(flow.id)}>
                      <Activity className="h-3.5 w-3.5 mr-1" /> Logs
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEditor(flow)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(flow.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Logs Dialog */}
        <Dialog open={!!showLogs} onOpenChange={(o) => !o && setShowLogs(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Logs de Execução</DialogTitle>
            </DialogHeader>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma execução registrada ainda</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log: any) => (
                  <div key={log.id} className="border rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{log.contact_name || log.contact_phone}</span>
                      <Badge variant={log.status === 'executed' ? 'default' : 'destructive'} className="text-[10px]">
                        {log.status === 'executed' ? 'Executado' : 'Erro'}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">
                      Gatilho: <span className="font-medium">{log.trigger_type}</span>
                      {log.trigger_value && <> → "{log.trigger_value}"</>}
                    </p>
                    <p className="text-muted-foreground">
                      Ação: <span className="font-medium">{log.action_type}</span>
                    </p>
                    {log.error_message && (
                      <p className="text-destructive">Erro: {log.error_message}</p>
                    )}
                    <p className="text-muted-foreground/60">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
