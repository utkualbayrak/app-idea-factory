// Yüklemeden önce görseli tarayıcıda hazırlar: uzun kenar en fazla 2000 px,
// PNG (saydamlık olabilir) PNG kalır, diğerleri JPEG olur. Sonuç API sınırını
// (1,5 MB) aşarsa JPEG kalitesi düşürülerek tekrar denenir.
const MAX_EDGE = 2000;
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error(
      /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
        ? "HEIC desteklenmiyor; görseli PNG ya da JPEG olarak dışa aktar."
        : "Yalnızca PNG, JPEG ya da WebP görsel eklenebilir.",
    );
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Görsel okunamadı.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  // Küçültme gerekmiyor ve dosya zaten sığıyorsa olduğu gibi gönder.
  if (scale === 1 && file.size <= MAX_IMAGE_BYTES) {
    bitmap.close();
    return { blob: file, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Görsel işlenemedi.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  if (file.type === "image/png") {
    const png = await toBlob(canvas, "image/png");
    if (png && png.size <= MAX_IMAGE_BYTES) return { blob: png, width, height };
    // Saydam alanlar JPEG'de siyaha döner; beyaz zemin üzerine çizilir.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    const jpeg = await toBlob(canvas, "image/jpeg", quality);
    if (jpeg && jpeg.size <= MAX_IMAGE_BYTES) return { blob: jpeg, width, height };
  }
  throw new Error("Görsel 1,5 MB'a sığdırılamadı.");
}
