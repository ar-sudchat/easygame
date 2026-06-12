-- Leaderboard ของเกม — idempotent รันซ้ำได้
CREATE TABLE IF NOT EXISTS leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  char text NOT NULL CHECK (char IN ('wolf', 'duck', 'rabbit', 'bird')),
  stage integer NOT NULL DEFAULT 1 CHECK (stage >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ดึง top N บ่อยสุด
CREATE INDEX IF NOT EXISTS leaderboard_score_idx ON leaderboard (score DESC, created_at ASC);
