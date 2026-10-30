import { Injectable, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { execFileSync } from 'node:child_process';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import type { CurrentAdmin } from '../auth/admin-auth.types';

const escapeHtml = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const BUCKET = 'www.chapatupremio.com';
const ORIGIN = 'https://www.pgoapp.com';
const LIST_BEGIN = '<!-- PGO-CMS-MANAGED-BEGIN -->';
const LIST_END = '<!-- PGO-CMS-MANAGED-END -->';

@Injectable()
export class BlogPublisherService {
  private readonly s3 = new S3Client({region: 'us-east-1'});
  private async invalidate(slug:string) {
    const paths=[`/blog/${slug}/`,`/blog/${slug}/index.html`,`/blog/cms-feed.json`,`/blog/`,`/blog/index.html`,`/sitemap.xml`];
    execFileSync('aws',['cloudfront','create-invalidation','--distribution-id','E2E6GM9IA90XVE','--paths',...paths,'--region','us-east-1'],{timeout:25000,stdio:'pipe'});
  }
  constructor(private readonly prisma:PrismaService, private readonly audit:AdminAuditService){}
  private async fetch(key:string) {
    try {const obj = await this.s3.send(new GetObjectCommand({Bucket:BUCKET, Key:key}));return await obj.Body!.transformToString();}
    catch(e:any){if(e?.name==='NoSuchKey'||e?.name==='NotFound'||e?.$metadata?.httpStatusCode===404)return null;throw e;}
  }
  private async write(key:string, body:string, type:string) {
    await this.s3.send(new PutObjectCommand({Bucket:BUCKET,Key:key,Body:Buffer.from(body,'utf8'),ContentType:type,CacheControl:'no-cache, max-age=0'}));
  }
  private coverUrl(raw: string | null | undefined) {
    const value = String(raw ?? '').trim();
    if (!value) return '';
    try {
      const u = new URL(value, ORIGIN);
      if (u.origin !== ORIGIN || !/^\/(?:assets)\//.test(u.pathname)) return '';
      return u.href;
    } catch { return ''; }
  }
  private render(a:any) {
    const url=`${ORIGIN}/blog/${a.slug}/`;
    const title=a.seoTitle||a.title;
    const description=a.seoDescription||a.excerpt;
    // Allow only structural, attribute-free tags from the CMS editor.
    const safeContent=escapeHtml(a.contentHtml).replace(/&lt;(\/?)(p|h2|h3|h4|ul|li|strong|em)&gt;/gi, '<$1$2>');
    const image = this.coverUrl(a.coverImageUrl);
    const json=JSON.stringify({'@context':'https://schema.org','@type':'BlogPosting',headline:a.title,description,mainEntityOfPage:url,...(image?{image}:{}),inLanguage:'es-PE',publisher:{'@type':'Organization',name:'PGO',url:ORIGIN}}).replace(/</g,'\\u003c');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${url}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(a.title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${url}">${image?`<meta property="og:image" content="${escapeHtml(image)}">`:''}<link rel="stylesheet" href="/assets/css/styles.css"><link rel="stylesheet" href="/assets/css/blog-editorial.css"><link rel="stylesheet" href="/assets/css/blog-article-pgo.css"><script src="/assets/js/blog-article-pgo.js" defer></script><script type="application/ld+json">${json}</script></head><body><header class="container"><a href="/">PGO</a> · <a href="/blog/">Blog</a></header><main class="container pgo-managed-article"><article><p>${escapeHtml(a.category)}</p><h1>${escapeHtml(a.title)}</h1><p>${escapeHtml(a.excerpt)}</p><div>${safeContent}</div></article><p><a href="/blog/">Volver al blog</a></p></main></body></html>`;
  }
  private async feed() {
    const content=await this.fetch('blog/cms-feed.json');
    if(!content) return [] as any[];
    const data=JSON.parse(content);
    if(!Array.isArray(data))throw new ConflictException('Índice CMS inválido; publicación detenida');
    return data;
  }
  private async syncPublicCatalog() {
    // Preserve the editorial HTML outside a single CMS-owned region.
    const rows = await this.prisma.blogArticle.findMany({where:{status:'PUBLISHED',deletedAt:null},orderBy:{updatedAt:'desc'}});
    const existingIndex = await this.fetch('blog/index.html');
    if (!existingIndex || !/<\/body>/i.test(existingIndex)) throw new ConflictException('Índice blog no compatible; no se sobrescribe');
    const region = `${LIST_BEGIN}<section id="pgo-cms-articles" aria-label="Artículos PGO CMS"><h2>Más artículos de PGO</h2><ul>${rows.map(a => `<li><a href="/blog/${escapeHtml(a.slug)}/">${escapeHtml(a.title)}</a> — ${escapeHtml(a.excerpt)}</li>`).join('')}</ul></section>${LIST_END}`;
    let index = existingIndex;
    if (index.includes(LIST_BEGIN) && index.includes(LIST_END)) {
      index = index.replace(/<!-- PGO-CMS-MANAGED-BEGIN -->[\s\S]*?<!-- PGO-CMS-MANAGED-END -->/, region);
    } else {
      index = index.replace(/<\/body>/i, `${region}</body>`);
    }
    const existingMap = await this.fetch('sitemap.xml');
    if (!existingMap || !/<\/urlset>/i.test(existingMap)) throw new ConflictException('Sitemap no compatible; no se sobrescribe');
    const owned = new Set(rows.map(a=>`${ORIGIN}/blog/${a.slug}/`));
    // Only remove URLs that belong to CMS (including archived). Legacy blog URLs remain intact.
    const all = await this.prisma.blogArticle.findMany({select:{slug:true}});
    const cms = new Set(all.map(a=>`${ORIGIN}/blog/${a.slug}/`));
    let sitemap = existingMap.replace(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g,(block,url)=>cms.has(url.replace(/&amp;/g,'&')) ? '' : block);
    const entries = [...owned].map(url=>`<url><loc>${escapeHtml(String(url))}</loc></url>`).join('');
    sitemap=sitemap.replace(/<\/urlset>/i,`${entries}</urlset>`);
    // Put checked public copies into the CMS backup namespace before changing shared files.
    const stamp=Date.now();
    await this.write(`blog/cms-backups/catalog/${stamp}-index.html`,existingIndex,'text/html; charset=utf-8');
    await this.write(`blog/cms-backups/catalog/${stamp}-sitemap.xml`,existingMap,'application/xml; charset=utf-8');
    await this.write('blog/index.html',index,'text/html; charset=utf-8');
    await this.write('sitemap.xml',sitemap,'application/xml; charset=utf-8');
  }
  private async writeTombstones() {
    const rows=await this.prisma.blogArticle.findMany({where:{status:{not:'PUBLISHED'}},select:{slug:true}});
    await this.write('blog/cms-tombstones.json',JSON.stringify({updatedAt:new Date().toISOString(),slugs:rows.map(a=>a.slug)},null,2),'application/json; charset=utf-8');
  }
  private async refreshFeed() {
    const items=await this.prisma.blogArticle.findMany({where:{status:'PUBLISHED',deletedAt:null},orderBy:{updatedAt:'desc'}});
    const data=items.map(a=>({id:a.id,slug:a.slug,url:`/blog/${a.slug}/`,title:a.title,excerpt:a.excerpt,category:a.category,coverImageUrl:this.coverUrl(a.coverImageUrl),updatedAt:a.updatedAt.toISOString()}));
    await this.write('blog/cms-feed.json',JSON.stringify(data,null,2),'application/json; charset=utf-8');
    await this.syncPublicCatalog();
    await this.writeTombstones();
    return data;
  }
  async publish(id:string, admin:CurrentAdmin) {
    const article=await this.prisma.blogArticle.findFirst({where:{id,deletedAt:null}});
    if(!article)throw new NotFoundException('Artículo no encontrado');
    if(!article.contentHtml?.trim()||!article.seoDescription?.trim())throw new ConflictException('Completa contenido y SEO antes de publicar');
    const key=`blog/${article.slug}/index.html`;
    const previous=await this.fetch(key);
    // Existing public articles not previously managed by this CMS cannot be overwritten.
    if(previous!==null && article.status!=='PUBLISHED')throw new ConflictException('La URL ya existe en S3. No se sobrescriben artículos ajenos al CMS');
    const backup=previous===null?null:`blog/cms-backups/${article.id}/${Date.now()}.html`;
    if(backup)await this.write(backup,previous!,'text/html; charset=utf-8');
    await this.write(key,this.render(article),'text/html; charset=utf-8');
    try {
      await this.prisma.blogArticle.update({where:{id},data:{status:'PUBLISHED',updatedByAdminId:admin.id}});
      await this.refreshFeed();
      await this.invalidate(article.slug);
      await this.audit.log({adminUserId:admin.id,action:'BLOG_PUBLISHED',entityType:'BLOG',entityId:id,metadata:{slug:article.slug,backup}});
    }catch(e){throw new InternalServerErrorException('HTML publicado, pero no se completó la sincronización del catálogo. Requiere reconciliación');}
    return {id,status:'PUBLISHED',url:`${ORIGIN}/blog/${article.slug}/`,backup};
  }
  async archive(id:string,admin:CurrentAdmin) {
    const a=await this.prisma.blogArticle.findUnique({where:{id}});
    if(!a || a.deletedAt)throw new NotFoundException('Artículo no encontrado');
    if(a.status==='PUBLISHED')await this.unpublish(id,admin);
    await this.prisma.blogArticle.update({where:{id},data:{status:'ARCHIVED',deletedAt:new Date(),updatedByAdminId:admin.id}});
    await this.refreshFeed();
    await this.invalidate(a.slug);
    await this.audit.log({adminUserId:admin.id,action:'BLOG_ARCHIVED',entityType:'BLOG',entityId:id,metadata:{slug:a.slug}});
    return {id,status:'ARCHIVED'};
  }
  async restoreArchived(id:string,admin:CurrentAdmin) {
    const a=await this.prisma.blogArticle.findUnique({where:{id}});
    if(!a?.deletedAt)throw new NotFoundException('Artículo archivado no encontrado');
    const restored=await this.prisma.blogArticle.update({where:{id},data:{status:'DRAFT',deletedAt:null,updatedByAdminId:admin.id}});
    await this.refreshFeed();
    return restored;
  }
  async unpublish(id:string,admin:CurrentAdmin) {
    const a=await this.prisma.blogArticle.findFirst({where:{id,deletedAt:null}});
    if(!a)throw new NotFoundException('Artículo no encontrado');
    if(a.status!=='PUBLISHED')throw new ConflictException('Este artículo no está publicado por el CMS');
    const key=`blog/${a.slug}/index.html`;
    const previous=await this.fetch(key);
    const backup=previous===null?null:`blog/cms-backups/${a.id}/${Date.now()}.html`;
    if(backup)await this.write(backup,previous!,'text/html; charset=utf-8');
    await this.s3.send(new DeleteObjectCommand({Bucket:BUCKET,Key:key}));
    await this.prisma.blogArticle.update({where:{id},data:{status:'DRAFT',updatedByAdminId:admin.id}});
    await this.refreshFeed();
    await this.invalidate(a.slug);
    await this.audit.log({adminUserId:admin.id,action:'BLOG_UNPUBLISHED',entityType:'BLOG',entityId:id,metadata:{slug:a.slug,backup}});
    return {id,status:'DRAFT',backup};
  }
}
