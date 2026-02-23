import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap, MessageSquare, Clock, MousePointer, ListOrdered, Tag, Calendar, Send, ArrowRightLeft, GitBranch } from 'lucide-react';

const nodeColors: Record<string, { bg: string; border: string; icon: string }> = {
  trigger_button: { bg: 'bg-amber-50', border: 'border-amber-400', icon: 'text-amber-600' },
  trigger_text: { bg: 'bg-orange-50', border: 'border-orange-400', icon: 'text-orange-600' },
  trigger_menu: { bg: 'bg-yellow-50', border: 'border-yellow-400', icon: 'text-yellow-600' },
  trigger_timeout: { bg: 'bg-red-50', border: 'border-red-400', icon: 'text-red-600' },
  action_send_message: { bg: 'bg-blue-50', border: 'border-blue-400', icon: 'text-blue-600' },
  action_tag: { bg: 'bg-purple-50', border: 'border-purple-400', icon: 'text-purple-600' },
  action_schedule: { bg: 'bg-green-50', border: 'border-green-400', icon: 'text-green-600' },
  action_move_campaign: { bg: 'bg-cyan-50', border: 'border-cyan-400', icon: 'text-cyan-600' },
  action_wait: { bg: 'bg-gray-50', border: 'border-gray-400', icon: 'text-gray-600' },
  condition: { bg: 'bg-indigo-50', border: 'border-indigo-400', icon: 'text-indigo-600' },
};

const nodeIcons: Record<string, any> = {
  trigger_button: MousePointer,
  trigger_text: MessageSquare,
  trigger_menu: ListOrdered,
  trigger_timeout: Clock,
  action_send_message: Send,
  action_tag: Tag,
  action_schedule: Calendar,
  action_move_campaign: ArrowRightLeft,
  action_wait: Clock,
  condition: GitBranch,
};

const nodeLabels: Record<string, string> = {
  trigger_button: 'Clique em Botão',
  trigger_text: 'Resposta por Texto',
  trigger_menu: 'Seleção em Menu',
  trigger_timeout: 'Tempo sem Resposta',
  action_send_message: 'Enviar Mensagem',
  action_tag: 'Adicionar Tag',
  action_schedule: 'Agendar',
  action_move_campaign: 'Mover p/ Campanha',
  action_wait: 'Aguardar',
  condition: 'Condição',
};

function AutomationNode({ data, selected }: NodeProps) {
  const nodeType = data.nodeType as string;
  const isTrigger = nodeType?.startsWith('trigger_');
  const isCondition = nodeType === 'condition';
  const colors = nodeColors[nodeType] || { bg: 'bg-muted', border: 'border-border', icon: 'text-muted-foreground' };
  const Icon = nodeIcons[nodeType] || Zap;
  const label = (data.label as string) || nodeLabels[nodeType] || 'Nó';

  return (
    <div
      className={`rounded-xl border-2 shadow-md min-w-[200px] max-w-[260px] ${colors.bg} ${colors.border} ${
        selected ? 'ring-2 ring-primary ring-offset-2' : ''
      }`}
    >
      {!isTrigger && (
        <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-primary !border-2 !border-white" />
      )}

      <div className="px-3 py-2 flex items-center gap-2 border-b border-black/5">
        <div className={`p-1.5 rounded-lg ${colors.bg} ${colors.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-700 truncate">{label}</p>
          <p className="text-[10px] text-gray-400">
            {isTrigger ? 'Gatilho' : isCondition ? 'Condicional' : 'Ação'}
          </p>
        </div>
      </div>

      {data.config && (
        <div className="px-3 py-2">
          {nodeType === 'trigger_button' && (data.config as any).buttonText && (
            <p className="text-[11px] text-gray-500">Botão: <span className="font-medium text-gray-700">"{(data.config as any).buttonText}"</span></p>
          )}
          {nodeType === 'trigger_text' && (data.config as any).keywords && (
            <p className="text-[11px] text-gray-500">Palavras: <span className="font-medium text-gray-700">{(data.config as any).keywords}</span></p>
          )}
          {nodeType === 'trigger_menu' && (data.config as any).menuOption && (
            <p className="text-[11px] text-gray-500">Opção: <span className="font-medium text-gray-700">"{(data.config as any).menuOption}"</span></p>
          )}
          {nodeType === 'trigger_timeout' && (data.config as any).minutes && (
            <p className="text-[11px] text-gray-500">Timeout: <span className="font-medium text-gray-700">{(data.config as any).minutes} min</span></p>
          )}
          {nodeType === 'action_send_message' && (data.config as any).message && (
            <p className="text-[11px] text-gray-500 line-clamp-2">"{(data.config as any).message}"</p>
          )}
          {nodeType === 'action_tag' && (data.config as any).tag && (
            <p className="text-[11px] text-gray-500">Tag: <span className="font-medium text-purple-600">{(data.config as any).tag}</span></p>
          )}
          {nodeType === 'action_wait' && (data.config as any).seconds && (
            <p className="text-[11px] text-gray-500">Esperar: <span className="font-medium text-gray-700">{(data.config as any).seconds}s</span></p>
          )}
          {nodeType === 'condition' && (data.config as any).conditionType && (
            <p className="text-[11px] text-gray-500">
              {(data.config as any).conditionType === 'has_tag' && `Tem tag: "${(data.config as any).conditionValue || ''}"`}
              {(data.config as any).conditionType === 'has_appointment' && 'Tem agendamento'}
              {(data.config as any).conditionType === 'text_contains' && `Texto contém: "${(data.config as any).conditionValue || ''}"`}
              {(data.config as any).conditionType === 'text_equals' && `Texto igual: "${(data.config as any).conditionValue || ''}"`}
            </p>
          )}
        </div>
      )}

      {isCondition ? (
        <div className="flex justify-between px-3 pb-2">
          <div className="relative flex flex-col items-center">
            <span className="text-[9px] font-bold text-green-600 mb-0.5">Sim</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="true"
              className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !relative !transform-none !left-0 !bottom-0"
            />
          </div>
          <div className="relative flex flex-col items-center">
            <span className="text-[9px] font-bold text-red-500 mb-0.5">Não</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="false"
              className="!w-3 !h-3 !bg-red-500 !border-2 !border-white !relative !transform-none !left-0 !bottom-0"
            />
          </div>
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-primary !border-2 !border-white" />
      )}
    </div>
  );
}

export const automationNodeTypes = {
  automationNode: memo(AutomationNode),
};

export { nodeLabels, nodeIcons, nodeColors };
