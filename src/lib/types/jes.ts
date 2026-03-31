import type { JagdartType } from "./strecke";

export type JesStatus = "aktiv" | "pausiert" | "entzogen" | "abgelaufen";

export type Jes = {
  id: string;
  revier_id: string;
  inhaber_id: string;
  erstellt_von: string;
  gueltig_von: string;
  gueltig_bis: string;
  zone_ids: string[];
  wildarten: WildartKontingent[];
  jagdart: JagdartType;
  entgeltlich: boolean;
  betrag: number | null;
  auflagen: string | null;
  kfz_kennzeichen: string | null;
  status: JesStatus;
  qr_code: string | null;
  created_at: string;
};

export type WildartKontingent = {
  wildart: string;
  limit: number | null; // null = unbegrenzt
  erlegt: number;
};
