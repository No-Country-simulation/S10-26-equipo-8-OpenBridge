import { construirQueryLote } from '../graphql/queries.js';
import { consultarGitHubGraphQL } from '../graphql/client.js';
import { pool } from '../config/db.js';

export async function procesarRepositoriosEnLotes(listaRepositorios, tamañoLote = 25) {
  for (let i = 0; i < listaRepositorios.length; i += tamañoLote) {
    const lote = listaRepositorios.slice(i, i + tamañoLote);
    console.log(`\n📦 Consultando ${lote.length} repositorios en 1 lote(s) de hasta 25...`);

    try {
      const query = construirQueryLote(lote);
      const resultado = await consultarGitHubGraphQL(query);
      const data = resultado.data || {};
      const erroresGql = resultado.errors || [];

      for (let index = 0; index < lote.length; index++) {
        const repoOriginal = lote[index];
        const aliasKey = `repo_${index}`;
        const repoData = data[aliasKey];

        const tieneErrorEspecifico = erroresGql.find(err => err.path && err.path.includes(aliasKey));

        // Si el repositorio no existe o fue renombrado, se loguea y continúa el lote
        if (!repoData || tieneErrorEspecifico) {
          const msgError = tieneErrorEspecifico ? tieneErrorEspecifico.message : "Repositorio no encontrado o renombrado (null)";
          console.error(`❌ Error en [${repoOriginal.owner}/${repoOriginal.name}]: ${msgError}`);
          
          await pool.query(
            `INSERT INTO errores_extraccion (owner, name, error_message) VALUES ($1, $2, $3)`,
            [repoOriginal.owner, repoOriginal.name, msgError]
          );
          continue;
        }

        // Estructura limpia mapeada
        const metadata = {
          owner: repoOriginal.owner,
          name: repoOriginal.name,
          description: repoData.description || null,
          stars: repoData.stargazerCount || 0,
          forks: repoData.forkCount || 0,
          license: repoData.licenseInfo?.name || null,
          language: repoData.primaryLanguage?.name || null,
          topics: repoData.repositoryTopics?.nodes.map(n => n.topic.name) || [],
          open_issues: repoData.issues?.totalCount || 0,
          last_commit_sha: repoData.defaultBranchRef?.target?.oid || null,
          last_release_version: repoData.latestRelease?.tagName || null,
          is_archived: repoData.isArchived || false
        };

        // Inserción en PostgreSQL
        await pool.query(
          `INSERT INTO repositorios_metadata 
          (owner, name, description, stars, forks, license, language, topics, open_issues, last_commit_sha, last_release_version, is_archived) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            metadata.owner, metadata.name, metadata.description, metadata.stars, 
            metadata.forks, metadata.license, metadata.language, metadata.topics, 
            metadata.open_issues, metadata.last_commit_sha, metadata.last_release_version, metadata.is_archived
          ]
        );

        console.log(`✅ Guardado con éxito: ${metadata.owner}/${metadata.name}`);
      }

    } catch (error) {
      console.error(`💥 Error crítico al procesar lote: ${error.message}`);
    }
  }
}
