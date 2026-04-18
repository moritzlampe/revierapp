export type Profile = {
  id: string;
  name: string;
  jagdschein_nr: string | null;
  jagdschein_behoerde: string | null;
  telefon: string | null;
  anonymize_kills: boolean;
  created_at: string;
};
