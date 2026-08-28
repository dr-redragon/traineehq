CREATE TABLE public.register_store (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.register_store TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.register_store TO anon;
GRANT ALL ON public.register_store TO service_role;

ALTER TABLE public.register_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read the teaching register"
  ON public.register_store FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create the teaching register"
  ON public.register_store FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update the teaching register"
  ON public.register_store FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE TRIGGER register_store_updated_at
  BEFORE UPDATE ON public.register_store
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();