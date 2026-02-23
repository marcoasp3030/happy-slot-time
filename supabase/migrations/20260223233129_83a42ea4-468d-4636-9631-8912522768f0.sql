-- Enable REPLICA IDENTITY FULL for realtime to work with filters on UPDATE/DELETE
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_conversations REPLICA IDENTITY FULL;