// 远程仅下发数据。新 DOM 操作和底层监听能力仍需更新固定适配器。
import {adHttps} from '../src/ad-policy.mjs';
export const DEFAULT_SITE_CONFIG=Object.freeze({schemaVersion:1,myLabel:'我的',myTitle:'我的',rankSelector:'header a[href*="/rank/"],nav a[href*="/rank/"]',accent:'#ff9a4e',cardMinWidth:230,tvWebsite:'https://hongguotv.curatedlifefinds.com/'});
export function siteConfig(value){
  const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const text=(key,max)=>typeof v[key]==='string'&&v[key].trim().length&&v[key].length<=max?v[key]:DEFAULT_SITE_CONFIG[key];
 return {schemaVersion:1,myLabel:text('myLabel',12),myTitle:text('myTitle',30),rankSelector:text('rankSelector',512),accent:typeof v.accent==='string'&&/^#[0-9a-f]{6}$/i.test(v.accent)?v.accent:DEFAULT_SITE_CONFIG.accent,cardMinWidth:Number.isInteger(v.cardMinWidth)&&v.cardMinWidth>=140&&v.cardMinWidth<=320?v.cardMinWidth:DEFAULT_SITE_CONFIG.cardMinWidth,tvWebsite:adHttps(v.tvWebsite)||DEFAULT_SITE_CONFIG.tvWebsite};
}
