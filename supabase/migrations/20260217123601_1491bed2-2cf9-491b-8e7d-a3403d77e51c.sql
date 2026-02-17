-- Allow public to view time_blocks so the booking page can filter blocked dates/times
CREATE POLICY "Public can view time_blocks"
ON public.time_blocks
FOR SELECT
USING (true);
