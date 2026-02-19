
-- Add database-level input validation constraints for public booking
-- Limit client_name, client_phone, and notes field lengths
ALTER TABLE public.appointments 
  ADD CONSTRAINT chk_client_name_length CHECK (char_length(client_name) <= 150),
  ADD CONSTRAINT chk_client_phone_length CHECK (char_length(client_phone) <= 30),
  ADD CONSTRAINT chk_notes_length CHECK (notes IS NULL OR char_length(notes) <= 1000);

-- Add phone format constraint (digits, spaces, dashes, parentheses, plus sign)
ALTER TABLE public.appointments
  ADD CONSTRAINT chk_client_phone_format CHECK (
    client_phone ~ '^[\+\d\s\-\(\)]{7,30}$'
  );
