-- ============================================================
-- Fix: Profiles SELECT Policy für Chat-Gruppenmitglieder
-- Problem: profiles hat nur policies für eigenes Profil + Jagd-Teilnehmer.
-- Chat-Mitglieder können sich gegenseitig nicht sehen → JOIN schlägt fehl → "0 Mitglieder"
-- Stand: 02.04.2026
-- ============================================================

-- Chat-Gruppenmitglieder dürfen Profile der anderen Mitglieder sehen
CREATE POLICY "profiles_select_chat_members" ON profiles FOR SELECT USING (
  id IN (
    SELECT cgm.user_id
    FROM chat_group_members cgm
    WHERE cgm.group_id IN (SELECT get_my_group_ids())
  )
);
