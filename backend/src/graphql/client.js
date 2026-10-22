import 'dotenv/config';

export async function consultarGitHubGraphQL(query) {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    throw new Error("Falta la variable de entorno GITHUB_TOKEN.");
  }

  try {
    const response = await fetch('https://github.com', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'node-fetch'
      },
      body: JSON.stringify({ query })
    });

    const result = await response.json();

    if (result.errors && !result.data) {
      throw new Error(JSON.stringify(result.errors));
    }

    return result;
  } catch (error) {
    // Máscara de seguridad estricta para evitar filtraciones del token
    const mensajeSeguro = error.message.replace(new RegExp(token, 'g'), '[SECRETO_OCULTO]');
    throw new Error(`Error en GitHub GraphQL: ${mensajeSeguro}`);
  }
}
