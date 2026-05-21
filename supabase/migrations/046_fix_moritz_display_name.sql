-- Migration 046: Moritz' display_name korrigieren
-- Sprint 60.5d — I3
-- Moritz' Profil (erstes Profil ueberhaupt, 01.04.2026) traegt als
-- display_name die volle Email, weil der Signup-Trigger handle_new_user beim
-- Registrieren noch nicht existierte. Der Trigger funktioniert heute korrekt
-- (juengster Account 'heinrich' hat einen sauberen display_name), daher ist
-- das reine Legacy-Datenkorrektur, kein Trigger-Fix noetig.
-- Guard auf den Alt-Wert: laeuft auf einer bereits korrigierten DB als No-Op.

UPDATE public.profiles
SET display_name = 'Moritz'
WHERE id = '7e88910e-1ca8-4868-9313-6c5207406d23'
  AND display_name = 'moritz.lampe@biogut-brockwinkel.com';
