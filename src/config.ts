/* 服务器地址配置
 *
 * 支持多个候选地址：App 启动后会自动尝试，连不上的自动跳到下一个，
 * 并记住最后成功的那个（下次启动优先使用）。
 *
 *  1. 云服务器（上海）：任何网络下都可用，电脑关机也不影响
 *  2. Tailscale 地址：备用（仅手机开着 Tailscale 时可用）
 *  3. 家里局域网：同一 Wi-Fi 下最快
 */
export const API_CANDIDATES = [
  'http://150.158.157.101',
  'https://likeflames.taild81f54.ts.net',
];
