ALTER TABLE "colors" DROP CONSTRAINT "colors_color_format";--> statement-breakpoint
ALTER TABLE "printing_projects" DROP CONSTRAINT "printing_projects_color_format";--> statement-breakpoint
ALTER TABLE "stitch_projects" DROP CONSTRAINT "stitch_projects_color_format";--> statement-breakpoint
ALTER TABLE "todo_lists" DROP CONSTRAINT "todo_lists_color_format";--> statement-breakpoint
-- Preserve retained shades as their IDs move; replace removed shades with retained alternatives.
-- Removed old IDs: 3 -> old 12, 7 -> old 42, 9 -> old 16,
-- 11 -> old 42, 21 -> old 16, 36 -> old 2.
CREATE TEMP TABLE card_color_remap (old_id integer PRIMARY KEY, new_id integer NOT NULL) ON COMMIT DROP;
INSERT INTO card_color_remap (old_id, new_id) VALUES
  (1, 1),
  (2, 2),
  (3, 8),
  (4, 3),
  (5, 4),
  (6, 5),
  (7, 36),
  (8, 6),
  (9, 12),
  (10, 7),
  (11, 36),
  (12, 8),
  (13, 9),
  (14, 10),
  (15, 11),
  (16, 12),
  (17, 13),
  (18, 14),
  (19, 15),
  (20, 16),
  (21, 12),
  (22, 17),
  (23, 18),
  (24, 19),
  (25, 20),
  (26, 21),
  (27, 22),
  (28, 23),
  (29, 24),
  (30, 25),
  (31, 26),
  (32, 27),
  (33, 28),
  (34, 29),
  (35, 30),
  (36, 2),
  (37, 31),
  (38, 32),
  (39, 33),
  (40, 34),
  (41, 35),
  (42, 36);
UPDATE "colors" AS card SET color = mapping.new_id
FROM card_color_remap AS mapping WHERE card.color = mapping.old_id;
UPDATE "printing_projects" AS card SET color = mapping.new_id
FROM card_color_remap AS mapping WHERE card.color = mapping.old_id;
UPDATE "stitch_projects" AS card SET color = mapping.new_id
FROM card_color_remap AS mapping WHERE card.color = mapping.old_id;
UPDATE "todo_lists" AS card SET color = mapping.new_id
FROM card_color_remap AS mapping WHERE card.color = mapping.old_id;
--> statement-breakpoint
ALTER TABLE "colors" ADD CONSTRAINT "colors_color_format" CHECK ("colors"."color" BETWEEN 1 AND 36);--> statement-breakpoint
ALTER TABLE "printing_projects" ADD CONSTRAINT "printing_projects_color_format" CHECK ("printing_projects"."color" BETWEEN 1 AND 36);--> statement-breakpoint
ALTER TABLE "stitch_projects" ADD CONSTRAINT "stitch_projects_color_format" CHECK ("stitch_projects"."color" BETWEEN 1 AND 36);--> statement-breakpoint
ALTER TABLE "todo_lists" ADD CONSTRAINT "todo_lists_color_format" CHECK ("todo_lists"."color" BETWEEN 1 AND 36);

-- Force open clients to refresh all resources whose stored palette IDs changed.
UPDATE app_data_revisions SET revision = revision + 1, updated_at = now()
WHERE resource IN ('colors', 'todos', 'printing', 'cross-stitch');
