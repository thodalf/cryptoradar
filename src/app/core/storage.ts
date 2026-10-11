/**
 * Accès localStorage tolérant aux erreurs (navigation privée, quota, etc.).
 * Seules des données non sensibles y sont stockées : seuils, historique importé.
 * Aucune clé d'API n'est jamais écrite ici.
 */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : l'app continue en mémoire */
  }
}
