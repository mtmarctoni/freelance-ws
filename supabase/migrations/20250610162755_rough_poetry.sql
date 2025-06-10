/*
  # Create contact submissions table

  1. New Tables
    - `contact_submissions`
      - `id` (bigint, primary key)
      - `first_name` (text)
      - `last_name` (text)
      - `email` (text)
      - `company` (text, optional)
      - `project_type` (text)
      - `budget` (text, optional)
      - `timeline` (text, optional)
      - `message` (text)
      - `submitted_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `contact_submissions` table
    - Add policy for service role to insert data
*/

CREATE TABLE IF NOT EXISTS contact_submissions (
  id bigserial PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  company text,
  project_type text NOT NULL,
  budget text,
  timeline text,
  message text NOT NULL,
  submitted_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert contact submissions
CREATE POLICY "Service role can insert contact submissions"
  ON contact_submissions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow authenticated users to view their own submissions (optional)
CREATE POLICY "Users can view their own submissions"
  ON contact_submissions
  FOR SELECT
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));