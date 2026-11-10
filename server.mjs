import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, createReadStream, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const home=process.env.UHEAR_DATA || join(root,'data'); mkdirSync(join(home,'audio'),{recursive:true});
const db=new DatabaseSync(join(home,'uhear.sqlite')); db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS artists(id TEXT PRIMARY KEY,user_id TEXT UNIQUE REFERENCES users(id),name TEXT NOT NULL,bio TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tracks(id TEXT PRIMARY KEY,artist_id TEXT REFERENCES artists(id),title TEXT NOT NULL,genre TEXT NOT NULL,visibility TEXT CHECK(visibility IN ('public','private','unlisted')),file TEXT NOT NULL,mime TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS favorites(user_id TEXT REFERENCES users(id),track_id TEXT REFERENCES tracks(id),PRIMARY KEY(user_id,track_id));
CREATE TABLE IF NOT EXISTS playlists(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS playlist_tracks(playlist_id TEXT REFERENCES playlists(id),track_id TEXT REFERENCES tracks(id),position INTEGER NOT NULL,PRIMARY KEY(playlist_id,track_id));
CREATE TABLE IF NOT EXISTS playback_sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),track_id TEXT REFERENCES tracks(id),started INTEGER,last INTEGER,seconds REAL DEFAULT 0,counted INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS tracks_artist ON tracks(artist_id); CREATE INDEX IF NOT EXISTS plays_track ON playback_sessions(track_id,user_id,started);
`);
const one=(sql,...args)=>db.prepare(sql).get(...args), all=(sql,...args)=>db.prepare(sql).all(...args), run=(sql,...args)=>db.prepare(sql).run(...args);
const rates=new Map();
function limit(key,max,window=60000){const now=Date.now();const old=rates.get(key);const v=old&&old.until>now?old:{n:0,until:now+window};if(++v.n>max)throw Object.assign(Error('Demasiadas solicitudes. Intenta más tarde.'),{status:429});rates.set(key,v);if(rates.size>10000)for(const [k,v]of rates)if(v.until<now)rates.delete(k);}
const text=(v,max=120)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw Error('Texto obligatorio o longitud inválida.');return v.trim();};
const check=(v,msg='No autorizado',status=403)=>{if(!v)throw Object.assign(Error(msg),{status});return v;};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,max=65536){const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>max)throw Object.assign(Error('Archivo demasiado grande'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
const select=`SELECT t.*,a.name artist,a.user_id owner FROM tracks t JOIN artists a ON a.id=t.artist_id`;
function track(id,user){const t=one(select+' WHERE t.id=?',id);check(t&& (t.visibility!=='private'||t.owner===user?.id),'Canción no disponible',404);return t;}
const clean=t=>{const {file,owner,...rest}=t;return rest;};
export const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
 if(method!=='GET'&&method!=='HEAD'){check(!req.headers.origin||req.headers.origin===`http://${req.headers.host}`||req.headers.origin===`https://${req.headers.host}`,'Origen no permitido');limit(req.socket.remoteAddress,150);}
 const sid=req.headers.cookie?.match(/(?:^|;\s*)uhear=([a-f0-9]+)/)?.[1];
 const user=sid?one('SELECT u.id,u.email,u.name FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires>?',sid,Date.now()):null;
 const auth=()=>check(user,'Inicia sesión para continuar',401);
 const payload=async()=>JSON.parse((await body(req)).toString());
 if(path==='/api/me'&&method==='GET')return json(res,200,{user,artist:user?one('SELECT * FROM artists WHERE user_id=?',user.id):null});
 if(['/api/register','/api/login'].includes(path)&&method==='POST'){
 limit('auth:'+req.socket.remoteAddress,15,900000);const b=await payload();const email=text(b.email,254).toLowerCase();check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Correo inválido',400);text(b.password,200);let u;
 if(path.endsWith('register')){check(b.password.length>=12,'Usa al menos 12 caracteres',400);check(!one('SELECT id FROM users WHERE email=?',email),'No se pudo registrar esta cuenta',400);const salt=randomBytes(16).toString('hex');u={id:randomUUID(),email,name:text(b.name,80)};run('INSERT INTO users VALUES(?,?,?,?)',u.id,email,salt+':'+scryptSync(b.password,salt,64).toString('hex'),u.name);}
 else {u=one('SELECT * FROM users WHERE email=?',email);const [salt,hash]=(u?.password||'invalid:'+ '00'.repeat(64)).split(':');check(timingSafeEqual(Buffer.from(hash,'hex'),scryptSync(b.password,salt,64))&&u,'Credenciales inválidas',401);}
 const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',token,u.id,Date.now()+604800000);res.setHeader('Set-Cookie',`uhear=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`);return json(res,200,{ok:true});
 }
 if(path==='/api/logout'&&method==='POST'){if(sid)run('DELETE FROM sessions WHERE id=?',sid);res.setHeader('Set-Cookie','uhear=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
 if(path==='/api/artists'&&method==='POST'){auth();const b=await payload();run('INSERT INTO artists VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,bio=excluded.bio',randomUUID(),user.id,text(b.name,80),typeof b.bio==='string'?b.bio.slice(0,1000):'');return json(res,200,{ok:true});}
 if(path==='/api/tracks'&&method==='GET'){const rows=all(select+" WHERE t.visibility='public' ORDER BY t.created DESC");const q=(url.searchParams.get('q')||'').toLowerCase();return json(res,200,rows.filter(t=>`${t.title} ${t.artist} ${t.genre}`.toLowerCase().includes(q)).map(clean));}
 if(path==='/api/studio'&&method==='GET'){auth();return json(res,200,all(select+' WHERE a.user_id=? ORDER BY t.created DESC',user.id).map(t=>({...clean(t),plays:one('SELECT count(*) n FROM playback_sessions WHERE track_id=? AND counted=1',t.id).n})));}
 if(path==='/api/upload'&&method==='POST'){
 auth();limit('upload:'+user.id,8,3600000);const a=check(one('SELECT * FROM artists WHERE user_id=?',user.id),'Primero crea tu perfil de artista',400);const title=text(url.searchParams.get('title')),genre=text(url.searchParams.get('genre'),40),visibility=url.searchParams.get('visibility');check(['public','private','unlisted'].includes(visibility),'Visibilidad inválida',400);
 const bytes=await body(req,25*1024*1024);const wav=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE';const mp3=bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224);check((wav||mp3)&&bytes.length>44,'Solo MP3 o WAV con cabecera válida',400);
 const id=randomUUID(),file=id+(wav?'.wav':'.mp3');writeFileSync(join(home,'audio',file),bytes,{flag:'wx'});run('INSERT INTO tracks VALUES(?,?,?,?,?,?,?,?)',id,a.id,title,genre,visibility,file,wav?'audio/wav':'audio/mpeg',Date.now());return json(res,201,{id});
 }
 if(path.startsWith('/api/tracks/')&&method==='PATCH'){auth();const t=track(path.split('/').pop(),user);check(t.owner===user.id);const b=await payload();check(['public','private','unlisted'].includes(b.visibility),'Visibilidad inválida',400);run('UPDATE tracks SET visibility=? WHERE id=?',b.visibility,t.id);return json(res,200,{ok:true});}
 if(path==='/api/library'&&method==='GET'){auth();return json(res,200,{favorites:all(select+' JOIN favorites f ON f.track_id=t.id WHERE f.user_id=? AND (t.visibility<>\'private\' OR a.user_id=?)',user.id,user.id).map(clean),playlists:all('SELECT * FROM playlists WHERE user_id=?',user.id).map(p=>({...p,tracks:all(select+' JOIN playlist_tracks pt ON pt.track_id=t.id WHERE pt.playlist_id=? AND (t.visibility<>\'private\' OR a.user_id=?) ORDER BY pt.position',p.id,user.id).map(clean)}))});}
 if(path==='/api/favorite'&&method==='POST'){auth();const b=await payload();track(b.id,user);if(b.saved)run('INSERT OR IGNORE INTO favorites VALUES(?,?)',user.id,b.id);else run('DELETE FROM favorites WHERE user_id=? AND track_id=?',user.id,b.id);return json(res,200,{ok:true});}
 if(path==='/api/playlists'&&method==='POST'){auth();const b=await payload();const id=randomUUID();run('INSERT INTO playlists VALUES(?,?,?)',id,user.id,text(b.name,80));return json(res,201,{id});}
 if(path==='/api/playlist-track'&&method==='POST'){auth();const b=await payload();check(one('SELECT id FROM playlists WHERE id=? AND user_id=?',b.playlist,user.id));track(b.track,user);run('INSERT OR IGNORE INTO playlist_tracks VALUES(?,?,?)',b.playlist,b.track,Date.now());return json(res,200,{ok:true});}
 if(path==='/api/listen'&&method==='POST'){auth();const b=await payload();track(b.track,user);limit('play:'+user.id,60);const id=randomUUID(),now=Date.now();run('INSERT INTO playback_sessions(id,user_id,track_id,started,last) VALUES(?,?,?,?,?)',id,user.id,b.track,now,now);return json(res,201,{id});}
 if(path==='/api/heartbeat'&&method==='POST'){auth();const b=await payload();const p=check(one('SELECT * FROM playback_sessions WHERE id=? AND user_id=?',b.id,user.id));track(p.track_id,user);const now=Date.now(),delta=Math.min(6,(now-p.last)/1000),sec=p.seconds+delta;const duplicate=one('SELECT id FROM playback_sessions WHERE user_id=? AND track_id=? AND counted=1 AND started>? AND id<>?',user.id,p.track_id,now-60000,p.id);run('UPDATE playback_sessions SET last=?,seconds=?,counted=? WHERE id=?',now,sec,p.counted||((sec>=30&&!duplicate)?1:0),p.id);return json(res,200,{ok:true});}
 if(path.startsWith('/audio/')&&['GET','HEAD'].includes(method)){
 const t=track(path.split('/').pop(),user),file=join(home,'audio',t.file),size=statSync(file).size;let start=0,end=size-1,status=200;
 if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m)return res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end||start>=size)return res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}
 res.writeHead(status,{'Content-Type':t.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, no-store'});if(method==='HEAD')return res.end();return createReadStream(file,{start,end}).pipe(res);
 }
 if(path.startsWith('/api/'))return json(res,404,{error:'Ruta no encontrada'});
 const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/logo.png':'logo.png'};const asset=assets[path];if(!asset)return json(res,404,{error:'No encontrado'});const types={'html':'text/html; charset=utf-8','js':'text/javascript','css':'text/css','png':'image/png'};res.writeHead(200,{'Content-Type':types[asset.split('.').pop()]});res.end(readFileSync(join(root,'public',asset)));
 }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.status===500?'Error interno':e.message});else res.destroy();}
});
if(process.env.NODE_ENV!=='test')server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`UHEAR: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3000}`));
