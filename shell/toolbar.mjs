// 工具栏仅打开官网；账号管理继续放在官网“我的”中。
export function openOfficialSite(api=chrome){return api.tabs.create({url:'https://hongguoduanju.com/'});}
