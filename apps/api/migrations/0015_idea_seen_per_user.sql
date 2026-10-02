-- Aktivite rozetinin "görüldü" bilgisi kişi başına: bir kişinin fikri açması
-- rozeti başkası için okunmuş yapmaz. ideas.activity_seen_at artık
-- donmuş bir eski değer; bu tabloda satırı olmayan kişi için taban olarak
-- kullanılır (ve kimliği doğrulanamayan istekler hâlâ ona yazar).
-- FK yok (0009/0010 ile aynı gerekçe: ideas rebuild listesine girmesin).
CREATE TABLE idea_seen (
  idea_id TEXT NOT NULL,
  email TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (idea_id, email)
);
