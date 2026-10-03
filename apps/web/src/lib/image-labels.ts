import type { IdeaImage, ImageRole } from "@/lib/api";

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

// "3 görsel (2 ekran tasarımı, 1 ilham)"
export function imagesSummary(images: IdeaImage[]): string {
  const counts = (Object.keys(IMAGE_ROLE_LABELS) as ImageRole[])
    .map((role) => [role, images.filter((i) => i.role === role).length] as const)
    .filter(([, n]) => n > 0)
    .map(([role, n]) => `${n} ${IMAGE_ROLE_LABELS[role].split(" (")[0].toLowerCase()}`);
  return `${images.length} görsel (${counts.join(", ")})`;
}
