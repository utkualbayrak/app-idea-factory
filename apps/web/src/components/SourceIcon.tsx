import type { ReactNode } from "react";
import { Link2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Source {
  label: string;
  colorClass: string;
  icon: ReactNode;
}

// notes.txt (Grup 3 ek isteği): ilham kaynağı url'lerini çiğ metin olarak
// göstermek yerine kaynağın logosunu göster, tıklanınca yine linke gitsin.
// İkon path'leri simpleicons.org'dan (Reddit/Apple/Product Hunt); Hacker
// News'ün simple-icons'ta ayrı bir markası yok, kendi turuncu "Y" işaretini
// elle çiziyoruz.
function detectSource(url: string): Source | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  if (hostname.endsWith("reddit.com")) {
    return {
      label: "Reddit",
      colorClass: "text-[#FF4500]",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z" />
        </svg>
      ),
    };
  }

  if (hostname === "apps.apple.com" || hostname === "itunes.apple.com") {
    return {
      label: "App Store",
      colorClass: "text-foreground",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
        </svg>
      ),
    };
  }

  if (hostname.endsWith("producthunt.com")) {
    return {
      label: "Product Hunt",
      colorClass: "text-[#DA552F]",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
          <path d="M13.604 8.4h-3.405V12h3.405c.995 0 1.801-.806 1.801-1.801 0-.993-.805-1.799-1.801-1.799zM12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm1.604 14.4h-3.405V18H7.801V6h5.804c2.319 0 4.2 1.88 4.2 4.199 0 2.321-1.881 4.201-4.201 4.201z" />
        </svg>
      ),
    };
  }

  if (hostname === "news.ycombinator.com") {
    return {
      label: "Hacker News",
      colorClass: "",
      icon: (
        <span className="flex size-4 items-center justify-center rounded-[3px] bg-[#ff6600] text-[10px] leading-none font-bold text-white">
          Y
        </span>
      ),
    };
  }

  return { label: hostname, colorClass: "text-muted-foreground", icon: <Link2 className="size-4" /> };
}

export function SourceIcon({ url }: { url: string }) {
  const source = detectSource(url);
  if (!source) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={source.label}
          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-card transition-colors hover:bg-accent ${source.colorClass}`}
        >
          {source.icon}
        </a>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs break-all">
        {source.label} — {url}
      </TooltipContent>
    </Tooltip>
  );
}
