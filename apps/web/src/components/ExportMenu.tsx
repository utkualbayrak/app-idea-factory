import { useState } from "react";
import { Clipboard, ClipboardCheck, Download, Share } from "lucide-react";
import { downloadMarkdown } from "@/lib/export-markdown";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Markdown dışa aktarma: panoya kopyala ya da .md indir. İçerik menü
// açılırken değil seçilince üretilir, böylece o anki (güncel) hali alınır.
export function ExportMenu({
  getContent,
  fileName,
  label = "Dışa aktar",
  size = "default",
}: {
  getContent: () => string;
  fileName: string;
  label?: string;
  size?: "default" | "sm";
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(getContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          {copied ? <ClipboardCheck className="size-4" /> : <Share className="size-4" />}
          {copied ? "Kopyalandı" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={handleCopy}>
          <Clipboard className="size-4" />
          Panoya kopyala
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadMarkdown(fileName, getContent())}>
          <Download className="size-4" />
          {fileName} indir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
