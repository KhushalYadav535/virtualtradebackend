/**
 * Postgres pool config — SSL only when DATABASE_SSL=true.
 * Uses discrete host/user/password when SSL is off so PG* env vars cannot force SSL.
 */
function buildDatabasePoolConfig() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return null;

  const useSsl = String(process.env.DATABASE_SSL || '').trim().toLowerCase() === 'true';

  const base = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  };

  let host = 'unknown';

  try {
    const normalized = rawUrl.trim().replace(/^postgresql:/i, 'postgres:');
    const url = new URL(normalized);

    host = url.hostname;
    const database = url.pathname.replace(/^\//, '') || 'postgres';
    const port = url.port ? parseInt(url.port, 10) : 5432;

    if (!useSsl) {
      return {
        config: {
          ...base,
          host: url.hostname,
          port,
          database,
          user: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
          ssl: false
        },
        useSsl,
        host
      };
    }

    let connectionString = rawUrl.trim();
    url.searchParams.set('sslmode', 'require');
    connectionString = url.toString().replace(/^postgres:/i, 'postgresql:');

    return {
      config: { ...base, connectionString, ssl: { rejectUnauthorized: false } },
      useSsl,
      host
    };
  } catch (err) {
    console.warn('Could not parse DATABASE_URL, using connection string as-is:', err.message);
    return {
      config: { ...base, connectionString: rawUrl.trim() },
      useSsl,
      host
    };
  }
}

module.exports = { buildDatabasePoolConfig };
