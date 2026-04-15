-- 028: Schmaltier + Spießer für Rot- und Damwild
-- Pendants zu schmalreh/schmalbock beim Rehwild

ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'schmaltier_rot';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'spiesser_rot';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'schmaltier_dam';
ALTER TYPE wild_art ADD VALUE IF NOT EXISTS 'spiesser_dam';
