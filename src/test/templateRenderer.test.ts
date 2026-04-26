import { describe, expect, it } from "vitest";
import {
  extractTemplateVariables,
  findInvalidTemplateVariables,
  renderTemplate,
} from "@/lib/templateRenderer";

describe("templateRenderer", () => {
  it("normalizes aliases to canonical variables", () => {
    expect(extractTemplateVariables("Oi {{nome}}, aqui e a {{empresa}}")).toEqual([
      "company.name",
      "contact.first_name",
    ]);
  });

  it("renders canonical and aliased variables", () => {
    const result = renderTemplate("Oi {{nome}}, vi {{company.custom.nome_empreendimento}}", {
      contact: { name: "Lais Andrade" },
      company: {
        name: "Urbano Vitalino",
        custom: { nome_empreendimento: "Reserva Central" },
      },
    });

    expect(result.body_rendered).toBe("Oi Lais, vi Reserva Central");
    expect(result.variables_missing).toEqual([]);
    expect(result.variables_invalid).toEqual([]);
  });

  it("reports invalid variables", () => {
    expect(findInvalidTemplateVariables("Oi {{apelido}}")).toEqual(["apelido"]);
  });
});

