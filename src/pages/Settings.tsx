import { useEffect, useMemo, useState } from "react";
import type { ElementType, FormEvent, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Database,
  FileText,
  GripVertical,
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  MESSAGE_TEMPLATE_CHANNELS,
  SETTINGS_ROLES,
  createCustomField,
  createMessageTemplate,
  deleteCustomField,
  deleteMessageTemplate,
  extractTemplateVariables,
  inviteProfile,
  listCustomFields,
  listMessageTemplates,
  listProfiles,
  renderTemplatePreview,
  reorderCustomFields,
  updateCustomField,
  updateMessageTemplate,
  updateProfileActive,
  updateProfileRole,
  type CustomField,
  type CustomFieldEntity,
  type CustomFieldType,
  type MessageTemplate,
  type MessageTemplateChannel,
  type SettingsProfile,
  type SettingsRole,
} from "@/services/settingsService";
import {
  createFunnel,
  createStage,
  deleteFunnel,
  deleteStage,
  getFunnels,
  getStages,
  reorderStages,
  updateFunnel,
  updateStage,
  type Funnel,
  type Stage,
} from "@/services/funnelService";

type SettingsTab = "users" | "pipelines" | "custom-fields" | "templates";

const SETTINGS_TABS: { value: SettingsTab; label: string; icon: ElementType; adminOnly?: boolean }[] = [
  { value: "users", label: "Usuarios", icon: Users, adminOnly: true },
  { value: "pipelines", label: "Pipelines", icon: Workflow, adminOnly: true },
  { value: "custom-fields", label: "Custom fields", icon: Database, adminOnly: true },
  { value: "templates", label: "Templates", icon: MessageSquare },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  rep: "Rep",
  viewer: "Viewer",
  user: "User legado",
  sales: "Sales legado",
};

const ENTITY_LABEL: Record<CustomFieldEntity, string> = {
  contacts: "Contatos",
  companies: "Empresas",
  deals: "Negocios",
};

const FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Texto",
  number: "Numero",
  date: "Data",
  enum: "Lista",
  boolean: "Booleano",
};

const CHANNEL_LABEL: Record<MessageTemplateChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  linkedin: "LinkedIn",
};

const DUMMY_TEMPLATE_DATA = {
  nome: "Renan",
  empresa: "Pipa Driven",
  cargo: "Diretor Comercial",
  cidade: "Sao Paulo",
  produto: "CRM Pipa Driven",
};

function getHashTab(): SettingsTab {
  const value = window.location.hash.replace("#", "") as SettingsTab;
  return SETTINGS_TABS.some((tab) => tab.value === value) ? value : "users";
}

function splitOptions(value: string): string[] {
  return value
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

function AdminGate({ isAdmin, children }: { isAdmin: boolean; children: ReactNode }) {
  if (isAdmin) return <>{children}</>;

  return (
    <Card>
      <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold">Area restrita a admins</p>
          <p className="text-sm text-muted-foreground">Seu perfil pode usar templates, mas nao alterar configuracoes globais.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function UsersSection({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<SettingsRole>("rep");

  const profilesQuery = useQuery({
    queryKey: ["settings", "profiles"],
    queryFn: listProfiles,
    enabled: isAdmin,
  });

  const inviteMutation = useMutation({
    mutationFn: inviteProfile,
    onSuccess: () => {
      toast.success("Convite registrado em profiles.");
      setInviteName("");
      setInviteEmail("");
      setInviteRole("rep");
      queryClient.invalidateQueries({ queryKey: ["settings", "profiles"] });
    },
    onError: (error) => toast.error(`Nao foi possivel convidar: ${(error as Error).message}`),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: SettingsRole }) => updateProfileRole(id, role),
    onSuccess: () => {
      toast.success("Role atualizado.");
      queryClient.invalidateQueries({ queryKey: ["settings", "profiles"] });
    },
    onError: (error) => toast.error(`Nao foi possivel atualizar role: ${(error as Error).message}`),
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateProfileActive(id, isActive),
    onSuccess: () => {
      toast.success("Status do usuario atualizado.");
      queryClient.invalidateQueries({ queryKey: ["settings", "profiles"] });
    },
    onError: (error) => toast.error(`Nao foi possivel atualizar status: ${(error as Error).message}`),
  });

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      toast.warning("Informe o email do usuario.");
      return;
    }
    inviteMutation.mutate({ name: inviteName, email: inviteEmail, role: inviteRole });
  }

  return (
    <AdminGate isAdmin={isAdmin}>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Gestao de usuarios
            </CardTitle>
            <CardDescription>Roles, status e usuarios pendentes ficam centralizados aqui.</CardDescription>
          </CardHeader>
          <CardContent>
            {profilesQuery.isLoading ? (
              <SettingsSkeleton />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(profilesQuery.data ?? []).map((profile: SettingsProfile) => {
                    const roleValue = SETTINGS_ROLES.includes(profile.role as SettingsRole)
                      ? (profile.role as SettingsRole)
                      : "rep";

                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{profile.name ?? "Sem nome"}</p>
                            <p className="text-xs text-muted-foreground">{profile.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{profile.email ?? "-"}</TableCell>
                        <TableCell>
                          <Select
                            value={roleValue}
                            onValueChange={(value) =>
                              roleMutation.mutate({ id: profile.id, role: value as SettingsRole })
                            }
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SETTINGS_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {ROLE_LABEL[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {profile.role === "user" ? (
                            <Badge variant="secondary" className="mt-2">
                              User legado
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={profile.is_active !== false}
                              onCheckedChange={(checked) =>
                                activeMutation.mutate({ id: profile.id, isActive: checked })
                              }
                            />
                            <span className="text-sm text-muted-foreground">
                              {profile.is_active === false ? "Inativo" : "Ativo"}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" />
              Invite user
            </CardTitle>
            <CardDescription>Cria um registro em profiles para ativacao no primeiro login.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name">Nome</Label>
                <Input id="invite-name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as SettingsRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SETTINGS_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full gap-2" disabled={inviteMutation.isPending}>
                <UserPlus className="h-4 w-4" />
                Registrar convite
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminGate>
  );
}

function SortableStageRow({
  stage,
  index,
  onSave,
  onDelete,
}: {
  stage: Stage;
  index: number;
  onSave: (stage: Stage, name: string, color: string | null) => void;
  onDelete: (stage: Stage) => void;
}) {
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color ?? "#2563eb");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });

  useEffect(() => {
    setName(stage.name);
    setColor(stage.color ?? "#2563eb");
  }, [stage.name, stage.color]);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex flex-col gap-3 rounded-lg border bg-background p-3 md:flex-row md:items-center"
    >
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
        aria-label="Arrastar stage"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="grid flex-1 gap-3 md:grid-cols-[1fr_120px_auto] md:items-center">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Stage {index + 1}</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Cor</Label>
          <Input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-10 p-1"
          />
        </div>
        <div className="flex items-end gap-1">
          <Button type="button" variant="outline" size="icon" onClick={() => onSave(stage, name, color)}>
            <Save className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(stage)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PipelinesSection({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [newFunnelName, setNewFunnelName] = useState("");
  const [selectedFunnelName, setSelectedFunnelName] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#2563eb");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const funnelsQuery = useQuery({
    queryKey: ["settings", "funnels"],
    queryFn: getFunnels,
    enabled: isAdmin,
  });

  const funnels = useMemo(() => funnelsQuery.data ?? [], [funnelsQuery.data]);
  const selectedFunnel = funnels.find((funnel) => funnel.id === selectedFunnelId) ?? funnels[0] ?? null;

  const stagesQuery = useQuery({
    queryKey: ["settings", "stages", selectedFunnel?.id],
    queryFn: () => getStages(selectedFunnel?.id ?? ""),
    enabled: isAdmin && !!selectedFunnel?.id,
  });

  const stages = stagesQuery.data ?? [];

  useEffect(() => {
    if (!selectedFunnelId && funnels.length > 0) setSelectedFunnelId(funnels[0].id);
  }, [funnels, selectedFunnelId]);

  useEffect(() => {
    setSelectedFunnelName(selectedFunnel?.name ?? "");
  }, [selectedFunnel?.name]);

  const createFunnelMutation = useMutation({
    mutationFn: createFunnel,
    onSuccess: (funnel) => {
      toast.success("Pipeline criado.");
      setNewFunnelName("");
      setSelectedFunnelId(funnel.id);
      queryClient.invalidateQueries({ queryKey: ["settings", "funnels"] });
    },
    onError: (error) => toast.error(`Nao foi possivel criar pipeline: ${(error as Error).message}`),
  });

  const updateFunnelMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateFunnel(id, name),
    onSuccess: () => {
      toast.success("Pipeline atualizado.");
      queryClient.invalidateQueries({ queryKey: ["settings", "funnels"] });
    },
    onError: (error) => toast.error(`Nao foi possivel atualizar pipeline: ${(error as Error).message}`),
  });

  const deleteFunnelMutation = useMutation({
    mutationFn: deleteFunnel,
    onSuccess: () => {
      toast.success("Pipeline removido.");
      setSelectedFunnelId(null);
      queryClient.invalidateQueries({ queryKey: ["settings", "funnels"] });
    },
    onError: (error) => toast.error(`Nao foi possivel remover pipeline: ${(error as Error).message}`),
  });

  const createStageMutation = useMutation({
    mutationFn: ({ funnelId, name, order, color }: { funnelId: string; name: string; order: number; color: string }) =>
      createStage(funnelId, name, order, color),
    onSuccess: () => {
      toast.success("Stage criado.");
      setNewStageName("");
      queryClient.invalidateQueries({ queryKey: ["settings", "stages", selectedFunnel?.id] });
    },
    onError: (error) => toast.error(`Nao foi possivel criar stage: ${(error as Error).message}`),
  });

  const updateStageMutation = useMutation({
    mutationFn: ({ stage, name, color }: { stage: Stage; name: string; color: string | null }) =>
      updateStage(stage.id, name, stage.order, color),
    onSuccess: () => {
      toast.success("Stage atualizado.");
      queryClient.invalidateQueries({ queryKey: ["settings", "stages", selectedFunnel?.id] });
    },
    onError: (error) => toast.error(`Nao foi possivel atualizar stage: ${(error as Error).message}`),
  });

  const deleteStageMutation = useMutation({
    mutationFn: deleteStage,
    onSuccess: () => {
      toast.success("Stage removido.");
      queryClient.invalidateQueries({ queryKey: ["settings", "stages", selectedFunnel?.id] });
    },
    onError: (error) => toast.error(`Nao foi possivel remover stage: ${(error as Error).message}`),
  });

  const reorderStageMutation = useMutation({
    mutationFn: reorderStages,
    onError: (error) => toast.error(`Nao foi possivel reordenar stages: ${(error as Error).message}`),
  });

  function handleCreateFunnel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newFunnelName.trim()) return;
    createFunnelMutation.mutate(newFunnelName.trim());
  }

  function handleSaveFunnel() {
    if (!selectedFunnel || !selectedFunnelName.trim()) return;
    updateFunnelMutation.mutate({ id: selectedFunnel.id, name: selectedFunnelName.trim() });
  }

  function handleCreateStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFunnel || !newStageName.trim()) return;
    createStageMutation.mutate({
      funnelId: selectedFunnel.id,
      name: newStageName.trim(),
      order: stages.length,
      color: newStageColor,
    });
  }

  function handleStageDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedFunnel) return;

    const oldIndex = stages.findIndex((stage) => stage.id === active.id);
    const newIndex = stages.findIndex((stage) => stage.id === over.id);
    const nextStages = arrayMove(stages, oldIndex, newIndex).map((stage, index) => ({ ...stage, order: index }));
    queryClient.setQueryData(["settings", "stages", selectedFunnel.id], nextStages);
    reorderStageMutation.mutate(nextStages.map((stage) => stage.id));
  }

  return (
    <AdminGate isAdmin={isAdmin}>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Workflow className="h-5 w-5" />
              Pipelines
            </CardTitle>
            <CardDescription>Funis disponiveis para deals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleCreateFunnel} className="flex gap-2">
              <Input
                value={newFunnelName}
                onChange={(event) => setNewFunnelName(event.target.value)}
                placeholder="Novo pipeline"
              />
              <Button type="submit" size="icon" disabled={createFunnelMutation.isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </form>

            {funnelsQuery.isLoading ? (
              <SettingsSkeleton />
            ) : (
              <div className="space-y-2">
                {funnels.map((funnel: Funnel) => (
                  <button
                    key={funnel.id}
                    type="button"
                    onClick={() => setSelectedFunnelId(funnel.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                      selectedFunnel?.id === funnel.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">{funnel.name}</span>
                    <Badge variant="secondary">{funnel.id.slice(0, 6)}</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5" />
              Stages do pipeline
            </CardTitle>
            <CardDescription>Arraste para reordenar e ajuste nomes ou cores.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedFunnel ? (
              <>
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="selected-funnel-name">Nome do pipeline</Label>
                    <Input
                      id="selected-funnel-name"
                      value={selectedFunnelName}
                      onChange={(event) => setSelectedFunnelName(event.target.value)}
                    />
                  </div>
                  <Button type="button" variant="outline" className="gap-2" onClick={handleSaveFunnel}>
                    <Save className="h-4 w-4" />
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="gap-2"
                    onClick={() => deleteFunnelMutation.mutate(selectedFunnel.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </Button>
                </div>

                <Separator />

                <form onSubmit={handleCreateStage} className="grid gap-3 md:grid-cols-[1fr_120px_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="new-stage-name">Novo stage</Label>
                    <Input
                      id="new-stage-name"
                      value={newStageName}
                      onChange={(event) => setNewStageName(event.target.value)}
                      placeholder="Ex.: Proposta"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-stage-color">Cor</Label>
                    <Input
                      id="new-stage-color"
                      type="color"
                      value={newStageColor}
                      onChange={(event) => setNewStageColor(event.target.value)}
                      className="h-10 p-1"
                    />
                  </div>
                  <Button type="submit" className="gap-2" disabled={createStageMutation.isPending}>
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </form>

                {stagesQuery.isLoading ? (
                  <SettingsSkeleton />
                ) : stages.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Nenhum stage cadastrado para este pipeline.
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStageDragEnd}>
                    <SortableContext items={stages.map((stage) => stage.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {stages.map((stage, index) => (
                          <SortableStageRow
                            key={stage.id}
                            stage={stage}
                            index={index}
                            onSave={(item, name, color) => updateStageMutation.mutate({ stage: item, name, color })}
                            onDelete={(item) => deleteStageMutation.mutate(item.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Crie ou selecione um pipeline para editar stages.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGate>
  );
}

function CustomFieldRow({
  field,
  onSave,
  onDelete,
  onMove,
}: {
  field: CustomField;
  onSave: (id: string, input: { field_name: string; field_type: CustomFieldType; options: string[]; is_required: boolean }) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  const [fieldName, setFieldName] = useState(field.field_name);
  const [fieldType, setFieldType] = useState<CustomFieldType>(field.field_type);
  const [options, setOptions] = useState(field.options.join(", "));
  const [isRequired, setIsRequired] = useState(field.is_required);

  useEffect(() => {
    setFieldName(field.field_name);
    setFieldType(field.field_type);
    setOptions(field.options.join(", "));
    setIsRequired(field.is_required);
  }, [field]);

  return (
    <TableRow>
      <TableCell>
        <Input value={fieldName} onChange={(event) => setFieldName(event.target.value)} />
      </TableCell>
      <TableCell>
        <Select value={fieldType} onValueChange={(value) => setFieldType(value as CustomFieldType)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUSTOM_FIELD_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {FIELD_TYPE_LABEL[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          value={options}
          onChange={(event) => setOptions(event.target.value)}
          disabled={fieldType !== "enum"}
          placeholder="opcao A, opcao B"
        />
      </TableCell>
      <TableCell>
        <Switch checked={isRequired} onCheckedChange={setIsRequired} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button type="button" variant="outline" size="icon" onClick={() => onMove(field.id, "up")}>
            <span className="sr-only">Subir</span>
            <GripVertical className="h-4 w-4 rotate-90" />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => onMove(field.id, "down")}>
            <span className="sr-only">Descer</span>
            <GripVertical className="h-4 w-4 -rotate-90" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() =>
              onSave(field.id, {
                field_name: fieldName,
                field_type: fieldType,
                options: fieldType === "enum" ? splitOptions(options) : [],
                is_required: isRequired,
              })
            }
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(field.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CustomFieldsSection({ isAdmin, userId }: { isAdmin: boolean; userId?: string }) {
  const queryClient = useQueryClient();
  const [entity, setEntity] = useState<CustomFieldEntity>("contacts");
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");
  const [isRequired, setIsRequired] = useState(false);

  const fieldsQuery = useQuery({
    queryKey: ["settings", "custom-fields", entity],
    queryFn: () => listCustomFields(entity),
    enabled: isAdmin,
  });

  const fields = fieldsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createCustomField,
    onSuccess: () => {
      toast.success("Custom field criado.");
      setFieldName("");
      setFieldType("text");
      setOptions("");
      setIsRequired(false);
      queryClient.invalidateQueries({ queryKey: ["settings", "custom-fields", entity] });
    },
    onError: (error) => toast.error(`Nao foi possivel criar field: ${(error as Error).message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { field_name: string; field_type: CustomFieldType; options: string[]; is_required: boolean };
    }) => updateCustomField(id, input),
    onSuccess: () => {
      toast.success("Custom field atualizado.");
      queryClient.invalidateQueries({ queryKey: ["settings", "custom-fields", entity] });
    },
    onError: (error) => toast.error(`Nao foi possivel atualizar field: ${(error as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomField,
    onSuccess: () => {
      toast.success("Custom field removido.");
      queryClient.invalidateQueries({ queryKey: ["settings", "custom-fields", entity] });
    },
    onError: (error) => toast.error(`Nao foi possivel remover field: ${(error as Error).message}`),
  });

  const reorderMutation = useMutation({
    mutationFn: reorderCustomFields,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "custom-fields", entity] }),
    onError: (error) => toast.error(`Nao foi possivel reordenar fields: ${(error as Error).message}`),
  });

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fieldName.trim()) {
      toast.warning("Informe o nome do campo.");
      return;
    }

    createMutation.mutate({
      entity,
      field_name: fieldName,
      field_type: fieldType,
      options: fieldType === "enum" ? splitOptions(options) : [],
      is_required: isRequired,
      order: fields.length,
      created_by: userId ?? null,
    });
  }

  function handleMove(id: string, direction: "up" | "down") {
    const index = fields.findIndex((field) => field.id === id);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= fields.length) return;
    const next = arrayMove(fields, index, nextIndex);
    queryClient.setQueryData(["settings", "custom-fields", entity], next.map((field, order) => ({ ...field, order })));
    reorderMutation.mutate(next.map((field) => field.id));
  }

  return (
    <AdminGate isAdmin={isAdmin}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5" />
              Custom fields
            </CardTitle>
            <CardDescription>Campos extras entram em custom_data de contacts, companies e deals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {CUSTOM_FIELD_ENTITIES.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={entity === item ? "default" : "outline"}
                  onClick={() => setEntity(item)}
                >
                  {ENTITY_LABEL[item]}
                </Button>
              ))}
            </div>

            <form onSubmit={handleCreate} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_160px_1fr_auto_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="field-name">Nome</Label>
                <Input id="field-name" value={fieldName} onChange={(event) => setFieldName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={fieldType} onValueChange={(value) => setFieldType(value as CustomFieldType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_FIELD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {FIELD_TYPE_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="field-options">Opcoes</Label>
                <Input
                  id="field-options"
                  value={options}
                  onChange={(event) => setOptions(event.target.value)}
                  disabled={fieldType !== "enum"}
                  placeholder="A, B, C"
                />
              </div>
              <div className="space-y-2">
                <Label>Obrigatorio</Label>
                <div className="flex h-10 items-center">
                  <Switch checked={isRequired} onCheckedChange={setIsRequired} />
                </div>
              </div>
              <Button type="submit" className="gap-2" disabled={createMutation.isPending}>
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </form>

            {fieldsQuery.isLoading ? (
              <SettingsSkeleton />
            ) : fields.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum campo customizado para {ENTITY_LABEL[entity].toLowerCase()}.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Opcoes</TableHead>
                    <TableHead>Obrigatorio</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field) => (
                    <CustomFieldRow
                      key={field.id}
                      field={field}
                      onSave={(id, input) => updateMutation.mutate({ id, input })}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      onMove={handleMove}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGate>
  );
}

function TemplatesSection({ userId }: { userId?: string }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<MessageTemplateChannel>("whatsapp");
  const [body, setBody] = useState("Oi {{nome}}, tudo bem? Vi a {{empresa}} e queria te mostrar uma ideia.");

  const templatesQuery = useQuery({
    queryKey: ["settings", "message-templates"],
    queryFn: listMessageTemplates,
    enabled: !!userId,
  });

  const templates = templatesQuery.data ?? [];
  const variables = useMemo(() => extractTemplateVariables(body), [body]);
  const preview = useMemo(() => renderTemplatePreview(body, DUMMY_TEMPLATE_DATA), [body]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("Usuario sem profile carregado.");
      if (editingId) {
        return updateMessageTemplate(editingId, { name, channel, body });
      }
      return createMessageTemplate({ owner_id: userId, name, channel, body });
    },
    onSuccess: () => {
      toast.success(editingId ? "Template atualizado." : "Template criado.");
      setEditingId(null);
      setName("");
      setChannel("whatsapp");
      setBody("Oi {{nome}}, tudo bem? Vi a {{empresa}} e queria te mostrar uma ideia.");
      queryClient.invalidateQueries({ queryKey: ["settings", "message-templates"] });
    },
    onError: (error) => toast.error(`Nao foi possivel salvar template: ${(error as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMessageTemplate,
    onSuccess: () => {
      toast.success("Template removido.");
      if (editingId) setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["settings", "message-templates"] });
    },
    onError: (error) => toast.error(`Nao foi possivel remover template: ${(error as Error).message}`),
  });

  function handleSelectTemplate(template: MessageTemplate) {
    setEditingId(template.id);
    setName(template.name);
    setChannel(template.channel);
    setBody(template.body);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !body.trim()) {
      toast.warning("Informe nome e corpo do template.");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Templates
          </CardTitle>
          <CardDescription>Mensagens reutilizaveis por canal.</CardDescription>
        </CardHeader>
        <CardContent>
          {templatesQuery.isLoading ? (
            <SettingsSkeleton />
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum template salvo ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleSelectTemplate(template)}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${
                    editingId === template.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{template.name}</span>
                    <Badge variant="secondary">{CHANNEL_LABEL[template.channel]}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.body}</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {editingId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {editingId ? "Editar template" : "Novo template"}
          </CardTitle>
          <CardDescription>Use variaveis no formato {"{{nome}}"}, {"{{empresa}}"} e similares.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <Label htmlFor="template-name">Nome</Label>
                <Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <Select value={channel} onValueChange={(value) => setChannel(value as MessageTemplateChannel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESSAGE_TEMPLATE_CHANNELS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {CHANNEL_LABEL[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-body">Mensagem</Label>
              <Textarea
                id="template-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={9}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Variaveis detectadas</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {variables.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Nenhuma variavel encontrada.</span>
                  ) : (
                    variables.map((variable) => (
                      <Badge key={variable} variant="secondary">
                        {`{{${variable}}}`}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Preview</p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{preview}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {editingId ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null);
                      setName("");
                      setChannel("whatsapp");
                      setBody("Oi {{nome}}, tudo bem? Vi a {{empresa}} e queria te mostrar uma ideia.");
                    }}
                  >
                    Novo
                  </Button>
                  <Button type="button" variant="outline" onClick={() => deleteMutation.mutate(editingId)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </Button>
                </>
              ) : null}
              <Button type="submit" className="gap-2" disabled={saveMutation.isPending}>
                <Save className="h-4 w-4" />
                Salvar template
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Settings() {
  const { isAdmin, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => getHashTab());

  useEffect(() => {
    const onHashChange = () => setActiveTab(getHashTab());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function handleTabChange(value: string) {
    const next = value as SettingsTab;
    setActiveTab(next);
    const nextUrl = `${window.location.pathname}${window.location.search}#${next}`;
    window.history.replaceState(null, "", nextUrl);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Settings2 className="h-4 w-4" />
              No-code admin
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Usuarios, pipelines, campos customizados e templates em um so lugar.
            </p>
          </div>
          <Badge variant={isAdmin ? "default" : "secondary"} className="w-fit gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {isAdmin ? "Admin" : ROLE_LABEL[profile?.role ?? "viewer"]}
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-5">
          <TabsList className="h-auto flex-wrap justify-start gap-1">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.adminOnly ? <Lock className="h-3 w-3 opacity-60" /> : null}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="users">
            <UsersSection isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="pipelines">
            <PipelinesSection isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="custom-fields">
            <CustomFieldsSection isAdmin={isAdmin} userId={profile?.id} />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesSection userId={profile?.id} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
