# Investigación · 10 noviembre 2026

## Evidencia pública y límites
La [Web API oficial de Spotify](https://developer.spotify.com/documentation/web-api) documenta metadatos, búsqueda, bibliotecas, playlists y control de reproducción. No documenta la topología completa de producción, sus bases internas ni su pipeline de transcodificación. No se atribuyen esas decisiones a Spotify. Su API no concede derechos para redistribuir grabaciones ni constituye el backend de UHEAR.

[SoundCloud](https://help.soundcloud.com/hc/en-us/articles/115003452667-Sharing-a-public-track-or-playlist-within-SoundCloud) distingue pistas públicas y privadas; las privadas no aparecen en búsquedas. La [programación](https://help.soundcloud.com/hc/en-us/articles/360055603414-Schedule-a-Release-Date) tiene requisitos de plan. UHEAR prioriza publicación propia inmediata y visibilidad explícita. [Apple Music for Artists](https://artists.apple.com/support/) documenta equipos, imágenes y herramientas para artistas. UHEAR debe separar identidad artística, miembros y propiedad de contenido.

## Entrega de audio
[MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery) describe entrega con HTML audio y mecanismos adaptativos. Para un catálogo inicial, MP3 progresivo con HTTP Range es simple y ampliamente compatible; HLS requiere empaquetado, variantes y gestión de segmentos. WAV es apropiado como master, pero costoso en transferencia; AAC/MP3 son candidatos a reproducción y Opus requiere evaluar compatibilidad.

[Supabase Storage](https://supabase.com/docs/guides/storage/serving/downloads) permite buckets privados y URLs temporales. [RLS de Storage](https://supabase.com/docs/guides/storage/security/access-control) controla acceso. Una URL firmada es un bearer token válido hasta su expiración: no equivale a DRM. La retirada inmediata requiere un proxy de autorización o expiración breve. Nunca usar URLs públicas permanentes para contenido privado.

## Producto y costes
Esenciales: cuenta, artista, subida autorizada, publicación, búsqueda, reproducción persistente, favoritos y playlists. Diferenciación: descubrimiento editorial transparente, identidad independiente y herramientas claras para publicar. No presentar listas como IA ni inventar oyentes o tendencias. El MVP local inicia vacío, sin música de terceros.

Almacenamiento aproximado = masters + derivados + portadas. Transferencia = reproducciones × duración × bitrate/8; 1.000 escuchas completas de 4 minutos a 192 kbps representan unos 5,76 GB, sin overhead. No es una cotización. Workers deben ejecutar ffprobe, validar bytes reales, transcodificar en sandbox y producir resultados idempotentes; no usar Edge Functions como proceso FFmpeg prolongado. CDN y HLS se incorporan cuando la medición lo justifique.
