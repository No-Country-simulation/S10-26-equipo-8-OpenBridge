export function construirQueryLote(repositorios) {
    const aliasQueries = repositorios.map((repo, index) => {
      return `
        repo_${index}: repository(owner: "${repo.owner}", name: "${repo.name}") {
          description
          stargazerCount
          forkCount
          isArchived
          licenseInfo { name }
          primaryLanguage { name }
          repositoryTopics(first: 10) {
            nodes { topic { name } }
          }
          issues(states: OPEN) { totalCount }
          defaultBranchRef {
            target {
              ... on Commit { oid }
            }
          }
          latestRelease { tagName }
        }
      `;
    });
  
    return `query GetMetadataBatch { ${aliasQueries.join('\n')} }`;
  }
  