// 仅接管视频画布上的竖向滚轮；菜单、选集、进度、音量和页面滚动保持官网行为。
export function installWheelNavigation({episode,feed,disabled},root=document){
 let amount=0,direction=0,last=0,switched=0;
 const wheel=event=>{
  if(disabled?.()||event.ctrlKey||event.metaKey||event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  const feedArea=event.target?.closest?.('[data-feed-playback-toggle]'),target=feedArea||event.target?.closest?.('.xgplayer');
  if(!target||!(feedArea?root.querySelector('.swiper-slide-active video'):target.querySelector('video'))||event.target.closest('input,textarea,select,[contenteditable="true"],dialog,.xgplayer-controls,.xgplayer-progress,.xgplayer-volume,[role="slider"]'))return;
  const now=Date.now(),delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1),next=Math.sign(delta);
  if(!next)return;
  if(now-last>200||next!==direction)amount=0;
  last=now;direction=next;amount+=Math.abs(delta);
  if(now-switched<700){event.preventDefault();event.stopImmediatePropagation();return;}
  if(amount<45)return;
  const changed=feedArea||target.closest('.swiper-slide-active')?feed(next):episode(next);
  amount=0;
  if(changed){switched=now;event.preventDefault();event.stopImmediatePropagation();}
 };
 root.addEventListener('wheel',wheel,{capture:true,passive:false});
 return ()=>root.removeEventListener('wheel',wheel,true);
}
