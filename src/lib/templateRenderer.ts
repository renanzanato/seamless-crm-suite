export type TemplateFallbackStrategy = "block" | "skip_contact" | "default";

export interface TemplateContext {
  contact?: Record<string, unknown> | null;
  company?: Record<string, unknown> | null;
  deal?: Record<string, unknown> | null;
  owner?: Record<string, unknown> | null;
  custom?: Record<string, unknown> | null;
}

export interface RenderTemplateOptions {
  fallbackStrategy?: TemplateFallbackStrategy;
  defaults?: Record<string, string>;
}

export interface RenderTemplateResult {
  template: string;
  compiledTemplate: string;
  body_rendered: string;
  variables_used: string[];
  variables_missing: string[];
  variables_invalid: string[];
  fallback_strategy: TemplateFallbackStrategy;
}

export const TEMPLATE_ALIASES: Record<string, string> = {
  nome: "contact.first_name",
  primeiro_nome: "contact.first_name",
  first_name: "contact.first_name",
  nome_completo: "contact.name",
  empresa: "company.name",
  empreendimento: "company.custom.nome_empreendimento",
  role: "contact.role",
  cargo: "contact.role",
  cidade: "company.city",
};

export const TEMPLATE_VARIABLES = [
  "contact.name",
  "contact.first_name",
  "contact.email",
  "contact.whatsapp",
  "contact.role",
  "company.name",
  "company.domain",
  "company.city",
  "company.industry",
  "company.custom.nome_empreendimento",
  "deal.title",
  "deal.value",
  "owner.name",
];

const ALLOWED_PREFIXES = ["contact.", "company.", "company.custom.", "deal.", "owner.", "custom."];
const VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

function firstName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().split(/\s+/)[0] ?? "";
}

function normalizeVariable(variable: string) {
  const trimmed = variable.trim();
  return TEMPLATE_ALIASES[trimmed] ?? trimmed;
}

function isAllowedVariable(variable: string) {
  return TEMPLATE_VARIABLES.includes(variable) || ALLOWED_PREFIXES.some((prefix) => variable.startsWith(prefix));
}

function readPath(source: unknown, parts: string[]): unknown {
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveVariable(variable: string, context: TemplateContext): unknown {
  if (variable === "contact.first_name") return firstName(context.contact?.name);
  const [scope, ...path] = variable.split(".");
  if (scope === "custom") return readPath(context.custom, path);
  return readPath((context as Record<string, unknown>)[scope], path);
}

export function extractTemplateVariables(template: string): string[] {
  return uniqueSorted(Array.from(template.matchAll(VARIABLE_PATTERN)).map((match) => normalizeVariable(match[1])));
}

export function compileTemplateAliases(template: string): string {
  return template.replace(VARIABLE_PATTERN, (_match, variable: string) => `{{${normalizeVariable(variable)}}}`);
}

export function findInvalidTemplateVariables(template: string): string[] {
  return extractTemplateVariables(template).filter((variable) => !isAllowedVariable(variable));
}

export function renderTemplate(
  template: string,
  context: TemplateContext,
  options: RenderTemplateOptions = {},
): RenderTemplateResult {
  const fallbackStrategy = options.fallbackStrategy ?? "block";
  const compiledTemplate = compileTemplateAliases(template);
  const variables = extractTemplateVariables(compiledTemplate);
  const variablesMissing: string[] = [];
  const variablesInvalid = variables.filter((variable) => !isAllowedVariable(variable));

  const bodyRendered = compiledTemplate.replace(VARIABLE_PATTERN, (match, variable: string) => {
    const normalized = normalizeVariable(variable);
    if (!isAllowedVariable(normalized)) return match;
    const value = resolveVariable(normalized, context);
    if (value == null || value === "") {
      variablesMissing.push(normalized);
      return options.defaults?.[normalized] ?? (fallbackStrategy === "default" ? "" : match);
    }
    return String(value);
  });

  return {
    template,
    compiledTemplate,
    body_rendered: bodyRendered,
    variables_used: variables.filter((variable) => !variablesMissing.includes(variable) && !variablesInvalid.includes(variable)),
    variables_missing: uniqueSorted(variablesMissing),
    variables_invalid: uniqueSorted(variablesInvalid),
    fallback_strategy: fallbackStrategy,
  };
}

export function renderTemplatePreview(template: string, data: Record<string, string>): string {
  return renderTemplate(template, {
    contact: {
      name: data["contact.name"] ?? data.nome_completo ?? data.nome,
      email: data["contact.email"],
      whatsapp: data["contact.whatsapp"],
      role: data["contact.role"] ?? data.role ?? data.cargo,
    },
    company: {
      name: data["company.name"] ?? data.empresa,
      city: data["company.city"] ?? data.cidade,
      domain: data["company.domain"],
      industry: data["company.industry"],
      custom: {
        nome_empreendimento: data["company.custom.nome_empreendimento"] ?? data.empreendimento,
      },
    },
    deal: {
      title: data["deal.title"],
      value: data["deal.value"],
    },
    owner: {
      name: data["owner.name"],
    },
    custom: data,
  }, { fallbackStrategy: "default", defaults: data }).body_rendered;
}

