-- Cambio de modelo (nomic-embed-text, 768 → bge-m3, 1024): los vectores
-- anteriores no se pueden convertir. Se borran y la próxima corrida de
-- db:embed / db:sync los regenera todos.
DELETE FROM "embedding";--> statement-breakpoint
ALTER TABLE "embedding" ALTER COLUMN "vector" SET DATA TYPE vector(1024);
