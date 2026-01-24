begin;

-- FK constraints (safe)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_comments_post_id_posts') then
    alter table public.comments
      add constraint fk_comments_post_id_posts
      foreign key (post_id) references public.posts(id)
      on delete cascade
      not valid;
    alter table public.comments validate constraint fk_comments_post_id_posts;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_comments_author_id_profiles') then
    alter table public.comments
      add constraint fk_comments_author_id_profiles
      foreign key (author_id) references public.profiles(id)
      on delete restrict
      not valid;
    alter table public.comments validate constraint fk_comments_author_id_profiles;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_prv_post_id_posts') then
    alter table public.post_reaction_votes
      add constraint fk_prv_post_id_posts
      foreign key (post_id) references public.posts(id)
      on delete cascade
      not valid;
    alter table public.post_reaction_votes validate constraint fk_prv_post_id_posts;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_prv_voter_id_profiles') then
    alter table public.post_reaction_votes
      add constraint fk_prv_voter_id_profiles
      foreign key (voter_id) references public.profiles(id)
      on delete restrict
      not valid;
    alter table public.post_reaction_votes validate constraint fk_prv_voter_id_profiles;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_prv_reaction_key_reactions') then
    alter table public.post_reaction_votes
      add constraint fk_prv_reaction_key_reactions
      foreign key (reaction_key) references public.reactions(key)
      on delete restrict
      not valid;
    alter table public.post_reaction_votes validate constraint fk_prv_reaction_key_reactions;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_post_votes_post_id_posts') then
    alter table public.post_votes
      add constraint fk_post_votes_post_id_posts
      foreign key (post_id) references public.posts(id)
      on delete cascade
      not valid;
    alter table public.post_votes validate constraint fk_post_votes_post_id_posts;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_post_votes_voter_id_profiles') then
    alter table public.post_votes
      add constraint fk_post_votes_voter_id_profiles
      foreign key (voter_id) references public.profiles(id)
      on delete restrict
      not valid;
    alter table public.post_votes validate constraint fk_post_votes_voter_id_profiles;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_post_tags_post_id_posts') then
    alter table public.post_tags
      add constraint fk_post_tags_post_id_posts
      foreign key (post_id) references public.posts(id)
      on delete cascade
      not valid;
    alter table public.post_tags validate constraint fk_post_tags_post_id_posts;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_post_tags_tag_id_tags') then
    alter table public.post_tags
      add constraint fk_post_tags_tag_id_tags
      foreign key (tag_id) references public.tags(id)
      on delete cascade
      not valid;
    alter table public.post_tags validate constraint fk_post_tags_tag_id_tags;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_posts_subcategory_tag_id_tags') then
    alter table public.posts
      add constraint fk_posts_subcategory_tag_id_tags
      foreign key (subcategory_tag_id) references public.tags(id)
      on delete set null
      not valid;
    alter table public.posts validate constraint fk_posts_subcategory_tag_id_tags;
  end if;
end $$;

-- Indexes
create index if not exists idx_comments_post_id_created_at
  on public.comments (post_id, created_at desc);

create index if not exists idx_prv_post_id_created_at
  on public.post_reaction_votes (post_id, created_at desc);

create index if not exists idx_post_votes_post_id_created_at
  on public.post_votes (post_id, created_at desc);

create index if not exists idx_posts_published_at
  on public.posts (published_at desc);

create index if not exists idx_posts_channel_published_at
  on public.posts (channel_id, published_at desc);

create index if not exists idx_posts_subcategory_tag_id
  on public.posts (subcategory_tag_id);

create index if not exists idx_post_tags_tag_id_post_id
  on public.post_tags (tag_id, post_id);

create index if not exists idx_post_tags_post_id_tag_id
  on public.post_tags (post_id, tag_id);

-- Optional RPC (useful if you want a single stable endpoint for feed/search)
create or replace function public.search_posts_v1(
  p_query text default null,
  p_channel_id smallint default null,
  p_tag_id integer default null,
  p_author_id uuid default null,
  p_sort text default 'new',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  author_id uuid,
  title text,
  slug text,
  excerpt text,
  status text,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  channel_id smallint,
  subcategory_tag_id integer,
  cover_image_url text,
  is_anonymous boolean,
  comments_count bigint,
  reactions_count bigint
)
language sql
stable
as $$
  select
    pwc.id,
    pwc.author_id,
    pwc.title,
    pwc.slug,
    pwc.excerpt,
    pwc.status,
    pwc.published_at,
    pwc.created_at,
    pwc.updated_at,
    pwc.channel_id,
    pwc.subcategory_tag_id,
    pwc.cover_image_url,
    pwc.is_anonymous,
    pwc.comments_count,
    pwc.reactions_count
  from public.posts_with_counts pwc
  where
    pwc.status = 'published'
    and pwc.published_at is not null
    and pwc.published_at <= now()
    and (p_channel_id is null or pwc.channel_id = p_channel_id)
    and (p_tag_id is null or pwc.subcategory_tag_id = p_tag_id or exists (
      select 1 from public.post_tags pt where pt.post_id = pwc.id and pt.tag_id = p_tag_id
    ))
    and (p_author_id is null or pwc.author_id = p_author_id)
    and (
      p_query is null
      or pwc.title ilike ('%' || p_query || '%')
      or (pwc.excerpt is not null and pwc.excerpt ilike ('%' || p_query || '%'))
    )
  order by
    case when p_sort = 'comments' then pwc.comments_count end desc nulls last,
    case when p_sort = 'reactions' then pwc.reactions_count end desc nulls last,
    coalesce(pwc.published_at, pwc.created_at) desc
  limit greatest(1, least(p_limit, 50))
  offset greatest(p_offset, 0);
$$;

commit;
