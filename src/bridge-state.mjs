// 同一网址的完整目录或开放范围更新时，也需要重新通知选集界面。
export const snapshotKey=(series,url)=>JSON.stringify([series.id,series.videoId,series.accessible,series.episodes,url]);
