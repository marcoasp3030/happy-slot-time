import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import type { Node } from '@xyflow/react';

interface NodeConfigPanelProps {
  node: Node | null;
  onUpdate: (nodeId: string, config: Record<string, any>) => void;
  onClose: () => void;
  campaigns: { id: string; name: string }[];
}

export default function NodeConfigPanel({ node, onUpdate, onClose, campaigns }: NodeConfigPanelProps) {
  const [config, setConfig] = useState<Record<string, any>>({});

  useEffect(() => {
    if (node?.data?.config) {
      setConfig(node.data.config as Record<string, any>);
    } else {
      setConfig({});
    }
  }, [node?.id]);

  if (!node) return null;

  const nodeType = node.data.nodeType as string;

  const update = (key: string, value: any) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    onUpdate(node.id, next);
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-background border-l border-border shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Configurar Nó</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <Label className="text-xs">Nome do nó</Label>
          <Input
            value={(node.data.label as string) || ''}
            onChange={(e) => onUpdate(node.id, { ...config, __label: e.target.value })}
            placeholder="Nome personalizado"
            className="mt-1"
          />
        </div>

        {/* Trigger: Button click */}
        {nodeType === 'trigger_button' && (
          <div>
            <Label className="text-xs">Texto do botão que ativa</Label>
            <Input
              value={config.buttonText || ''}
              onChange={(e) => update('buttonText', e.target.value)}
              placeholder="Ex: Sim, Quero agendar"
              className="mt-1"
            />
          </div>
        )}

        {/* Trigger: Text keyword */}
        {nodeType === 'trigger_text' && (
          <div>
            <Label className="text-xs">Palavras-chave (separar por vírgula)</Label>
            <Input
              value={config.keywords || ''}
              onChange={(e) => update('keywords', e.target.value)}
              placeholder="sim, quero, aceito"
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Qualquer uma dessas palavras ativa o gatilho</p>
          </div>
        )}

        {/* Trigger: Menu selection */}
        {nodeType === 'trigger_menu' && (
          <div>
            <Label className="text-xs">ID ou texto da opção do menu</Label>
            <Input
              value={config.menuOption || ''}
              onChange={(e) => update('menuOption', e.target.value)}
              placeholder="Ex: opcao_1"
              className="mt-1"
            />
          </div>
        )}

        {/* Trigger: Timeout */}
        {nodeType === 'trigger_timeout' && (
          <div>
            <Label className="text-xs">Minutos sem resposta</Label>
            <Input
              type="number"
              value={config.minutes || 30}
              onChange={(e) => update('minutes', parseInt(e.target.value) || 30)}
              className="mt-1"
            />
          </div>
        )}

        {/* Action: Send message */}
        {nodeType === 'action_send_message' && (
          <>
            <div>
              <Label className="text-xs">Tipo de mensagem</Label>
              <Select value={config.msgType || 'text'} onValueChange={(v) => update('msgType', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto simples</SelectItem>
                  <SelectItem value="button">Com botões</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                value={config.message || ''}
                onChange={(e) => update('message', e.target.value)}
                placeholder="Olá {{nome}}, obrigado pela resposta!"
                className="mt-1 min-h-[80px]"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Use {'{{nome}}'} para personalizar</p>
            </div>
            {config.msgType === 'button' && (
              <div>
                <Label className="text-xs">Botões (um por linha)</Label>
                <Textarea
                  value={config.buttons || ''}
                  onChange={(e) => update('buttons', e.target.value)}
                  placeholder={'Confirmar\nCancelar'}
                  className="mt-1 min-h-[60px]"
                />
              </div>
            )}
          </>
        )}

        {/* Action: Tag */}
        {nodeType === 'action_tag' && (
          <div>
            <Label className="text-xs">Nome da tag</Label>
            <Input
              value={config.tag || ''}
              onChange={(e) => update('tag', e.target.value)}
              placeholder="Ex: interessado, vip, cancelado"
              className="mt-1"
            />
          </div>
        )}

        {/* Action: Schedule */}
        {nodeType === 'action_schedule' && (
          <div>
            <Label className="text-xs">Ação de agendamento</Label>
            <Select value={config.scheduleAction || 'send_link'} onValueChange={(v) => update('scheduleAction', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="send_link">Enviar link de agendamento</SelectItem>
                <SelectItem value="auto_schedule">Agendar próximo horário livre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Action: Move campaign */}
        {nodeType === 'action_move_campaign' && (
          <div>
            <Label className="text-xs">Campanha destino</Label>
            <Select value={config.targetCampaignId || ''} onValueChange={(v) => update('targetCampaignId', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar campanha" /></SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Action: Wait */}
        {nodeType === 'action_wait' && (
          <div>
            <Label className="text-xs">Segundos de espera</Label>
            <Input
              type="number"
              value={config.seconds || 5}
              onChange={(e) => update('seconds', parseInt(e.target.value) || 5)}
              className="mt-1"
            />
          </div>
        )}

        {/* Condition */}
        {nodeType === 'condition' && (
          <>
            <div>
              <Label className="text-xs">Tipo de condição</Label>
              <Select value={config.conditionType || 'has_tag'} onValueChange={(v) => update('conditionType', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="has_tag">Contato tem tag</SelectItem>
                  <SelectItem value="has_appointment">Contato tem agendamento</SelectItem>
                  <SelectItem value="text_contains">Texto contém</SelectItem>
                  <SelectItem value="text_equals">Texto igual a</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(config.conditionType === 'has_tag' || config.conditionType === 'text_contains' || config.conditionType === 'text_equals' || !config.conditionType) && (
              <div>
                <Label className="text-xs">
                  {config.conditionType === 'text_contains' ? 'Texto a buscar' : config.conditionType === 'text_equals' ? 'Texto esperado' : 'Nome da tag'}
                </Label>
                <Input
                  value={config.conditionValue || ''}
                  onChange={(e) => update('conditionValue', e.target.value)}
                  placeholder={config.conditionType === 'text_contains' || config.conditionType === 'text_equals' ? 'Ex: sim' : 'Ex: vip'}
                  className="mt-1"
                />
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Saída <span className="font-bold text-green-600">Sim</span> se a condição for verdadeira, <span className="font-bold text-red-500">Não</span> caso contrário.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
