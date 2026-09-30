import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmButtonProps {
  label: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  confirmVariant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}

// Yıkıcı/durum değiştiren aksiyonlar (sil, askıya al, askıdan çıkar) için
// tek tip onay diyaloğu (notes.txt: "silerken emin misin askıya alırken
// emin misin vs. olmalı").
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel = "Onayla",
  variant = "outline",
  confirmVariant = "default",
  className,
  disabled,
  onConfirm,
}: ConfirmButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} className={className} disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction variant={confirmVariant} onClick={() => onConfirm()}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
