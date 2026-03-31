-- Add missing update and delete policies for zonen table
create policy "Zonen bearbeiten" on zonen for update
  using (revier_id in (select id from reviere where owner_id = auth.uid()));
create policy "Zonen loeschen" on zonen for delete
  using (revier_id in (select id from reviere where owner_id = auth.uid()));
