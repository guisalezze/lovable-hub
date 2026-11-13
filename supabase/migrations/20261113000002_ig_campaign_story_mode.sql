-- Campanha só de DM e resposta de story (sem post): post_mode = 'story'.
alter table public.ig_campaigns drop constraint if exists ig_campaigns_post_mode_check;
alter table public.ig_campaigns
  add constraint ig_campaigns_post_mode_check
  check (post_mode in ('post', 'any', 'next_reel', 'story'));

-- No modo story a campanha só dispara por DM/story, que exigem palavra-chave.
alter table public.ig_campaigns drop constraint if exists ig_campaigns_story_needs_keywords;
alter table public.ig_campaigns
  add constraint ig_campaigns_story_needs_keywords
  check (post_mode <> 'story' or (dm_trigger and cardinality(keywords) > 0));
