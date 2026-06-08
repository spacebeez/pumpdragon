-- Optional free-text flavor of the activity ("trail running", "bench press"); never affects scoring.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS detail TEXT;
