// Validate the effective environment after Next loads its configuration, before database initialization.
export function assertSessionConfiguration(environment: NodeJS.ProcessEnv) {
  if (environment.NODE_ENV === 'production' && (!environment.JWT_SECRET || new TextEncoder().encode(environment.JWT_SECRET).length < 32))
    throw new Error('Production requires JWT_SECRET with at least 32 bytes.');
}
