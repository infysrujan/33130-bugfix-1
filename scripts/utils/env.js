/**
 * Gets the environment from the hostname.
 * @returns {'dev'|'stage'|'prod'}
 */
const env = (() => {
  const host = window.location.hostname;
  if (host.includes('localhost') || host.includes('--preview') || host.includes('dev')) return 'dev';
  if (host.includes('stage') || host.includes('staging')) return 'stage';
  return 'prod';
})();

export default env;
