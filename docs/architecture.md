# Arquitectura

## Decisión de esta entrega
El entorno dispone de Node 24 con SQLite integrado; no se encontró npm ni Docker en PATH. Se implementa un servidor Node sin dependencias y SQLite para tener un circuito local verificable. Es una desviación explícita del objetivo Next.js/TypeScript/Supabase, no su sustitución definitiva. El proyecto Supabase UHEAR se creó separado en us-east-1; tiene esquema inicial y buckets privados, pero aún no participa en el runtime local.

Navegador → API mismo origen → SQLite + directorio privado de audio. Un único elemento audio persiste al cambiar vistas. Contraseñas scrypt con salt aleatorio; cookies HttpOnly SameSite=Strict, sesión de 7 días. En producción se requiere HTTPS (Secure habilitado con NODE_ENV=production), proxy y protección distribuida contra abuso. API de mutación valida Origin cuando está presente; sesiones no se entregan al JS.

Audio MP3/WAV máximo 25 MB, firma de bytes y extensión verificadas. Se almacena con UUID fuera de public. Lectura pasa por autorización en cada petición y soporta Range. Privado: solo propietario; público: descubrible; no listado: accesible por ID, ausente del catálogo. La publicación no implica procesamiento: esta versión entrega el original compatible, sin transcodificación. No subir archivos no confiables a un entorno expuesto antes de incorporar escaneo y ffprobe.

Escuchas: ticket creado por servidor para pista accesible, progreso monotónico sujeto al tiempo de pared, umbral de 30 segundos, un conteo por ticket y límite por usuario/pista/minuto. No cuenta seeks como tiempo escuchado. Sigue siendo una métrica básica manipulable por clientes automatizados; no sirve para regalías. Sesiones y métricas tienen caducidad lógica; faltan tareas de purga y política de retención.

## Objetivo cloud
Next.js + TypeScript estricto y componentes accesibles → Supabase Auth/Postgres RLS → bucket privado de masters → cola de jobs → worker FFmpeg aislado → derivados privados → firma de URLs corta/CDN. Operaciones admin solo mediante roles server-owned. Nunca service role en navegador. Migración futura requiere pruebas RLS con dos cuentas y anon, integración E2E y prueba de carga antes de exposición.

Modelo local: users, sessions, artists, tracks, favorites, playlists, playlist_tracks, playback_sessions. El esquema cloud ya contiene profiles, artists, genres, albums, tracks, playlists, playlist_tracks, favorites, follows, artist_members, storage_assets, upload_jobs, playback_events, listening_history, artist_analytics, content_reports y moderation_actions. Sus flujos de aplicación cloud están pendientes. Las tablas operativas sin grants ni políticas se mantienen cerradas a clientes.
