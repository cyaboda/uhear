# UHEAR
Music deserves to be heard.

Primera implementación **local**, con datos persistentes y API real. No es una entrega completa de todas las fases del encargo ni una aplicación cloud integrada. Interfaz y API están implementadas; la revisión visual en navegador fue bloqueada por el control de acceso del navegador y no se completó.

## Ejecutar
Requiere Node.js 24 o posterior. No requiere instalar paquetes.

```powershell
node server.mjs
```

Abrir http://127.0.0.1:3000 en el navegador del mismo equipo. Crear cuenta con contraseña de al menos 12 caracteres → Artist Studio → guardar perfil → subir MP3/WAV propio → cambiar visibilidad a Pública → Explorar → reproducir. Los datos y archivos quedan en `data/`, ignorado por Git. Detener con Ctrl+C. No ejecutar dos instancias con el mismo directorio de datos.

```powershell
node --test
node --check server.mjs
node --check public/app.js
```

Scripts equivalentes en package.json para un entorno con npm: dev, start, build y test. `build` comprueba sintaxis; no genera bundles. JavaScript nativo y SQLite son una desviación temporal de Next.js/TypeScript/Supabase. No hay dependencias externas ni lockfile necesario.

## Qué se comprobó
Pruebas HTTP contra servidor real con base de prueba separada: registro, cookie HttpOnly, autenticación obligatoria, rechazo de Origin externo, perfil artístico, subida WAV sintético, permisos privados con dos cuentas, Range 206/416, publicación y búsqueda, favoritos, playlists sin duplicados, protección de playlists ajenas, métricas incompletas en cero, conteo y deduplicación con reloj de base de prueba controlado, rechazo de bytes inválidos y logout. Las pruebas no verifican renderizado ni decodificación de audio en un navegador real.

## Estado por funcionalidad
| Función | Estado |
|---|---|
| Registro, login, logout y sesiones | API local probada; sin correo de verificación |
| Perfil de artista y subida/publicación | API local probada; sin transcodificación |
| Búsqueda por título, artista y género | API local probada |
| Entrega de audio y acceso privado | API local probada; reproducción audible en navegador pendiente |
| Favoritos y playlists | API local probada |
| Métricas de 30 segundos y deduplicación básica | API probada con reloj controlado; sin garantía antifraude |
| Mini reproductor, controles, cola, temas, Media Session | Código implementado; QA de navegador pendiente |
| Álbumes, EP, follows, historial visible, portadas, equipos | Sin interfaz ni flujos completos |
| Recuperación de contraseña, ajustes de cuenta, administración y moderación | Pendientes |
| Next.js, TypeScript estricto, Tailwind, frontend conectado a Supabase | Pendientes |
| Publicación web y GitHub remoto | Pendientes |

## Supabase independiente
Se creó **uhear**, ref `mtooxcwymdkyjivkqulm`, us-east-1, en la organización elegida por el usuario, BRAINSTORMVAULT. Cotización de creación: USD 0/mes; no constituye garantía sobre consumo futuro. No se modificó brainstorm-vault.

Se aplicó la migración remota `20261110154922_uhear_bootstrap_v1`, cuya copia exacta está en `supabase/migrations/`. Se verificaron 17 tablas con RLS y los buckets privados `uhear-masters` y `uhear-playback`, con límite de 25 MB. El esquema sirve de base y no está conectado a la app local. No volver a ejecutar la migración sobre este proyecto ya inicializado.

Los asesores de seguridad devolvieron 8 avisos informativos `rls_enabled_no_policy` en tablas operativas. Es intencional: sin grants a anon/authenticated y sin políticas, se deniega su acceso; están reservadas para un backend todavía pendiente. No se afirma una auditoría completa ni pruebas RLS end-to-end con usuarios cloud. [Explicación del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Auth existe como servicio de Supabase, pero faltan configurar URLs de retorno, correo, recuperación y cliente. Storage no concede lectura de derivados hasta implementar un endpoint que autorice y firme. Publicación y estados de procesamiento son server-owned: el cliente no puede marcar una pista ready. No se incluyeron claves secretas ni service role.

## GitHub
Repositorio Git local en rama `develop`, con commits organizados. El conector disponible permite archivos/ramas/commits/PRs en repos existentes, pero **no crear repositorios**. No se encontró gh instalado. Paso manual necesario: crear un repositorio privado vacío llamado `uhear` en la cuenta deseada y facilitar su URL. Después se podrá añadir el remoto y publicar la rama; no se ha hecho push ni creado PR.

## Límites de seguridad y operación
Solo escuchar en loopback por defecto. No exponer este runtime a Internet: faltan HTTPS gestionado, cuotas de almacenamiento por usuario, escaneo/ffprobe en sandbox, rate limiting distribuido, backups y observabilidad. Validar una cabecera no demuestra integridad completa de un archivo. Sesiones locales duran siete días; no hay flujo de recuperación por correo. No hay cuentas admin predefinidas ni credenciales de demostración.

Las URLs de audio pasan por autorización por petición; una reproducción ya entregada no se puede revocar retroactivamente. No hay DRM. Audio propio únicamente. Los contadores no son aptos para pagos o regalías. Listas editoriales y géneros son explícitos; no se simulan tendencias, usuarios o IA.

Ver `docs/research.md`, `docs/architecture.md` y `docs/roadmap.md` para fuentes, decisiones y fases pendientes.
