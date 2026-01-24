-- Optional: populate subcategory tags for existing posts (best-effort).
-- Run in Supabase SQL editor.
-- This assumes tables: tags(id, slug, name_he, type) and post_tags(post_id, tag_id).
-- Adjust column names if different.

-- 1) Ensure subcategory tags exist
insert into tags (slug, name_he, type)
values
  ('מחשבות','מחשבות','format'),
  ('שירים','שירים','format'),
  ('וידויים','וידויים','format'),
  ('סיפורים-אמיתיים','סיפורים אמיתיים','format'),
  ('סיפורים-קצרים','סיפורים קצרים','format'),
  ('סיפור-בהמשכים','סיפור בהמשכים','format'),
  ('חדשות','חדשות','format'),
  ('ספורט','ספורט','format'),
  ('תרבות-ובידור','תרבות ובידור','format'),
  ('דעות','דעות','format'),
  ('טכנולוגיה','טכנולוגיה','format')
on conflict (slug) do nothing;

-- 2) Helper CTE to pick tag id by name_he
with t as (
  select id, name_he from tags where type = 'format'
),
p as (
  select id as post_id, channel_id, title
  from posts
  where status = 'published'
),
choice as (
  select
    p.post_id,
    case
      when p.channel_id = 1 and (p.title ilike '%וידו%' or p.title ilike '%מתווד%') then 'וידויים'
      when p.channel_id = 1 and p.title ilike '%שיר%' then 'שירים'
      when p.channel_id = 1 then 'מחשבות'

      when p.channel_id = 2 and (p.title ilike '%בהמשכ%' or p.title ilike '%פרק%') then 'סיפור בהמשכים'
      when p.channel_id = 2 and p.title ilike '%אמית%' then 'סיפורים אמיתיים'
      when p.channel_id = 2 then 'סיפורים קצרים'

      when p.channel_id = 3 and p.title ilike '%ספורט%' then 'ספורט'
      when p.channel_id = 3 and p.title ilike '%טכנולוג%' then 'טכנולוגיה'
      when p.channel_id = 3 and (p.title ilike '%תרבות%' or p.title ilike '%בידור%') then 'תרבות ובידור'
      when p.channel_id = 3 and p.title ilike '%דעה%' then 'דעות'
      when p.channel_id = 3 then 'חדשות'

      else null
    end as format_name
  from p
)
insert into post_tags (post_id, tag_id)
select c.post_id, t.id
from choice c
join t on t.name_he = c.format_name
where c.format_name is not null
on conflict do nothing;
