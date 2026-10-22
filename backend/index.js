const TOKEN = process.env.GITHUB_TOKEN;

async function obtenerDatosRepo(owner, name) {
  const url = `https://api.github.com/repos/${owner}/${name}`;

  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'NodeJS-Rest-Client'
  };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    throw new Error(`Error ${response.status}: El servidor rechazó la solicitud.`);
  }

  return await response.json();
}

async function main() {
  console.log("Iniciando cliente de extracción masiva (Modo REST)...");
  const repositorios = [
    { owner: 'facebook', name: 'react' },
    { owner: 'nodejs', name: 'node' }
  ];

  for (const repo of repositorios) {
    try {
      const data = await obtenerDatosRepo(repo.owner, repo.name);
      console.log(`✅ [${repo.owner}/${repo.name}] con éxito.`);
      console.log(`   ⭐ Estrellas: ${data.stargazers_count.toLocaleString()} | 🍴 Forks: ${data.forks_count.toLocaleString()} | 💻 Lenguaje: ${data.language || 'N/A'}\n`);
    } catch (error) {
      console.error(`💥 Error en ${repo.owner}/${repo.name}: ${error.message}`, error.cause ?? '');
    }
  }
}

main();