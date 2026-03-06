-- ============================================================
-- Migration: 010_make_bucket_public.sql
-- Fix: Make the project-assets bucket public so getPublicUrl works
-- ============================================================

UPDATE storage.buckets
SET public = true
WHERE id = 'project-assets';
