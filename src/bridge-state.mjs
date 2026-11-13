// 同一网址的完整目录或开放范围更新时，也需要重新通知选集界面。
export const snapshotKey=(series,url)=>JSON.stringify([series.id,series.videoId,series.accessible,series.episodes,series.mode,url]);
// 官网在推荐中点分集后，会将 Swiper 内容换成同一部剧的免费分集序列。
export function playbackMode(episodes,slideIds,previous='feed'){
 const ids=[...new Set(slideIds.filter(Boolean))];
 if(ids.length<2)return previous;
 return ids.every(id=>episodes.includes(id))?'episodes':'feed';
}
