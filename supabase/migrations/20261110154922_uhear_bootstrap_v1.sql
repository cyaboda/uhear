-- UHEAR bootstrap v1. Applied only to the dedicated UHEAR project.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 80)
);
create table public.artists (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null check(length(name) between 1 and 80),
 bio text not null default '' check(length(bio)<=1000),
 created_at timestamptz not null default now()
);
create index artists_owner_idx on public.artists(owner_id);
create table public.genres(id smallint generated always as identity primary key,name text not null unique);
insert into public.genres(name) values ('Electrónica'),('Indie'),('Ambient'),('Jazz'),('Hip-hop'),('Otro');
create table public.albums (
 id uuid primary key default gen_random_uuid(),
 artist_id uuid not null references public.artists(id),
 title text not null check(length(title) between 1 and 120),
 kind text not null check(kind in ('single','ep','album')),
 created_at timestamptz not null default now()
);
create index albums_artist_idx on public.albums(artist_id);
create table public.tracks (
 id uuid primary key default gen_random_uuid(),
 artist_id uuid not null references public.artists(id),
 album_id uuid references public.albums(id),
 genre_id smallint references public.genres(id),
 title text not null check(length(title) between 1 and 120),
 visibility text not null default 'private' check(visibility in ('public','private','unlisted')),
 status text not null default 'pending' check(status in ('pending','processing','ready','failed','suspended')),
 duration_seconds numeric check(duration_seconds>0),
 created_at timestamptz not null default now()
);
create index tracks_artist_idx on public.tracks(artist_id);
create index tracks_album_idx on public.tracks(album_id);
create index tracks_genre_idx on public.tracks(genre_id);
create index tracks_catalog_idx on public.tracks(created_at desc) where status='ready' and visibility='public';
create table public.playlists(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),name text not null check(length(name) between 1 and 80));
create index playlists_owner_idx on public.playlists(owner_id);
create table public.playlist_tracks(playlist_id uuid references public.playlists(id) on delete cascade,track_id uuid references public.tracks(id),position integer not null check(position>=0),primary key(playlist_id,track_id),unique(playlist_id,position));
create index playlist_tracks_track_idx on public.playlist_tracks(track_id);
create table public.favorites(user_id uuid references auth.users(id) on delete cascade,track_id uuid references public.tracks(id),primary key(user_id,track_id));
create index favorites_track_idx on public.favorites(track_id);
create table public.follows(user_id uuid references auth.users(id) on delete cascade,artist_id uuid references public.artists(id),primary key(user_id,artist_id));
create index follows_artist_idx on public.follows(artist_id);
-- Internal operational records: no client grants, no client policies.
create table public.artist_members(artist_id uuid references public.artists(id),user_id uuid references auth.users(id),role text not null check(role in ('editor','analyst')),primary key(artist_id,user_id));
create table public.storage_assets(id uuid primary key default gen_random_uuid(),track_id uuid not null references public.tracks(id),owner_id uuid not null references auth.users(id),object_path text not null unique,kind text not null check(kind in ('master','playback','cover')),bytes bigint not null check(bytes>0));
create table public.upload_jobs(id uuid primary key default gen_random_uuid(),asset_id uuid not null references public.storage_assets(id),status text not null default 'queued' check(status in ('queued','running','ready','failed')),attempts integer not null default 0 check(attempts between 0 and 5),error_code text);
create table public.playback_events(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),track_id uuid not null references public.tracks(id),session_id uuid not null,event_sequence integer not null check(event_sequence>=0),listened_seconds numeric not null check(listened_seconds>=0),qualified boolean not null default false,created_at timestamptz not null default now(),unique(session_id,event_sequence));
create table public.listening_history(user_id uuid references auth.users(id),track_id uuid references public.tracks(id),last_listened_at timestamptz not null,primary key(user_id,track_id));
create table public.artist_analytics(artist_id uuid references public.artists(id),day date not null,qualified_plays bigint not null check(qualified_plays>=0),primary key(artist_id,day));
create table public.content_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid not null references auth.users(id),track_id uuid not null references public.tracks(id),reason text not null check(length(reason) between 1 and 2000),created_at timestamptz not null default now());
create table public.moderation_actions(id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id),track_id uuid not null references public.tracks(id),action text not null,reason text not null,created_at timestamptz not null default now());
do $$ declare t text; begin foreach t in array array['profiles','artists','genres','albums','tracks','playlists','playlist_tracks','favorites','follows','artist_members','storage_assets','upload_jobs','playback_events','listening_history','artist_analytics','content_reports','moderation_actions'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);end loop;end $$;
grant select on public.artists,public.genres,public.tracks,public.albums to anon,authenticated;
grant select,insert,update on public.profiles,public.artists,public.playlists to authenticated;
grant select,insert,delete on public.favorites,public.follows,public.playlist_tracks to authenticated;
grant insert on public.tracks to authenticated;
create policy profiles_self on public.profiles for all to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy artists_read on public.artists for select to anon,authenticated using(true);
create policy artists_insert on public.artists for insert to authenticated with check(owner_id=(select auth.uid()));
create policy artists_update on public.artists for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy genres_read on public.genres for select to anon,authenticated using(true);
create policy albums_read on public.albums for select to anon,authenticated using(exists(select 1 from public.artists a where a.id=artist_id and a.owner_id=(select auth.uid())) or exists(select 1 from public.tracks t where t.album_id=albums.id and t.status='ready' and t.visibility='public'));
create policy tracks_read on public.tracks for select to anon,authenticated using((status='ready' and visibility='public') or exists(select 1 from public.artists a where a.id=artist_id and a.owner_id=(select auth.uid())));
-- Publication and ready/suspended states are server-owned. No client UPDATE grant.
create policy tracks_insert on public.tracks for insert to authenticated with check(status='pending' and visibility='private' and exists(select 1 from public.artists a where a.id=artist_id and a.owner_id=(select auth.uid())) and (album_id is null or exists(select 1 from public.albums al where al.id=album_id and al.artist_id=tracks.artist_id)));
create policy playlists_self on public.playlists for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy favorites_self on public.favorites for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.tracks t where t.id=track_id));
create policy follows_self on public.follows for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy playlist_tracks_self on public.playlist_tracks for all to authenticated using(exists(select 1 from public.playlists p where p.id=playlist_id and p.owner_id=(select auth.uid()))) with check(exists(select 1 from public.playlists p where p.id=playlist_id and p.owner_id=(select auth.uid())) and exists(select 1 from public.tracks t where t.id=track_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('uhear-masters','uhear-masters',false,26214400,array['audio/mpeg','audio/wav','audio/x-wav']),('uhear-playback','uhear-playback',false,26214400,array['audio/mpeg','audio/mp4','audio/ogg']);
create policy uhear_master_insert on storage.objects for insert to authenticated with check(bucket_id='uhear-masters' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy uhear_master_read on storage.objects for select to authenticated using(bucket_id='uhear-masters' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Playback bucket denied to client roles until an authorized signing endpoint exists.
