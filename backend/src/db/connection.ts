type DatabaseEnvironment = {
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
  DB_PORT?: string;
};

export function getDatabaseUrl(env: DatabaseEnvironment = process.env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (!env.DB_HOST || !env.DB_USER || !env.DB_NAME) return undefined;

  const url = new URL('postgresql://localhost');
  url.hostname = env.DB_HOST;
  url.username = env.DB_USER;
  if (env.DB_PASSWORD) url.password = env.DB_PASSWORD;
  url.pathname = `/${env.DB_NAME}`;
  if (env.DB_PORT) url.port = env.DB_PORT;

  return url.toString();
}
