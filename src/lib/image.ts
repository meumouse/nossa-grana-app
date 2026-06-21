// Utilitários de imagem para a foto de perfil. A foto enviada pelo usuário é
// redimensionada NO NAVEGADOR para um quadrado pequeno e convertida em data URI
// (JPEG) — assim ela é guardada direto no campo `avatarUrl` (string), sem
// depender de object storage e viajando junto com o usuário (offline-first).

/** Tamanho final do avatar (px). Mantém o data URI leve (~20–40KB). */
const AVATAR_SIZE = 256;
/** Qualidade do JPEG de saída. */
const AVATAR_QUALITY = 0.85;
/** Tipos de imagem aceitos no upload. */
export const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Limite do arquivo de ENTRADA (antes do resize). */
export const MAX_AVATAR_INPUT_BYTES = 8 * 1024 * 1024; // 8MB

/** Carrega um File numa <img> via Object URL, revogando-o ao final. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem.'));
    };
    img.src = url;
  });
}

/**
 * Redimensiona/recorta a imagem para um quadrado de {@link AVATAR_SIZE}px
 * (recorte central "cover") e devolve um data URI JPEG pronto p/ salvar.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
    throw new Error('Formato não suportado. Envie JPG, PNG, WEBP ou GIF.');
  }
  if (file.size > MAX_AVATAR_INPUT_BYTES) {
    throw new Error('Imagem muito grande (máx. 8MB).');
  }

  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não suporta o processamento da imagem.');

  // Recorte central "cover": pega o maior quadrado possível do centro da imagem.
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  return canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
}
