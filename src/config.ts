/* 服务器地址配置
 *
 * 支持多个候选地址：App 启动后会自动尝试，连不上的自动跳到下一个，
 * 并记住最后成功的那个（下次启动优先使用）。
 *
 *  1. Tailscale 地址：任何地方可用（手机需开着 Tailscale）
 *  2. 家里局域网：同一 Wi-Fi 下最快
 *
 * 以后迁到 Oracle 云服务器，把新域名加到第一个即可。
 */
export const API_CANDIDATES = [
  'https://likeflames.taild81f54.ts.net',
  'http://10.162.197.245:8000',
];
