/**
 * Propose un fichier texte au téléchargement.
 * Dans un artifact Claude, passe par la capacité « downloads » (seule voie
 * autorisée par le bac à sable) ; ailleurs, lien <a download> classique.
 */
interface ClaudeRuntime {
  use(name: 'downloads'): Promise<{ save(f: { filename: string; data: Blob | string }): Promise<unknown> } | null>;
}

export async function saveTextFile(filename: string, text: string, type = 'text/csv;charset=utf-8'): Promise<void> {
  const claude = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (claude?.use) {
    const downloads = await claude.use('downloads').catch(() => null);
    if (downloads) {
      await downloads.save({ filename, data: new Blob([text], { type }) });
      return;
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
