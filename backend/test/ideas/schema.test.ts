import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { newIntegrationIdeaSchema } from '../../src/ideas/schema.js';

const validIdea = () => ({
  repositoryId: randomUUID(),
  title: 'Notificar pagos aprobados',
  summary: 'Escuchar el webhook de pagos y actualizar el pedido.',
  integrationType: 'WEBHOOK',
  triggers: [{ event: 'payment.succeeded', description: 'Se aprobó un cobro' }],
  snippet: { language: 'typescript', code: "app.post('/webhooks/pagos', handler);" },
  stackCompatibility: ['nextjs', 'nestjs'],
  difficulty: 'MEDIUM',
  connectsWith: [randomUUID()],
  source: 'HUMAN',
});

function issuePaths(input: unknown) {
  const result = newIntegrationIdeaSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('esquema de idea de integración', () => {
  it('acepta una idea completa', () => {
    expect(newIntegrationIdeaSchema.safeParse(validIdea()).success).toBe(true);
  });

  it('rechaza un integration_type fuera de los valores permitidos e indica el campo', () => {
    expect(issuePaths({ ...validIdea(), integrationType: 'GRPC' })).toEqual(['integrationType']);
  });

  it('rechaza una idea WEBHOOK sin disparadores', () => {
    expect(issuePaths({ ...validIdea(), triggers: [] })).toEqual(['triggers']);
  });

  it('permite otros tipos sin disparadores', () => {
    const result = newIntegrationIdeaSchema.safeParse({
      ...validIdea(),
      integrationType: 'SDK',
      triggers: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.triggers).toEqual([]);
  });

  it('exige el lenguaje cuando hay fragmento de código', () => {
    expect(issuePaths({ ...validIdea(), snippet: { code: 'docker compose up' } })).toEqual([
      'snippet.language',
    ]);
    expect(
      issuePaths({ ...validIdea(), snippet: { language: '  ', code: 'docker compose up' } }),
    ).toEqual(['snippet.language']);
  });

  it('permite una idea sin fragmento de código', () => {
    const result = newIntegrationIdeaSchema.safeParse({ ...validIdea(), snippet: undefined });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.snippet).toBeNull();
  });

  it('rechaza una dificultad fuera de LOW, MEDIUM o HIGH', () => {
    expect(issuePaths({ ...validIdea(), difficulty: 'EASY' })).toEqual(['difficulty']);
  });

  it('no deja elegir el estado al crear una idea', () => {
    const result = newIntegrationIdeaSchema.safeParse({ ...validIdea(), status: 'APPROVED' });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('status');
  });
});
