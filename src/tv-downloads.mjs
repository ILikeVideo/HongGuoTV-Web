import qrcode from 'qrcode-generator';
// 在官网 React 根节点处理前接住点击，由扩展打开标签页，避免被原站下载动作截获。
document.addEventListener('click',event=>{
 const link=event.target.closest?.('#hg-tv-download,#hg-tv-tab,.hg-tv-qr-link,.hg-tv-direct-download');
 if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 event.preventDefault();event.stopImmediatePropagation();
 void chrome.runtime.sendMessage({type:'ShellOpenTV'}).catch(()=>{});
},true);
function openInTab(link){link.target='_blank';link.rel='noopener noreferrer';}
export function tvDownloads(config){
 const url=config.tvWebsite;
 const hero=document.querySelector('button[class*="pc-hero-download-"][data-hg-site-ready]');
 if(hero&&!hero.classList.contains('hg-tv-native-download'))hero.classList.add('hg-tv-native-download');
 if(hero&&!document.querySelector('#hg-tv-download')){const a=document.createElement('a');a.id='hg-tv-download';a.className='hg-tv-hero-download';a.textContent='下载红果TV电视版 App';a.href=url;a.target='_blank';a.rel='noopener noreferrer';hero.before(a);const update=()=>{const style=getComputedStyle(hero),top=parseFloat(style.top);if(Number.isFinite(top))a.style.top=Math.max(0,top)+'px';};new ResizeObserver(update).observe(hero.parentElement);update();}
 const action=document.querySelector('#hg-tv-download');if(action){if(action.href!==url)action.href=url;openInTab(action);}
 const header=document.querySelector('header'),download=header&&[...header.querySelectorAll('*')].find(n=>n.textContent.trim()==='下载'&&![...n.children].some(child=>child.textContent.trim()==='下载'));
 if(download){
  let tab=header.querySelector('#hg-tv-tab');
  if(!tab){tab=document.createElement('a');tab.id='hg-tv-tab';const reference=header.querySelector('a[href*="/rank/"]')||header.querySelector('a[href="/"]');tab.className=(reference?.className??'')+' hg-tv-tab';tab.textContent='红果TV电视版';const group=header.querySelector('[data-hg-site-tabs]')||header.querySelector('#hg-my-tab')?.parentElement;const wrapper=group&&[...group.children].find(child=>child===download||child.contains(download));(wrapper||download.closest('[class*="pc-download-"]')||download).insertAdjacentElement('afterend',tab);}
  if(tab.href!==url)tab.href=url;openInTab(tab);
 }
 for(const guide of document.querySelectorAll('[class*="pc-download-"] [class*="pc-guide-box-"][data-hg-site-ready]')){
  const old=guide.querySelector(':scope > [data-hg-tv-card]');if(old?.dataset.target===url&&old.querySelector('.hg-tv-direct-download'))continue;old?.remove();
  const native=[...guide.children].find(n=>n.querySelector('svg'));if(!native)continue;
  const card=native.cloneNode(true);card.setAttribute('data-hg-tv-card','true');card.dataset.target=url;card.classList.add('hg-tv-download-card');
  for(const script of card.querySelectorAll('script,iframe,object'))script.remove();
  const logo=card.querySelector('img'),brand=document.createElement('div');brand.className=(logo?.className??'')+' hg-tv-download-brand';const icon=document.createElement('img');icon.src=chrome.runtime.getURL('logo.png');icon.alt='';const title=document.createElement('strong');title.textContent='红果TV电视版';brand.append(icon,title);logo?.replaceWith(brand);
  const qr=qrcode(0,'M');qr.addData(url);qr.make();const svg=new DOMParser().parseFromString(qr.createSvgTag({cellSize:4,margin:2,scalable:true}),'image/svg+xml').documentElement;svg.setAttribute('aria-label','红果TV电视版官网二维码');svg.setAttribute('role','img');const link=document.createElement('a');link.href=url;link.className='hg-tv-qr-link';openInTab(link);link.append(document.importNode(svg,true));card.querySelector('svg')?.replaceWith(link);
  for(const image of card.querySelectorAll('img'))if(image!==icon)image.remove();
  const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){if(text.parentElement.closest('svg,.hg-tv-download-brand'))continue;if(/扫码/.test(text.textContent))text.textContent='扫码访问「红果TV电视版」官网';else if(/海量|免费|App/.test(text.textContent))text.textContent='把喜欢的短剧，带到电视上看';}
  const direct=document.createElement('a');direct.className='hg-tv-direct-download';direct.textContent='直接官网下载';direct.href=url;openInTab(direct);
  let qrContainer=link;while(qrContainer.parentElement&&qrContainer.parentElement!==card)qrContainer=qrContainer.parentElement;qrContainer.after(direct);
  if(!guide.classList.contains('hg-tv-download-group'))guide.classList.add('hg-tv-download-group');guide.prepend(card);
 }
}
