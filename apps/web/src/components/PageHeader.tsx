import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Başlığın sağında (mobilde altında) duran butonlar vb. */
  actions?: ReactNode;
}

// Tüm üst seviye ekranlar aynı başlık düzenini kullanır: büyük başlık, altında
// kısa açıklama, sağda aksiyonlar. Yükleme/hata durumlarında da render edilir
// ki veri gelince başlık zıplamasın.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// Liste ekranlarının kabı: görünür yüksekliği tam doldurur (üst bar h-14 +
// main'in py-6'sı = 6.5rem), sayfa aşağı kaymaz — tablo kendi içinde kayar.
// İçerideki tablo flex-1/min-h-0 ile kalan alanı alır. data-fill-viewport,
// App'teki main'in alt boşluğunu (pb-16) bu ekranlarda kaldırır.
export function ListPageLayout({ children }: { children: ReactNode }) {
  return (
    <div data-fill-viewport className="flex h-[calc(100svh-6.5rem)] flex-col gap-6">
      {children}
    </div>
  );
}

// Sayfa içi yükleniyor / hata / boş durum mesajı — her ekranda aynı görünüm.
export function PageMessage({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <p className={cn("py-10 text-center", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {children}
    </p>
  );
}
