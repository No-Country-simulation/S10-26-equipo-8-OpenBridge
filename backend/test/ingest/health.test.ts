import { describe, expect, it } from 'vitest';
import {
  calculateHealthScore,
  getMaintenanceLevel,
  type HealthScoreInput,
} from '../../src/ingest/health.js';

const now = new Date('2026-10-28T12:00:00Z');
const healthyInput: HealthScoreInput = {
  lastCommitAt: new Date('2026-10-28T11:00:00Z'),
  recentCommitCount: 10,
  openIssues: 0,
  closedIssues: 10,
  stars: 100_000,
  lastReleaseAt: new Date('2026-10-28T10:00:00Z'),
  activeContributors: 5,
  archived: false,
  hasMaintainerCommitInPast90Days: true,
};

describe('cálculo del puntaje de salud', () => {
  it('calcula 0 y asigna AT_RISK', () => {
    const result = calculateHealthScore(
      {
        ...healthyInput,
        lastCommitAt: null,
        recentCommitCount: 0,
        openIssues: 1,
        closedIssues: 0,
        stars: 0,
        lastReleaseAt: null,
        activeContributors: 0,
      },
      now,
    );

    expect(result).toEqual({
      healthScore: 0,
      maintenanceLevel: 'AT_RISK',
      activeMaintainer: true,
    });
  });

  it.each([
    [39, 'AT_RISK'],
    [40, 'MODERATE'],
    [69, 'MODERATE'],
    [70, 'ACTIVE'],
    [100, 'ACTIVE'],
  ] as const)('asigna el nivel correcto para puntaje %i', (score, expectedLevel) => {
    expect(getMaintenanceLevel(score, false, healthyInput.lastCommitAt, now)).toBe(expectedLevel);
  });

  it('calcula 100 con todas las señales en su máximo', () => {
    expect(calculateHealthScore(healthyInput, now)).toEqual({
      healthScore: 100,
      maintenanceLevel: 'ACTIVE',
      activeMaintainer: true,
    });
  });

  it('da el puntaje completo de resolución cuando no hay incidencias', () => {
    const result = calculateHealthScore({ ...healthyInput, openIssues: 0, closedIssues: 0 }, now);

    expect(result.healthScore).toBe(100);
  });

  it('devuelve activeMaintainer según commits recientes de una persona mantenedora', () => {
    const result = calculateHealthScore(
      { ...healthyInput, hasMaintainerCommitInPast90Days: false },
      now,
    );

    expect(result.activeMaintainer).toBe(false);
  });

  it('limita a menos de 40 y asigna AT_RISK si el último commit supera 12 meses', () => {
    const result = calculateHealthScore(
      {
        ...healthyInput,
        lastCommitAt: new Date('2025-10-27T11:00:00Z'),
      },
      now,
    );

    expect(result.healthScore).toBeLessThan(40);
    expect(result.maintenanceLevel).toBe('AT_RISK');
  });

  it('prioriza ARCHIVED sin importar el puntaje', () => {
    const result = calculateHealthScore({ ...healthyInput, archived: true }, now);

    expect(result).toEqual({
      healthScore: 100,
      maintenanceLevel: 'ARCHIVED',
      activeMaintainer: true,
    });
  });
});
