import type { ImageRole } from "@/lib/api";

// apps/api/src/schema.ts MAX_IMAGES_PER_IDEA ile aynı.
export const MAX_IMAGES_PER_IDEA = 12;

export const IMAGE_ROLE_LABELS: Record<ImageRole, string> = {
  screen: "Ekran tasarımı",
  inspiration: "İlham",
  asset: "Varlık (logo/ikon)",
};

export const IMAGE_ROLE_DESCRIPTIONS: Record<ImageRole, string> = {
  screen: "Yerleşim, renk ve bileşenler bu görsele olabildiğince yakın uygulanır.",
  inspiration: "Yalnızca ton ve hava alınır, birebir kopyalanmaz.",
  asset: "Dosya uygulamada aynen kullanılır (logo, ikon, illüstrasyon).",
};

