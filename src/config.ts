/* 服务器地址配置
 *
 * 支持多个候选地址：App 启动后会自动尝试，连不上的自动跳到下一个，
 * 并记住最后成功的那个（下次启动优先使用）。
 *
 * 顺序有意义：
 * 1. HTTPS 域名 —— Let's Encrypt 证书（Caddy 自动续期），公共 WiFi 下也不会被劫持；
 * 2. HTTP IP   —— 域名或证书出问题时的兜底，直连服务器，能用但是明文。
 *
 * 两个都连不上时，界面会提示「连不上服务器」，不会白屏。
 */
export const API_CANDIDATES = [
  'https://run.likeflames.online',
  'http://150.158.157.101',
];

/** 访问口令在本地存储里的键名 */
export const STORAGE_TOKEN_KEY = 'rcToken';
