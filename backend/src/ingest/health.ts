export type MaintenanceLevel = 'ACTIVE' | 'MODERATE' | 'AT_RISK' | 'ARCHIVED';

export interface HealthScoreConfig {
  weights: {
    commitAge: number;
    recentCommits: number;
    issueResolution: number;
    stars: number;
    recentRelease: number;
    activeContributors: number;
  };
  commitAgeDaysForZero: number;
  commitsForFullScore: number;
  starsForFullScore: number;
  contributorsForFullScore: number;
}

export const DEFAULT_HEALTH_SCORE_CONFIG: HealthScoreConfig = {
  weights: {
    commitAge: 30,
    recentCommits: 20,
    issueResolution: 15,
    stars: 15,
    recentRelease: 10,
    activeContributors: 10,
  },
  commitAgeDaysForZero: 365,
  commitsForFullScore: 10,
  starsForFullScore: 100_000,
  contributorsForFullScore: 5,
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NINETY_DAYS_IN_MS = 90 * DAY_IN_MS;
const TWELVE_MONTHS_IN_MS = 365 * DAY_IN_MS;

export interface HealthScoreInput {
  lastCommitAt: Date | null;
  recentCommitCount: number;
  openIssues: number;
  closedIssues: number;
  stars: number;
  lastReleaseAt: Date | null;
  activeContributors: number;
  archived: boolean;
  hasMaintainerCommitInPast90Days: boolean;
}

export interface HealthScoreResult {
  healthScore: number;
  maintenanceLevel: MaintenanceLevel;
  activeMaintainer: boolean;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function validateConfig(config: HealthScoreConfig): number {
  const weights = Object.values(config.weights);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const scales = [
    config.commitAgeDaysForZero,
    config.commitsForFullScore,
    config.starsForFullScore,
    config.contributorsForFullScore,
  ];

  if (
    !weights.every((weight) => Number.isFinite(weight) && weight >= 0) ||
    !Number.isFinite(totalWeight) ||
    totalWeight <= 0 ||
    !scales.every((scale) => Number.isFinite(scale) && scale > 0)
  ) {
    throw new Error('La configuración del puntaje de salud debe usar pesos y escalas válidos');
  }

  return totalWeight;
}

export function getMaintenanceLevel(
  score: number,
  archived: boolean,
  lastCommitAt: Date | null,
  now: Date = new Date(),
): MaintenanceLevel {
  if (archived) return 'ARCHIVED';
  if (lastCommitAt === null || now.getTime() - lastCommitAt.getTime() > TWELVE_MONTHS_IN_MS) {
    return 'AT_RISK';
  }
  if (score >= 70) return 'ACTIVE';
  if (score >= 40) return 'MODERATE';
  return 'AT_RISK';
}

export function calculateHealthScore(
  input: HealthScoreInput,
  now: Date = new Date(),
  config: HealthScoreConfig = DEFAULT_HEALTH_SCORE_CONFIG,
): HealthScoreResult {
  const totalWeight = validateConfig(config);
  const ageDays =
    input.lastCommitAt === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, (now.getTime() - input.lastCommitAt.getTime()) / DAY_IN_MS);
  const releaseAgeMs =
    input.lastReleaseAt === null
      ? Number.POSITIVE_INFINITY
      : now.getTime() - input.lastReleaseAt.getTime();
  const issueCount = input.openIssues + input.closedIssues;

  const weightedScore =
    config.weights.commitAge * clamp(1 - ageDays / config.commitAgeDaysForZero) +
    config.weights.recentCommits * clamp(input.recentCommitCount / config.commitsForFullScore) +
    config.weights.issueResolution * (issueCount === 0 ? 1 : input.closedIssues / issueCount) +
    config.weights.stars *
      clamp(Math.log10(Math.max(0, input.stars) + 1) / Math.log10(config.starsForFullScore + 1)) +
    config.weights.recentRelease *
      (releaseAgeMs >= 0 && releaseAgeMs <= TWELVE_MONTHS_IN_MS ? 1 : 0) +
    config.weights.activeContributors *
      clamp(input.activeContributors / config.contributorsForFullScore);

  let healthScore = Math.round((weightedScore / totalWeight) * 100);
  if (ageDays > TWELVE_MONTHS_IN_MS / DAY_IN_MS) {
    healthScore = Math.min(healthScore, 39);
  }

  return {
    healthScore,
    maintenanceLevel: getMaintenanceLevel(healthScore, input.archived, input.lastCommitAt, now),
    activeMaintainer: input.hasMaintainerCommitInPast90Days,
  };
}

export function getRecentCommitCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - NINETY_DAYS_IN_MS);
}
