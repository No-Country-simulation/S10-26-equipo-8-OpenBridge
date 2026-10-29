import { calculateHealthScore } from './src/ingest/health';


  const inputEjemplo = {
  lastCommitAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Hace 30 días
  recentCommitCount: 3,        // Actividad baja
  openIssues: 10,
  closedIssues: 10,            // Tasa de resolución del 50%
  stars: 500,                  // Popularidad baja
  lastReleaseAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // Hace 6 meses
  activeContributors: 1,       // Solo un colaborador
  archived: false,
  hasMaintainerCommitInPast90Days: true,
};


const resultado = calculateHealthScore(inputEjemplo);
console.log('--- RESULTADO DEL CÁLCULO ---');
console.log(resultado);
