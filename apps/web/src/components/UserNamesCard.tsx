import { useState } from "react";
import { deleteUserName, putUserName, type UserName } from "@/lib/api";
import { useUserNames } from "@/lib/user-names";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Ayarlar > Kullanıcılar: Access ile giriş yapan e-postalara görünen ad verir.
// Liste, kayıtlarda geçen e-postalardan ve senin e-postandan oluşur; ad
// verilmeyen e-posta arayüzde @ öncesiyle görünür.
export function UserNamesCard() {
  const { users, me, error, reload } = useUserNames();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Kullanıcılar</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Kayıtlardaki "en son kim güncelledi" bilgisi bu adlarla gösterilir. Bir kişi ilk değişikliğini yapınca
          burada görünür.
        </p>
        {error && <p className="text-sm text-destructive">Kullanıcılar yüklenemedi: {error}</p>}
        {users.length === 0 && !error && <p className="text-sm text-muted-foreground">Henüz kimse yok.</p>}
        {users.map((user) => (
          <UserNameRow key={user.email} user={user} isMe={user.email === me} onSaved={reload} />
        ))}
      </CardContent>
    </Card>
  );
}

function UserNameRow({ user, isMe, onSaved }: { user: UserName; isMe: boolean; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(user.display_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const dirty = trimmed !== (user.display_name ?? "");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 basis-48 truncate text-sm" title={user.email}>
          {user.email}
          {isMe && <span className="text-muted-foreground"> (sen)</span>}
        </span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={user.email.split("@")[0]}
          maxLength={40}
          className="h-8 w-40"
          aria-label={`${user.email} için görünen ad`}
        />
        <Button size="sm" disabled={busy || !dirty || !trimmed} onClick={() => run(() => putUserName(user.email, trimmed))}>
          Kaydet
        </Button>
        {user.display_name && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await deleteUserName(user.email);
                setValue("");
              })
            }
          >
            Kaldır
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
