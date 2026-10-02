import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchUserNames, type UserName } from "@/lib/api";

// "En son kim güncelledi" satırlarındaki e-postaları görünen ada çevirir.
// Eşleme (Ayarlar > Kullanıcılar) uygulama açılınca bir kez çekilir; Ayarlar
// değiştirince reload() ile tazelenir.

export const SYSTEM_ACTOR = "system";

interface UserNamesContextValue {
  users: UserName[];
  me: string | null;
  /** Yükleme hatası (Ayarlar'da gösterilir; isimler @ öncesine düşer). */
  error: string | null;
  displayName: (email: string) => string;
  reload: () => Promise<void>;
}

const UserNamesContext = createContext<UserNamesContextValue | null>(null);

export function UserNamesProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<UserName[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      fetchUserNames()
        .then((data) => {
          setUsers(data.users);
          setMe(data.me);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err))),
    [],
  );

  // İlk yükleme; hata context'te tutulur, uygulamayı durdurmaz.
  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<UserNamesContextValue>(() => {
    const names = new Map(users.filter((u) => u.display_name).map((u) => [u.email, u.display_name as string]));
    return {
      users,
      me,
      error,
      reload,
      displayName: (email) => {
        if (email === SYSTEM_ACTOR) return "Otomasyon";
        return names.get(email) ?? email.split("@")[0];
      },
    };
  }, [users, me, error, reload]);

  return <UserNamesContext.Provider value={value}>{children}</UserNamesContext.Provider>;
}

export function useUserNames() {
  const ctx = useContext(UserNamesContext);
  if (!ctx) throw new Error("useUserNames, UserNamesProvider icinde kullanilmali");
  return ctx;
}
